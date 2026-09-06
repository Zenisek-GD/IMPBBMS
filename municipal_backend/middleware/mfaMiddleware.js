import { MfaEnrollment } from "../models/mfaModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { roleRequiresTwoFactor } from "../services/authPolicy.js";
import { destroyLoginSession } from "../services/loginSession.js";

const allowed = (path) => [
  "/api/auth/me", "/api/auth/logout", "/api/auth/mfa",
  "/api/auth/login", "/api/public", "/api/activation",
].some((prefix) => path === prefix || path.startsWith(prefix + "/"));

export const requireMfaEnrollment = async (req, res, next) => {
  if (!req.session?.userId || req.path === "/api/auth/login" || req.path === "/api/auth/logout") return next();
  const user = await User.findByPk(req.session.userId, { include: [Role] });
  if (!user || user.status !== "active" || !user.Role ||
      (req.session.roleId != null && req.session.roleId !== user.roleId) ||
      (req.session.roleSessionVersion ?? 0) !== user.Role.sessionVersion) {
    await destroyLoginSession(req, res);
    return res.status(401).json({ code: "ROLE_SECURITY_CHANGED", message: "Your role or its security settings changed. Please log in again." });
  }
  if (!roleRequiresTwoFactor(user.Role)) {
    req.session.mfaEnrollmentRequired = false;
    req.session.mfaRequiredAtLogin = false;
    return next();
  }
  // Next-login changes preserve password-only sessions until their fixed deadline.
  // Forced changes are enforced above with the independent session revision.
  if (req.session.mfaRequiredAtLogin === false) return next();
  const enrollment = await MfaEnrollment.findOne({ where: { userId: user.id } });
  if (req.session.mfaVerified && (!enrollment || req.session.mfaEnrollmentId !== enrollment.id)) {
    await destroyLoginSession(req, res);
    return res.status(401).json({ code: "MFA_REQUIRED", message: "Your authenticator was reset. Please log in again." });
  }
  if (enrollment?.status === "active") {
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
