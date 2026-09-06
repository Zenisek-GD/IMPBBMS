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

test("HTTP authentication security against isolated MySQL", { timeout: 120_000 }, async (t) => {
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

  await t.test("policy defaults ON, only admin can change it, OFF requires confirmation and keeps session expiry", async () => {
    const admin = await fixture("policy");
    const jar = browser();
    await signIn(jar, admin);
    assert.equal((await request(jar, "GET", "/security/authentication")).body.twoFactorEnabled, true);
    assert.equal((await request(jar, "PATCH", "/security/authentication", { twoFactorEnabled: false })).body.code, "CONFIRMATION_REQUIRED");
    assert.equal((await request(jar, "PATCH", "/security/authentication", { twoFactorEnabled: false, confirmDisable: true }, { origin: "https://attacker.example" })).status, 403);
    assert.equal((await request(jar, "PATCH", "/security/authentication", { twoFactorEnabled: false, confirmDisable: true })).status, 200);
    assert.equal(await models.TrustedDevice.count(), 0);

    const vendor = await fixture("vendor", true, externalRole.id);
    const externalBrowser = browser();
    const result = await login(externalBrowser, vendor);
    assert.equal(result.body.mfaRequired, undefined);
    assert.equal(result.body.loginSessionExpiresAt, Date.now() + 30 * MINUTE);
    assert.equal(result.body.mfaEnrollmentRequired, false);
    assert.equal((await request(externalBrowser, "PATCH", "/security/authentication", { twoFactorEnabled: true })).status, 403);
    assert.equal((await request(jar, "PATCH", "/security/authentication", { twoFactorEnabled: true })).status, 200);
    assert.equal((await request(externalBrowser, "GET", "/auth/me")).body.code, "MFA_REQUIRED");
    assert.equal((await login(externalBrowser, vendor)).body.mfaRequired, true);
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
  assert.ok(log.includes("auth.mfa.policy.disabled"));
});
