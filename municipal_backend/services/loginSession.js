import { SESSION_DURATION_MS, cookieOptions } from "./authPolicy.js";

export const regenerateSession = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
export const saveSession = (req) =>
  new Promise((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));

export const startLoginSession = async (req, user, { enrollment, trustedUntil = null, enrollmentRequired = false, verified = false } = {}) => {
  await regenerateSession(req);
  const now = Date.now();
  Object.assign(req.session, {
    userId: user.id, authAt: now, loginSessionExpiresAt: now + SESSION_DURATION_MS,
    twoFactorTrustedUntil: trustedUntil, mfaVerified: verified,
    mfaEnrollmentRequired: enrollmentRequired, mfaEnrollmentId: verified ? enrollment?.id : null,
    auditActor: { actorId: user.id, actorName: user.name, actorRole: user.Role?.key ?? null, ipAddress: req.ip },
  });
  req.session.cookie.maxAge = SESSION_DURATION_MS;
  await saveSession(req);
};

export const destroyLoginSession = async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy((err) => err ? reject(err) : resolve()));
  // Deliberately clear only authentication, never the separate trust cookies.
  res.clearCookie("connect.sid", cookieOptions());
};
