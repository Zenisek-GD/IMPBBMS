import { MfaEnrollment } from "../models/mfaModel.js";
import { twoFactorEnabled } from "../services/trustedDevices.js";
import { destroyLoginSession } from "../services/loginSession.js";

const allowed = (path) => [
  "/api/auth/me", "/api/auth/logout", "/api/auth/mfa",
  "/api/auth/login", "/api/public", "/api/activation",
].some((prefix) => path === prefix || path.startsWith(prefix + "/"));

export const requireMfaEnrollment = async (req, res, next) => {
  if (!req.session?.userId || req.path === "/api/auth/login" || req.path === "/api/auth/logout") return next();
  if (!(await twoFactorEnabled())) {
    req.session.mfaEnrollmentRequired = false;
    return next();
  }
  const enrollment = await MfaEnrollment.findOne({ where: { userId: req.session.userId } });
  if (req.session.mfaVerified && (!enrollment || req.session.mfaEnrollmentId !== enrollment.id)) {
    await destroyLoginSession(req, res);
    return res.status(401).json({ code: "MFA_REQUIRED", message: "Your authenticator was reset. Please log in again." });
  }
  if (enrollment?.status === "active") {
    // Never let enrollment on another browser, or an administrator reset,
    // silently turn a password-only session into a verified one.
    if (!req.session.mfaVerified || req.session.mfaEnrollmentId !== enrollment.id) {
      await destroyLoginSession(req, res);
      return res.status(401).json({ code: "MFA_REQUIRED", message: "Please log in again and verify your authenticator code." });
    }
    req.session.mfaEnrollmentRequired = false;
    return next();
  }
  req.session.mfaEnrollmentRequired = true;
  if (allowed(req.path)) return next();
  return res.status(403).json({
    code: "MFA_ENROLLMENT_REQUIRED",
    message: "Set up two-factor authentication before using the system.",
  });
};
