import { User, THEME_PREFERENCES } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { Permission } from "../models/permissionModel.js";
import { Department } from "../models/departmentModel.js";
import { validatePassword } from "./passwordResetController.js";
import { recordAudit, AUDIT_ACTIONS } from "../services/auditLog.js";
import { clearRateLimit } from "../middleware/rateLimitMiddleware.js";
import { issueOtp, verifyOtp, consumeTicket, serializeChallenge, maskEmail } from "../services/otp.js";
import { sendPasswordChangedEmail } from "../services/mailer.js";

// ── Session timeouts ──────────────────────────────────────────────────────────
// Admin-side roles handle budgets, contracts, and user accounts — a session
// left open on an unattended workstation is a real risk. Thirty minutes of
// inactivity is the common ceiling for privileged web applications.
//
// Vendors and observers interact less frequently and from less controlled
// environments (personal laptops, phones), so their session lives longer.
const ADMIN_SESSION_MS  = 1000 * 60 * 30;  // 30 minutes
const DEFAULT_SESSION_MS = 1000 * 60 * 60 * 8; // 8 hours (unchanged)

// Roles whose sessions keep the longer timeout. Every role not listed here
// gets the shorter admin timeout.
const EXTERNAL_ROLES = ["vendor", "observer"];

const sessionTtlForRole = (roleKey) =>
  EXTERNAL_ROLES.includes(roleKey) ? DEFAULT_SESSION_MS : ADMIN_SESSION_MS;

// Permissions travel with the session user so the UI can hide actions the
// caller cannot perform. The server still enforces them independently — this
// is presentation only.
const serializeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.Role.key,
  roleName: user.Role.name,
  departmentId: user.departmentId ?? null,
  departmentName: user.Department?.name ?? null,
  permissions: (user.Role.Permissions ?? []).map((permission) => permission.key),
  // Appearance travels with the account, so the UI can restore this officer's
  // own theme rather than whatever the last person on this browser chose.
  themePreference: user.themePreference ?? "light",
  sidebarCollapsed: Boolean(user.sidebarCollapsed),
  // Sent so the frontend can run an idle-timeout countdown that matches the
  // server's cookie lifetime, rather than having to guess or hard-code it.
  sessionTimeoutMs: sessionTtlForRole(user.Role.key),
});

const userIncludes = [{ model: Role, include: [Permission] }, { model: Department }];

export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalised = String(email).trim().toLowerCase();
  const user = await User.findOne({ where: { email: normalised }, include: userIncludes });

  // Evaluated before the status check so the two failure modes below can be told
  // apart. Guarded against a missing user because comparePassword needs a hash.
  const passwordMatches = user ? await user.comparePassword(password) : false;

  if (!user || !passwordMatches) {
    // Section 2.2: denied actions are recorded too, not just successes.
    await recordAudit({
      actionType: AUDIT_ACTIONS.LOGIN_FAILED,
      outcome: "denied",
      entityRef: "auth",
      summary: `Failed sign-in attempt for ${normalised}`,
      actorName: normalised,
      ipAddress: req.ip,
      // Recorded so an auditor can distinguish "someone is guessing at an address
      // that does not exist" from "someone is guessing at a real account".
      afterState: { reason: user ? "wrongPassword" : "noSuchAccount" },
    });
    return res.status(401).json({ message: "Invalid email or password." });
  }

  // The password was right but the account is not usable. Saying which is not a
  // disclosure: the caller has already proved they hold the credential, so they
  // are either the account holder or someone who already knows it. Telling them
  // "invalid email or password" here would send a bidder who has not yet
  // activated round in circles resetting a password that was never the problem.
  if (user.status === "pendingActivation") {
    await recordAudit({
      actionType: AUDIT_ACTIONS.LOGIN_FAILED,
      outcome: "denied",
      entityRef: "auth",
      entityId: user.id,
      summary: `Sign-in refused for ${user.email} — account has not been activated`,
      actorName: user.name,
      ipAddress: req.ip,
      afterState: { reason: "pendingActivation" },
    });
    return res.status(403).json({
      message:
        "This account has not been activated yet. Open the activation link in the invitation " +
        "email we sent you. If it has expired, ask the BAC Secretariat to send a new one.",
      status: "pendingActivation",
    });
  }

  if (user.status !== "active") {
    await recordAudit({
      actionType: AUDIT_ACTIONS.LOGIN_FAILED,
      outcome: "denied",
      entityRef: "auth",
      entityId: user.id,
      summary: `Sign-in refused for ${user.email} — account is ${user.status}`,
      actorName: user.name,
      ipAddress: req.ip,
      afterState: { reason: user.status },
    });
    return res.status(403).json({
      message: "This account has been deactivated. Contact the System Administrator.",
      status: user.status,
    });
  }

  // Shorten the cookie lifetime for admin-side roles. The global session
  // middleware sets an 8-hour default; overriding it here per-session means
  // vendors keep the full window while officers are logged out sooner.
  req.session.cookie.maxAge = sessionTtlForRole(user.Role.key);
  req.session.userId = user.id;

  // The password was right, so this attempt was not an attack — release the
  // budget it consumed. Failures below still accumulate against the ceiling.
  clearRateLimit("login", req.ip);

  await recordAudit({
    actionType: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityRef: "auth",
    entityId: user.id,
    summary: `${user.name} signed in`,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.Role?.key ?? null,
    ipAddress: req.ip,
  });

  res.json(serializeUser(user));
};

export const logout = async (req, res) => {
  // Read before the session is destroyed — afterwards there is nothing to
  // attribute the entry to.
  const userId = req.session.userId;
  if (userId) {
    const user = await User.findByPk(userId, { include: [Role] });
    if (user) {
      await recordAudit({
        actionType: AUDIT_ACTIONS.LOGOUT,
        entityRef: "auth",
        entityId: user.id,
        summary: `${user.name} signed out`,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.Role?.key ?? null,
        ipAddress: req.ip,
      });
    }
  }

  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: "Could not log out." });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out." });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Workflow requirement 10: changing an existing password requires email
// verification.
//
//   1. POST /api/auth/change-password/request  current password → a code is emailed
//   2. POST /api/auth/change-password/verify   the code → a one-time ticket
//   3. POST /api/auth/change-password          ticket + current + new password
//
// The current password is required at step 1 AND again at step 3. That is not
// redundant: step 1 stops a hijacked session from provoking codes to the real
// owner's mailbox, and step 3 means a ticket on its own — obtained however — is
// still not enough to replace the credential.
// ─────────────────────────────────────────────────────────────────────────────

const activeSessionUser = async (req) => {
  if (!req.session.userId) return null;
  const user = await User.findByPk(req.session.userId, { include: [Role] });
  if (!user || user.status !== "active") return null;
  return user;
};

export const requestPasswordChange = async (req, res) => {
  const user = await activeSessionUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const { currentPassword } = req.body ?? {};
  if (!currentPassword) {
    return res.status(400).json({ message: "Your current password is required." });
  }

  if (!(await user.comparePassword(currentPassword))) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.PASSWORD_CHANGE_REQUESTED,
      outcome: "denied",
      entityRef: "auth",
      entityId: user.id,
      summary: `Password change refused for ${user.email} — current password was incorrect`,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.Role?.key ?? null,
      ipAddress: req.ip,
    });
    return res.status(400).json({ message: "Your current password is incorrect." });
  }

  const issued = await issueOtp({ user, purpose: "passwordChange", deliveredTo: user.email });
  if (!issued.ok) return res.status(issued.status).json({ message: issued.message });

  // Workflow requirement 11: password change requests.
  await recordAudit({
    actionType: AUDIT_ACTIONS.PASSWORD_CHANGE_REQUESTED,
    entityRef: "auth",
    entityId: user.id,
    summary: `Password change requested by ${user.name}; verification code issued`,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.Role?.key ?? null,
    ipAddress: req.ip,
    afterState: { codeSentTo: maskEmail(user.email), expiresAt: issued.expiresAt },
  });

  res.json({
    message: `We sent a 6-digit code to ${maskEmail(user.email)}. It expires in ${issued.expiresInMinutes} minutes.`,
    challenge: serializeChallenge(issued),
  });
};

export const verifyPasswordChangeCode = async (req, res) => {
  const user = await activeSessionUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const { reference, code } = req.body ?? {};
  const verification = await verifyOtp({
    reference,
    code,
    userId: user.id,
    purpose: "passwordChange",
  });

  if (!verification.ok) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.OTP_FAILED,
      outcome: "denied",
      entityRef: "auth",
      entityId: user.id,
      summary: `Incorrect or expired password change code submitted by ${user.name}`,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.Role?.key ?? null,
      ipAddress: req.ip,
      afterState: { purpose: "passwordChange" },
    });
    return res.status(verification.status).json({ message: verification.message });
  }

  await recordAudit({
    actionType: AUDIT_ACTIONS.OTP_VERIFIED,
    entityRef: "auth",
    entityId: user.id,
    summary: `Password change code verified for ${user.email}`,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.Role?.key ?? null,
    ipAddress: req.ip,
    afterState: { purpose: "passwordChange" },
  });

  res.json({
    verified: true,
    message: "Code accepted. Enter your new password.",
    ticket: verification.ticket,
    reference,
    expiresAt: verification.ticketExpiresAt,
  });
};

// Changing your own password requires proving you know the current one, so a
// hijacked session cannot silently lock the real owner out — and, since
// requirement 10, proving you can read the registered mailbox as well.
export const changeOwnPassword = async (req, res) => {
  const user = await activeSessionUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const { currentPassword, newPassword, reference, ticket } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new password are required." });
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });

  if (!(await user.comparePassword(currentPassword))) {
    return res.status(400).json({ message: "Your current password is incorrect." });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "The new password must be different." });
  }

  // The email verification from step 2. Spent here, so the same code cannot
  // authorise a second change.
  const spent = await consumeTicket({
    reference,
    ticket,
    userId: user.id,
    purpose: "passwordChange",
  });
  if (!spent.ok) return res.status(spent.status).json({ message: spent.message });

  const now = new Date();
  user.password = newPassword; // hashed by the User beforeUpdate hook
  user.passwordChangedAt = now;
  await user.save();

  // Workflow requirement 11: successful password changes. As everywhere else,
  // neither the old nor the new password appears in any form.
  await recordAudit({
    actionType: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityRef: "auth",
    entityId: user.id,
    summary: `${user.name} changed their password after email verification`,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.Role?.key ?? null,
    ipAddress: req.ip,
    afterState: { emailVerified: true, passwordChangedAt: now },
  });

  await sendPasswordChangedEmail({
    to: user.email,
    name: user.name,
    at: now,
    ipAddress: req.ip,
    wasReset: false,
  });

  res.json({ message: "Password updated." });
};

// ─────────────────────────────────────────────────────────────────────────────
// Workflow requirement 14: profile changes are a sensitive action, so they are
// confirmed by code as well.
//
// The account's email address is deliberately NOT editable here, by anyone. For a
// bidder it is the address their accreditation was approved against, and letting
// the account holder move it would let an approved bidder redirect every future
// procurement notice — and the account's own recovery — to an address no official
// ever vetted. Changing it is an administrative act, on a reviewed registration.
// ─────────────────────────────────────────────────────────────────────────────

export const requestProfileUpdate = async (req, res) => {
  const user = await activeSessionUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const displayName = String(req.body?.displayName ?? "").trim();
  if (!displayName) return res.status(400).json({ message: "A display name is required." });
  if (displayName.length > 190) return res.status(400).json({ message: "That display name is too long." });
  if (displayName === user.name) {
    return res.status(400).json({ message: "That is already your display name." });
  }

  const issued = await issueOtp({ user, purpose: "profileUpdate", deliveredTo: user.email });
  if (!issued.ok) return res.status(issued.status).json({ message: issued.message });

  res.json({
    message: `We sent a 6-digit code to ${maskEmail(user.email)}. It expires in ${issued.expiresInMinutes} minutes.`,
    challenge: serializeChallenge(issued),
  });
};

export const verifyProfileUpdateCode = async (req, res) => {
  const user = await activeSessionUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const { reference, code } = req.body ?? {};
  const verification = await verifyOtp({
    reference,
    code,
    userId: user.id,
    purpose: "profileUpdate",
  });
  if (!verification.ok) {
    return res.status(verification.status).json({ message: verification.message });
  }

  res.json({
    verified: true,
    ticket: verification.ticket,
    reference,
    expiresAt: verification.ticketExpiresAt,
  });
};

export const updateProfile = async (req, res) => {
  const user = await activeSessionUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const { reference, ticket } = req.body ?? {};
  const displayName = String(req.body?.displayName ?? "").trim();
  if (!displayName) return res.status(400).json({ message: "A display name is required." });
  if (displayName.length > 190) return res.status(400).json({ message: "That display name is too long." });

  const spent = await consumeTicket({
    reference,
    ticket,
    userId: user.id,
    purpose: "profileUpdate",
  });
  if (!spent.ok) return res.status(spent.status).json({ message: spent.message });

  const previousName = user.name;
  await user.update({ name: displayName });

  // Workflow requirement 11: profile updates.
  await recordAudit({
    actionType: AUDIT_ACTIONS.PROFILE_UPDATED,
    entityRef: "user",
    entityId: user.id,
    summary: `${previousName} changed their display name to ${displayName}`,
    actorId: user.id,
    actorName: displayName,
    actorRole: user.Role?.key ?? null,
    ipAddress: req.ip,
    beforeState: { displayName: previousName },
    afterState: { displayName, emailVerified: true },
  });

  const full = await User.findByPk(user.id, { include: userIncludes });
  res.json(serializeUser(full));
};

// Personal display settings. Deliberately separate from the admin's user
// management endpoints: this is the only user field an account may change about
// itself, and it carries no privilege, so it needs no permission beyond being
// signed in.
//
// Not code-gated, and deliberately so: a theme toggle is not a sensitive action,
// and mailing a code every time somebody switches to dark mode would train users
// to type codes without reading why — which is the behaviour that makes
// verification worthless where it matters.
export const updatePreferences = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated." });
  }

  const { themePreference, sidebarCollapsed } = req.body;
  const changes = {};

  if (themePreference !== undefined) {
    if (!THEME_PREFERENCES.includes(themePreference)) {
      return res.status(400).json({
        message: "Unknown theme preference.",
        accepted: THEME_PREFERENCES,
      });
    }
    changes.themePreference = themePreference;
  }

  if (sidebarCollapsed !== undefined) {
    changes.sidebarCollapsed = Boolean(sidebarCollapsed);
  }

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ message: "Nothing to update." });
  }

  const user = await User.findByPk(req.session.userId);
  if (!user || user.status !== "active") {
    return res.status(401).json({ message: "Not authenticated." });
  }

  await user.update(changes);

  res.json({
    themePreference: user.themePreference,
    sidebarCollapsed: Boolean(user.sidebarCollapsed),
  });
};

export const me = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated." });
  }

  const user = await User.findByPk(req.session.userId, { include: userIncludes });
  if (!user || user.status !== "active") {
    return res.status(401).json({ message: "Not authenticated." });
  }

  res.json(serializeUser(user));
};
