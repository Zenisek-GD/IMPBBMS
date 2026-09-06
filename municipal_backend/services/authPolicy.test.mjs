import test from "node:test";
import assert from "node:assert/strict";
import {
  TRUST_DURATION_MS, SESSION_DURATION_MS, credentialVersion, newDeviceToken,
  hashToken, trustedRecordValid, readDeviceToken, trustCookieName, sessionExpired, cookieOptions,
} from "./authPolicy.js";

const at = Date.parse("2030-01-01T10:00:00Z");
const user = { id: 1, password: "stored-bcrypt-hash" };
const enrollment = { id: 7, status: "active" };
const row = {
  userId: 1, enrollmentId: 7, credentialVersion: credentialVersion(user),
  verifiedAt: new Date(at), twoFactorTrustedUntil: new Date(at + TRUST_DURATION_MS),
};

test("trust survives relogin, is account/enrollment-specific, and expires at the exact boundary", () => {
  assert.equal(TRUST_DURATION_MS, 1_800_000);
  assert.equal(trustedRecordValid(row, user, enrollment, at + 15 * 60_000), true);
  assert.equal(trustedRecordValid(row, user, enrollment, at + TRUST_DURATION_MS - 1), true);
  assert.equal(trustedRecordValid(row, user, enrollment, at + TRUST_DURATION_MS), false);
  assert.equal(trustedRecordValid(row, { ...user, id: 2 }, enrollment, at), false);
  assert.equal(trustedRecordValid(row, { ...user, password: "changed" }, enrollment, at), false);
  assert.equal(trustedRecordValid(row, user, { ...enrollment, id: 8 }, at), false);
  assert.equal(trustedRecordValid(row, user, { ...enrollment, status: "pending" }, at), false);
  assert.equal(new Date(row.twoFactorTrustedUntil).getTime(), at + TRUST_DURATION_MS);
});

test("the authenticated deadline is independent of trust and fails closed", () => {
  const session = { userId: 1, loginSessionExpiresAt: at + 15 * 60_000 + SESSION_DURATION_MS, twoFactorTrustedUntil: at + TRUST_DURATION_MS };
  assert.equal(sessionExpired(session, at + TRUST_DURATION_MS), false);
  assert.equal(sessionExpired(session, session.loginSessionExpiresAt - 1), false);
  assert.equal(sessionExpired(session, session.loginSessionExpiresAt), true);
  assert.equal(sessionExpired({ userId: 1 }, at), true);
  assert.equal(sessionExpired({ userId: 1, loginSessionExpiresAt: "tomorrow" }, at), true);
});

test("browser tokens are random, hashed and parsed strictly; another browser has none", () => {
  const first = newDeviceToken();
  const second = newDeviceToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.notEqual(hashToken(first), first);
  const name = trustCookieName(1);
  assert.equal(readDeviceToken({ headers: { cookie: name + "=" + first } }, 1), first);
  assert.equal(readDeviceToken({ headers: {} }, 1), null);
  assert.equal(readDeviceToken({ headers: { cookie: name + "=" + first } }, 2), null);
  assert.equal(readDeviceToken({ headers: { cookie: name + "=invalid" } }, 1), null);
  assert.equal(readDeviceToken({ headers: { cookie: name + "=" + first + "; " + name + "=" + second } }, 1), null);
});

test("production trust cookies are host-only, HTTP-only, Secure and SameSite", () => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(cookieOptions().secure, true);
    assert.equal(cookieOptions().httpOnly, true);
    assert.equal(cookieOptions().sameSite, "lax");
    assert.equal(cookieOptions().path, "/");
    assert.equal(cookieOptions().domain, undefined);
    assert.equal(trustCookieName(1), "__Host-mfa_trust_1");
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
});
