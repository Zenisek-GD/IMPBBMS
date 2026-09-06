import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import express from "express";
import session from "express-session";
import "../config/env.js";

// An isolated throwaway schema. Never sync, seed, or delete the configured app DB.
const scratch = "impbbms_auth_test_" + crypto.randomBytes(8).toString("hex");
process.env.DB_NAME = scratch;
process.env.NODE_ENV = "test";
process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

test("HTTP authentication security against isolated MySQL", { timeout: 600_000 }, async (t) => {
  const adminDb = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root", password: process.env.DB_PASSWORD ?? "",
  });
  assert.match(scratch, /^impbbms_auth_test_[a-f0-9]{16}$/);
  await adminDb.query("CREATE DATABASE `" + scratch + "`");
  let server;
  let sequelize;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (sequelize) await sequelize.close();
    assert.match(scratch, /^impbbms_auth_test_[a-f0-9]{16}$/);
    await adminDb.query("DROP DATABASE `" + scratch + "`");
    await adminDb.end();
  });

  const models = await import("../models/index.js");
  sequelize = models.sequelize;
  const { default: router } = await import("../routes/index.js");
  const { wrapRouterStack, errorHandler } = await import("../middleware/asyncHandler.js");
  const { DatabaseSessionStore, sweepAuthExpirations } = await import("../services/sessionStore.js");
  const { encryptSecret } = await import("../models/mfaModel.js");
  const { generateSecret, generateToken } = await import("../services/totp.js");
  const { trustCookieName, hashToken } = await import("../services/authPolicy.js");
  const { clearRateLimit } = await import("../middleware/rateLimitMiddleware.js");
  await sequelize.sync();
  await t.test("additive role migration preserves legacy OFF and repeated runs preserve role choices", async () => {
    const { migrateRoleSecurity } = await import("../services/migrateRoleSecurity.js");
    const legacyRole = await models.Role.create({ key: "legacy", name: "Legacy Role" });
    await models.SystemSetting.create({ key: "security.twoFactorEnabled", value: "false" });
    const qi = sequelize.getQueryInterface();
    for (const column of ["two_factor_required", "twoFactorVersion", "sessionVersion"]) {
      await qi.removeColumn(models.Role.getTableName(), column);
    }
    for (const column of ["roleId", "roleVersion"]) await qi.removeColumn(models.TrustedDevice.getTableName(), column);
    await migrateRoleSecurity();
    await legacyRole.reload();
    assert.equal(legacyRole.twoFactorRequired, false);
    assert.equal(legacyRole.twoFactorVersion, 0);
    await legacyRole.update({ twoFactorRequired: true, twoFactorVersion: 3 });
    await migrateRoleSecurity();
    await legacyRole.reload();
    assert.equal(legacyRole.twoFactorRequired, true);
    assert.equal(legacyRole.twoFactorVersion, 3);
    assert.equal(await models.Permission.count({ where: { key: "manage_two_factor_authentication" } }), 1);
    await legacyRole.destroy();
  });
  const role = await models.Role.create({ name: "System Administrator", key: "systemAdministrator" });
  const externalRole = await models.Role.create({ name: "Vendor", key: "vendor" });
  const password = "IntegrationPassw0rd!";
  const fixture = async (suffix, enrolled = true, roleId = role.id) => {
    const user = await models.User.create({ name: "Security Test " + suffix, email: suffix + "@example.test", password, roleId });
    const secret = generateSecret();
    if (enrolled) await models.MfaEnrollment.create({
      userId: user.id, encryptedSecret: encryptSecret(secret), status: "active", confirmedAt: new Date(),
    });
    return { user, secret };
  };
  const store = new DatabaseSessionStore();
  const app = express();
  app.use(express.json());
  app.use(session({ secret: crypto.randomBytes(32).toString("hex"), store, resave: false,
    saveUninitialized: false, cookie: { maxAge: 300_000, httpOnly: true, sameSite: "lax" } }));
  wrapRouterStack(router);
  app.use(router);
  app.use(errorHandler);
  server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = (copy) => new Map(copy);
  const request = async (jar, method, path, body, headers = {}) => {
    const response = await fetch(base + "/api" + path, {
      method, headers: { "content-type": "application/json",
        cookie: [...jar].map(([key, value]) => key + "=" + value).join("; "), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookies = response.headers.getSetCookie();
    for (const cookie of cookies) {
      const pair = cookie.split(";")[0];
      const i = pair.indexOf("=");
      if (pair.slice(i + 1)) jar.set(pair.slice(0, i), pair.slice(i + 1));
      else jar.delete(pair.slice(0, i));
    }
    return { status: response.status, body: await response.json(), cookies, headers: response.headers };
  };
  const login = (jar, person, suppliedPassword = password) =>
    request(jar, "POST", "/auth/login", { email: person.user.email, password: suppliedPassword });
  const verify = (jar, person) =>
    request(jar, "POST", "/auth/mfa/challenge", { token: generateToken(person.secret) });
  const signIn = async (jar, person) => {
    assert.equal((await login(jar, person)).body.mfaRequired, true);
    const result = await verify(jar, person);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result;
  };
  t.beforeEach(() => {
    for (const bucket of ["mfaChallenge", "login", "mfaEnroll"]) clearRateLimit(bucket, "127.0.0.1");
  });
  const MINUTE = 60_000;
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2030-01-01T10:00:00Z") });

  await t.test("logout/relogin skips OTP on the same browser without sliding trust; other browsers still challenge", async () => {
    const person = await fixture("trusted");
    const jar = browser();
    const denied = await login(jar, person, "wrong");
    assert.equal(denied.status, 401);
    const pending = await login(jar, person);
    assert.equal(pending.body.mfaRequired, true);
    assert.equal((await request(jar, "GET", "/security/authentication")).status, 401);
    const bad = await request(jar, "POST", "/auth/mfa/challenge", { token: "invalid" });
    assert.equal(bad.status, 401);
    const verified = await verify(jar, person);
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const firstExpiry = verified.body.twoFactorTrustedUntil;
    assert.equal(firstExpiry, Date.now() + 30 * MINUTE);
    assert.equal(verified.body.loginSessionExpiresAt, firstExpiry);
    assert.ok(verified.cookies.some((cookie) => cookie.includes(trustCookieName(person.user.id)) && /HttpOnly/.test(cookie) && /SameSite=Lax/i.test(cookie)));
    const trustedRow = await models.TrustedDevice.findOne({ where: { userId: person.user.id } });
    assert.equal(trustedRow.tokenHash, hashToken(jar.get(trustCookieName(person.user.id))));
    assert.notEqual(trustedRow.tokenHash, jar.get(trustCookieName(person.user.id)));

    t.mock.timers.tick(10 * MINUTE);
    const oldLogin = browser(jar);
    assert.equal((await request(jar, "POST", "/auth/logout")).status, 200);
    assert.ok(jar.has(trustCookieName(person.user.id)));
    assert.equal((await request(oldLogin, "GET", "/auth/me")).status, 401);
    t.mock.timers.tick(5 * MINUTE);
    const relogin = await login(jar, person);
    assert.equal(relogin.body.mfaRequired, undefined);
    assert.equal(relogin.body.twoFactorTrustedUntil, firstExpiry);
    assert.equal(relogin.body.loginSessionExpiresAt, Date.now() + 30 * MINUTE);

    const other = browser();
    assert.equal((await login(other, person)).body.mfaRequired, true);
    const forged = browser();
    forged.set(trustCookieName(person.user.id), "0".repeat(64));
    assert.equal((await login(forged, person)).body.mfaRequired, true);
    t.mock.timers.tick(15 * MINUTE);
    const stillAuthenticated = await request(jar, "GET", "/auth/me");
    assert.equal(stillAuthenticated.status, 200);
    assert.equal(stillAuthenticated.body.loginSessionExpiresAt, relogin.body.loginSessionExpiresAt);
    assert.equal(stillAuthenticated.body.twoFactorTrustedUntil, firstExpiry);
    const boundary = browser([[trustCookieName(person.user.id), jar.get(trustCookieName(person.user.id))]]);
    assert.equal((await login(boundary, person)).body.mfaRequired, true);

    t.mock.timers.tick(5 * MINUTE);
    await request(jar, "POST", "/auth/logout");
    assert.equal((await login(jar, person)).body.mfaRequired, true);
    const renewed = await verify(jar, person);
    assert.equal(renewed.status, 200);
    assert.equal(renewed.body.twoFactorTrustedUntil, Date.now() + 30 * MINUTE);
    assert.ok(renewed.body.twoFactorTrustedUntil > firstExpiry);
  });

  await t.test("fixed 30-minute server expiry blocks every protected path and audits automatic logout", async () => {
    const person = await fixture("expiry");
    const jar = browser();
    const signedIn = await signIn(jar, person);
    const deadline = signedIn.body.loginSessionExpiresAt;
    t.mock.timers.tick(29 * MINUTE);
    assert.equal((await request(jar, "GET", "/auth/me")).body.loginSessionExpiresAt, deadline);
    assert.equal((await request(jar, "PATCH", "/auth/preferences", { sidebarCollapsed: true })).status, 200);
    const rawCookie = jar.get("connect.sid");
    const copy = browser(jar);
    t.mock.timers.tick(MINUTE);
    // Simulates an API client retaining a cookie and sending its own fake clock.
    const expired = await request(jar, "GET", "/security/authentication", undefined, { "x-client-time": "0" });
    assert.equal(expired.status, 401);
    assert.equal(expired.body.code, "SESSION_EXPIRED");
    assert.equal(expired.body.message, "Your session has expired after 30 minutes. Please log in again.");
    assert.match(expired.headers.get("cache-control"), /no-store/);
    assert.equal((await request(copy, "PATCH", "/auth/preferences", { sidebarCollapsed: false })).status, 401);
    jar.set("connect.sid", rawCookie);
    assert.equal((await login(jar, person)).body.mfaRequired, true);
    await sweepAuthExpirations();
    const events = await models.AuditLog.findAll({ where: { actorId: person.user.id } });
    assert.equal(events.filter((row) => row.actionType === "auth.session.expired").length, 1);
    assert.equal(events.filter((row) => row.actionType === "auth.logout.automatic").length, 1);
    assert.equal(await models.TrustedDevice.count({ where: { userId: person.user.id } }), 0);
  });


  const configure = async (jar, changes, options = {}) => {
    const updates = [];
    for (const [targetRole, required] of changes) {
      await targetRole.reload();
      updates.push({ id: targetRole.id, twoFactorRequired: required, expectedVersion: targetRole.twoFactorVersion });
    }
    return request(jar, "PATCH", "/security/authentication", {
      roles: updates, confirmDisable: true, applyMode: "nextLogin", ...options,
    });
  };

  await t.test("dynamic roles, independent policy, confirmation, permissions, and password-only expiry", async () => {
    const admin = await fixture("policy");
    const jar = browser();
    await signIn(jar, admin);
    const custom = await models.Role.create({ key: "customProcurement", name: "Custom Procurement Office" });
    const policy = await request(jar, "GET", "/security/authentication");
    assert.equal(policy.body.roles.length, await models.Role.count());
    assert.ok(policy.body.roles.some((entry) => entry.id === custom.id && entry.name === custom.name));
    const payload = { roles: [{ id: externalRole.id, twoFactorRequired: false, expectedVersion: 0 }] };
    assert.equal((await request(jar, "PATCH", "/security/authentication", payload)).body.code, "CONFIRMATION_REQUIRED");
    assert.equal((await request(jar, "PATCH", "/security/authentication", { ...payload, confirmDisable: true },
      { origin: "https://attacker.example" })).status, 403);
    const adminTrust = await models.TrustedDevice.findOne({ where: { userId: admin.user.id } });
    assert.equal((await configure(jar, [[externalRole, false]])).status, 200);
    assert.ok(await models.TrustedDevice.findByPk(adminTrust.id));
    assert.equal((await role.reload()).twoFactorRequired, true);
    assert.equal((await custom.reload()).twoFactorRequired, true);

    const vendor = await fixture("vendor", true, externalRole.id);
    const externalBrowser = browser();
    const result = await login(externalBrowser, vendor);
    assert.equal(result.body.mfaRequired, undefined);
    assert.equal(result.body.loginSessionExpiresAt, Date.now() + 30 * MINUTE);
    assert.equal(result.body.twoFactorTrustedUntil, null);
    assert.equal(result.body.mfaEnrollmentRequired, false);
    const unenrolled = await fixture("vendorUnenrolled", false, externalRole.id);
    const plain = await login(browser(), unenrolled);
    assert.equal(plain.body.mfaEnrollmentRequired, false);
    assert.equal(plain.body.mfaRequired, undefined);
    assert.equal((await request(externalBrowser, "GET", "/security/authentication")).status, 403);
    assert.equal((await configure(externalBrowser, [[externalRole, true]])).status, 403);
    assert.equal((await request(externalBrowser, "POST", "/auth/mfa/disable", {})).status, 403);
    assert.equal((await request(externalBrowser, "POST", "/auth/mfa/enroll", {})).status, 403);

    const permission = await models.Permission.findOne({ where: { key: "manage_two_factor_authentication" } });
    await models.RolePermission.create({ roleId: externalRole.id, permissionId: permission.id });
    assert.equal((await request(externalBrowser, "GET", "/security/authentication")).status, 200);
    assert.equal((await configure(externalBrowser, [[custom, false]])).status, 200);
    await models.RolePermission.destroy({ where: { roleId: externalRole.id, permissionId: permission.id } });
    assert.equal((await request(externalBrowser, "GET", "/security/authentication")).status, 403);
    t.mock.timers.tick(30 * MINUTE);
    assert.equal((await request(externalBrowser, "GET", "/auth/me")).body.code, "SESSION_EXPIRED");
  });

  await t.test("next-login enable preserves existing sessions, revokes only that role's trust, and challenges new logins", async () => {
    const admin = await fixture("nextLoginAdmin");
    const jar = browser();
    await signIn(jar, admin);
    const vendor = await fixture("nextLoginVendor", true, externalRole.id);
    const active = browser();
    const old = await login(active, vendor);
    assert.equal((await configure(jar, [[externalRole, true]], { applyMode: undefined })).body.code, "APPLY_MODE_REQUIRED");
    assert.equal((await configure(jar, [[externalRole, true]])).status, 200);
    const retained = await request(active, "GET", "/auth/me");
    assert.equal(retained.status, 200);
    assert.equal(retained.body.loginSessionExpiresAt, old.body.loginSessionExpiresAt);
    const pending = browser();
    assert.equal((await login(pending, vendor)).body.mfaRequired, true);
    assert.equal((await verify(pending, vendor)).status, 200);
    const trust = await models.TrustedDevice.findOne({ where: { userId: vendor.user.id } });
    assert.ok(trust);
    const adminTrust = await models.TrustedDevice.findOne({ where: { userId: admin.user.id } });
    assert.equal((await configure(jar, [[externalRole, false]])).status, 200);
    assert.equal(await models.TrustedDevice.findByPk(trust.id), null);
    assert.ok(await models.TrustedDevice.findByPk(adminTrust.id));
    await request(pending, "POST", "/auth/logout");
    const off = await login(pending, vendor);
    assert.equal(off.body.mfaRequired, undefined);
    assert.equal((await configure(jar, [[externalRole, true]])).status, 200);
    await request(pending, "POST", "/auth/logout");
    assert.equal((await login(pending, vendor)).body.mfaRequired, true);
    // A role switched OFF while a challenge is pending now accepts the password proof.
    assert.equal((await configure(jar, [[externalRole, false]])).status, 200);
    assert.equal((await request(pending, "POST", "/auth/mfa/challenge", {})).body.mfaVerified, false);
  });

  await t.test("force reauthentication revokes all role sessions, blocks stale writes, and preserves other roles", async () => {
    const admin = await fixture("forceAdmin");
    const jar = browser();
    await signIn(jar, admin);
    const vendor = await fixture("forceVendor", true, externalRole.id);
    const first = browser();
    const second = browser();
    await login(first, vendor);
    await login(second, vendor);
    const sid = decodeURIComponent(first.get("connect.sid")).slice(2).split(".")[0];
    const stale = (await models.LoginSession.findByPk(hashToken(sid))).data;
    const result = await configure(jar, [[externalRole, true]], { applyMode: "forceReauthentication" });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const tombstone = await models.LoginSession.findByPk(hashToken(sid));
    assert.equal(tombstone.endReason, "rolePolicy");
    await new Promise((resolve, reject) => store.set(sid, stale, (error) => error ? reject(error) : resolve()));
    assert.equal((await request(first, "GET", "/auth/me")).status, 401);
    assert.equal((await request(second, "GET", "/auth/me")).status, 401);
    assert.equal((await request(jar, "GET", "/auth/me")).status, 200);
    assert.equal((await login(first, vendor)).body.mfaRequired, true);
    const event = await models.AuditLog.findOne({
      where: { entityRef: "role", entityId: externalRole.id, actionType: "auth.mfa.role.enabled" },
      order: [["sequence", "DESC"]],
    });
    assert.equal(event.beforeState.twoFactorRequired, false);
    assert.equal(event.afterState.twoFactorRequired, true);
    assert.equal(event.actorId, admin.user.id);
    assert.equal(event.afterState.revokedSessions >= 2, true);
  });

  await t.test("bulk updates reject stale or invalid roles and roll back if the audit cannot be written", async () => {
    const admin = await fixture("bulkAdmin");
    const jar = browser();
    await signIn(jar, admin);
    const a = await models.Role.create({ key: "bulkA", name: "Bulk A" });
    const b = await models.Role.create({ key: "bulkB", name: "Bulk B" });
    const stale = { roles: [{ id: a.id, twoFactorRequired: false, expectedVersion: 0 }], confirmDisable: true };
    assert.equal((await configure(jar, [[a, false], [b, false]])).status, 200);
    assert.equal((await request(jar, "PATCH", "/security/authentication", stale)).status, 409);
    assert.equal((await request(jar, "PATCH", "/security/authentication", { roles: [
      { id: a.id, twoFactorRequired: true, expectedVersion: 1 },
      { id: 2147483647, twoFactorRequired: true, expectedVersion: 0 },
    ], applyMode: "nextLogin" })).status, 400);
    assert.equal((await a.reload()).twoFactorRequired, false);
    assert.equal((await request(jar, "PATCH", "/security/authentication", { twoFactorEnabled: false, confirmDisable: true })).status, 400);
    assert.equal((await request(jar, "PATCH", "/security/authentication", { ...stale, roles: [stale.roles[0], stale.roles[0]] })).status, 400);
    models.AuditLog.addHook("beforeCreate", "rejectRoleAudit", (entry) => {
      if (entry.actionType.startsWith("auth.mfa.role.")) throw new Error("Simulated audit failure");
    });
    try {
      assert.equal((await configure(jar, [[a, true], [b, true]])).status, 500);
      assert.equal((await a.reload()).twoFactorRequired, false);
      assert.equal((await b.reload()).twoFactorRequired, false);
      assert.equal(a.twoFactorVersion, 1);
    } finally { models.AuditLog.removeHook("beforeCreate", "rejectRoleAudit"); }
    const outcomes = await Promise.all([
      request(jar, "PATCH", "/security/authentication", { roles: [{ id: a.id, twoFactorRequired: true, expectedVersion: 1 }], applyMode: "nextLogin" }),
      request(jar, "PATCH", "/security/authentication", { roles: [{ id: a.id, twoFactorRequired: true, expectedVersion: 1 }], applyMode: "nextLogin" }),
    ]);
    assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]);
    const events = await models.AuditLog.findAll({ where: { actionType: "auth.mfa.role.disabled", entityRef: "role" } });
    assert.ok(events.some((entry) => entry.entityId === a.id));
    assert.ok(events.some((entry) => entry.entityId === b.id));
    const { verifyChain } = await import("../services/auditLog.js");
    assert.equal((await verifyChain()).intact, true);
  });

  await t.test("role reassignment invalidates the session and cannot carry browser trust across roles", async () => {
    const person = await fixture("reassignment");
    const jar = browser();
    await signIn(jar, person);
    await person.user.update({ roleId: externalRole.id });
    assert.equal((await request(jar, "GET", "/auth/me")).status, 401);
    assert.equal((await login(jar, person)).body.mfaRequired, true);
  });

  await t.test("mandatory enrollment creates trust only after a correct code; password changes revoke it", async () => {
    const person = await fixture("enrollment", false);
    const jar = browser();
    const initial = await login(jar, person);
    assert.equal(initial.body.mfaEnrollmentRequired, true);
    assert.equal((await request(jar, "GET", "/security/authentication")).body.code, "MFA_ENROLLMENT_REQUIRED");
    const enrollment = await request(jar, "POST", "/auth/mfa/enroll");
    assert.equal(enrollment.status, 200);
    person.secret = enrollment.body.secret;
    t.mock.timers.tick(MINUTE);
    const confirmed = await request(jar, "POST", "/auth/mfa/enroll/confirm", { token: generateToken(person.secret) });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.loginSessionExpiresAt, Date.now() + 30 * MINUTE);
    assert.equal(confirmed.body.twoFactorTrustedUntil, Date.now() + 30 * MINUTE);
    const codes = confirmed.body.recoveryCodes;
    assert.equal((await request(jar, "GET", "/security/authentication")).status, 200);
    await request(jar, "POST", "/auth/logout");
    await person.user.update({ password: "NewPassw0rd!", passwordChangedAt: new Date() });
    const changed = await login(jar, person, "NewPassw0rd!");
    assert.equal(changed.body.mfaRequired, true);
    const recovery = await request(jar, "POST", "/auth/mfa/challenge", { recoveryCode: codes[0] });
    assert.equal(recovery.status, 200);
    assert.equal(recovery.body.twoFactorTrustedUntil, null);
  });

  await t.test("concurrent code replay succeeds once, failed attempts lock the account, pending expiry is exact", async () => {
    for (const bucket of ["mfaChallenge", "login"]) clearRateLimit(bucket, "127.0.0.1");
    const person = await fixture("replay");
    const first = browser();
    const second = browser();
    await login(first, person);
    await login(second, person);
    const outcomes = await Promise.all([verify(first, person), verify(second, person)]);
    assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 401]);
    const pending = browser();
    await login(pending, person);
    for (let i = 0; i < 5; i++) await request(pending, "POST", "/auth/mfa/challenge", { token: "bad" });
    const enrollment = await models.MfaEnrollment.findOne({ where: { userId: person.user.id } });
    assert.ok(enrollment.lockedUntil > new Date());
    t.mock.timers.tick(5 * MINUTE);
    const expired = await verify(pending, person);
    assert.equal(expired.status, 440);
  });

  const log = JSON.stringify((await models.AuditLog.findAll()).map((entry) => entry.toJSON()));
  assert.ok(!log.includes(password));
  assert.ok(!log.includes("IntegrationPassw0rd"));
  assert.ok(!log.includes('"encryptedSecret"'));
  assert.ok(log.includes("auth.mfa.trust.used"));
  assert.ok(log.includes("auth.mfa.role.disabled"));
});
