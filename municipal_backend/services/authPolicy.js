import crypto from "node:crypto";

export const SESSION_DURATION_MS = 30 * 60 * 1000;
export const TRUST_DURATION_MS = 30 * 60 * 1000;
export const PENDING_MFA_TTL_MS = 5 * 60 * 1000;
export const SESSION_EXPIRED_MESSAGE = "Your session has expired after 30 minutes. Please log in again.";
export const AUTH_POLICY_KEY = "security.twoFactorEnabled";
export const hashToken = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const credentialVersion = (user) => hashToken(user.password);
// Authenticated sessions must be invalidated when any access-bearing account
// attribute changes. MFA trust deliberately remains password-only so changing
// a profile detail does not silently invalidate an authenticator trust record.
export const credentialStamp = (user) => hashToken(JSON.stringify([
  user.password, user.email, user.roleId, user.departmentId, user.status,
]));
export const newDeviceToken = () => crypto.randomBytes(32).toString("hex");
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});
export const trustCookieName = (userId) =>
  `${process.env.NODE_ENV === "production" ? "__Host-" : ""}mfa_trust_${userId}`;

export const readDeviceToken = (req, userId) => {
  const name = trustCookieName(userId);
  const pairs = String(req.headers.cookie ?? "").split(";").map((part) => part.trim());
  const matches = pairs.filter((part) => part.startsWith(name + "="));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
};

export const trustedRecordValid = (row, user, enrollment, now = Date.now()) =>
  Boolean(row && enrollment?.status === "active" &&
    row.userId === user.id && row.enrollmentId === enrollment.id &&
    row.credentialVersion === credentialVersion(user) &&
    now < new Date(row.twoFactorTrustedUntil).getTime());

export const sessionExpired = (session, now = Date.now()) =>
  Boolean(session?.sessionExpired || (session?.userId &&
    (!Number.isFinite(session.loginSessionExpiresAt) || now >= session.loginSessionExpiresAt)));

export const sessionDetails = (req) => ({
  loginSessionExpiresAt: req.session.loginSessionExpiresAt ?? null,
  twoFactorTrustedUntil: req.session.twoFactorTrustedUntil ?? null,
  serverTime: Date.now(),
  mfaEnrollmentRequired: Boolean(req.session.mfaEnrollmentRequired),
  mfaVerified: Boolean(req.session.mfaVerified),
});
