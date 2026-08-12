import express from "express";
import {
  login,
  logout,
  me,
  requestPasswordChange,
  verifyPasswordChangeCode,
  changeOwnPassword,
  requestProfileUpdate,
  verifyProfileUpdateCode,
  updateProfile,
  updatePreferences,
} from "../controllers/authController.js";
import {
  forgotPassword,
  verifyResetCode,
  resetPassword,
} from "../controllers/passwordResetController.js";
import {
  getMfaStatus,
  beginEnrollment,
  confirmEnrollment,
  regenerateRecoveryCodes,
  disableMfa,
  verifyLoginChallenge,
} from "../controllers/mfaController.js";
import { rateLimit } from "../middleware/rateLimitMiddleware.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", rateLimit({ bucket: "login", max: 10 }), login);
router.post("/logout", logout);
router.get("/me", me);

// ── Two-factor authentication ────────────────────────────────────────────────
// The sign-in challenge is deliberately NOT behind requireAuth: at this point
// the caller has proved the password but has no session, which is the whole
// point. It is guarded instead by the pending state in the session and a tight
// rate limit — six digits is a small enough space that unlimited guessing would
// defeat it in an afternoon.
router.post("/mfa/challenge", rateLimit({ bucket: "mfaChallenge", max: 12 }), verifyLoginChallenge);

// Everything below manages a *signed-in* user's own second factor.
router.get("/mfa", requireAuth, getMfaStatus);
router.post("/mfa/enroll", requireAuth, rateLimit({ bucket: "mfaEnroll", max: 20 }), beginEnrollment);
router.post("/mfa/enroll/confirm", requireAuth, rateLimit({ bucket: "mfaEnroll", max: 20 }), confirmEnrollment);
router.post("/mfa/recovery-codes", requireAuth, rateLimit({ bucket: "mfaEnroll", max: 20 }), regenerateRecoveryCodes);

// Switching it off needs the password *and* a current code — either alone would
// let whoever is standing at an unlocked screen remove the protection.
router.post("/mfa/disable", requireAuth, rateLimit({ bucket: "mfaEnroll", max: 20 }), disableMfa);

// Personal display settings — theme and sidebar state. Rate limited only
// lightly: toggling a theme is cheap and legitimate to do repeatedly.
router.patch("/preferences", rateLimit({ bucket: "preferences", max: 120 }), updatePreferences);

// ── Password change (requirement 10) ────────────────────────────────────────
// Three steps: prove you know the current password and a code is sent, submit the
// code for a one-time ticket, then set the new password with that ticket.
router.post(
  "/change-password/request",
  rateLimit({ bucket: "changePasswordRequest", max: 10 }),
  requestPasswordChange
);
router.post(
  "/change-password/verify",
  rateLimit({ bucket: "changePasswordVerify", max: 20 }),
  verifyPasswordChangeCode
);
router.post("/change-password", rateLimit({ bucket: "changePassword", max: 10 }), changeOwnPassword);

// ── Profile change (requirement 14) ─────────────────────────────────────────
router.post("/profile/request", rateLimit({ bucket: "profileRequest", max: 10 }), requestProfileUpdate);
router.post("/profile/verify", rateLimit({ bucket: "profileVerify", max: 20 }), verifyProfileUpdateCode);
router.patch("/profile", rateLimit({ bucket: "profileUpdate", max: 10 }), updateProfile);

// ── Password reset (requirement 9) ──────────────────────────────────────────
// Same three-step shape as the change flow above, minus the current password —
// the whole premise is that the user does not have it. The code sent to the
// registered address is what stands in for it.
//
// The former link-based reset (GET /reset-password/verify with a token in the
// query string) is gone. A code the user types is verified against a challenge
// tied to their account; a link is a bearer credential that lives in mail
// clients, proxy logs and browser history, and requirement 9 asks for a code.
router.post("/forgot-password", rateLimit({ bucket: "forgot", max: 5 }), forgotPassword);
router.post("/forgot-password/verify", rateLimit({ bucket: "resetVerify", max: 20 }), verifyResetCode);
router.post("/reset-password", rateLimit({ bucket: "reset", max: 10 }), resetPassword);

export default router;
