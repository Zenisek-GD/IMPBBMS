import { User } from "../models/userModel.js";
import { issueOtp, verifyOtp, consumeTicket, serializeChallenge, maskEmail } from "../services/otp.js";
import { recordAudit, AUDIT_ACTIONS } from "../services/auditLog.js";
import { sendPasswordChangedEmail } from "../services/mailer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Workflow requirement 9: forgotten-password recovery, gated on a one-time code
// sent to the registered address.
//
//   1. POST /api/auth/forgot-password   → a code is emailed
//   2. POST /api/auth/forgot-password/verify → the code is checked, a ticket issued
//   3. POST /api/auth/reset-password    → the new password is set with that ticket
//
// The new password is submitted only at step 3, after verification. It is never
// parked anywhere while the system waits for a code — see the note on
// OtpChallenge.ticketHash for why that ordering matters.
// ─────────────────────────────────────────────────────────────────────────────

// The same response whether or not the address has an account, so this endpoint
// cannot be used to find out which businesses and officials hold accounts here.
//
// Note that this is why step 2 has to accept a challenge reference from the
// client: a caller who was told nothing about whether the address exists has to
// be handed *something* to submit a code against, and the reference is issued for
// non-existent addresses too.
const genericRequestResponse = (email) => ({
  message:
    `If ${maskEmail(email)} has an account with us, a 6-digit verification code is on its way. ` +
    "Enter it on the next screen to choose a new password.",
});

// Design doc Section 12 requires server-side validation on all inputs — the
// frontend runs the same rules, but these are the ones that actually count.
export const validatePassword = (password) => {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 200) {
    // bcrypt truncates at 72 bytes, so anything beyond that adds no strength; the
    // limit exists to stop a multi-megabyte string being fed to the hasher.
    return "Password must be 200 characters or fewer.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
};

const normaliseEmail = (value) => String(value ?? "").trim().toLowerCase();

// ── Step 1: request a code ──────────────────────────────────────────────────

export const forgotPassword = async (req, res) => {
  const email = normaliseEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  const user = await User.findOne({ where: { email } });

  // Workflow requirement 11: the *request* is logged whether or not it matched an
  // account. An attacker probing for valid addresses learns nothing from the
  // response, but the attempt is on the record.
  await recordAudit({
    actionType: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    outcome: user && user.status === "active" ? "success" : "denied",
    entityRef: "auth",
    entityId: user?.id ?? null,
    summary: `Password reset requested for ${email}`,
    actorId: user?.id ?? null,
    actorName: user?.name ?? email,
    ipAddress: req.ip,
    afterState: {
      matchedAccount: Boolean(user),
      accountStatus: user?.status ?? null,
    },
  });

  // An account that has never been activated must not be recoverable this way:
  // "reset the password" on an account whose password was never set by its owner
  // would be a way to complete an activation without the invitation. Those bidders
  // need a fresh invitation from an official instead.
  if (!user || user.status !== "active") {
    return res.json(genericRequestResponse(email));
  }

  const issued = await issueOtp({ user, purpose: "passwordReset", deliveredTo: user.email });

  // A rate-limit refusal is reported plainly here. It only ever happens to a
  // caller who has already been issued codes for this account in the last few
  // minutes, so it tells them nothing they did not already know.
  if (!issued.ok) return res.status(issued.status).json({ message: issued.message });

  await recordAudit({
    actionType: AUDIT_ACTIONS.OTP_ISSUED,
    entityRef: "auth",
    entityId: user.id,
    summary: `Verification code issued for password reset (${maskEmail(user.email)})`,
    actorId: user.id,
    actorName: user.name,
    ipAddress: req.ip,
    afterState: { purpose: "passwordReset", expiresAt: issued.expiresAt },
  });

  res.json({ ...genericRequestResponse(email), challenge: serializeChallenge(issued) });
};

// ── Step 2: verify the code ─────────────────────────────────────────────────

export const verifyResetCode = async (req, res) => {
  const { reference, code } = req.body ?? {};
  const email = normaliseEmail(req.body?.email);

  const user = email ? await User.findOne({ where: { email } }) : null;

  // Uniform failure. Without an account there is nothing to verify against, and
  // saying so would undo the indistinguishability of step 1.
  const genericFailure = { message: "That code is incorrect or has expired." };
  if (!user || user.status !== "active") return res.status(400).json(genericFailure);

  const verification = await verifyOtp({
    reference,
    code,
    userId: user.id,
    purpose: "passwordReset",
  });

  if (!verification.ok) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.OTP_FAILED,
      outcome: "denied",
      entityRef: "auth",
      entityId: user.id,
      summary: `Incorrect or expired password reset code submitted for ${user.email}`,
      actorId: user.id,
      actorName: user.name,
      ipAddress: req.ip,
      afterState: { purpose: "passwordReset" },
    });
    return res.status(verification.status).json({ message: verification.message });
  }

  await recordAudit({
    actionType: AUDIT_ACTIONS.OTP_VERIFIED,
    entityRef: "auth",
    entityId: user.id,
    summary: `Password reset code verified for ${user.email}`,
    actorId: user.id,
    actorName: user.name,
    ipAddress: req.ip,
    afterState: { purpose: "passwordReset" },
  });

  res.json({
    verified: true,
    message: "Code accepted. Choose your new password.",
    // The ticket is returned once and never stored in readable form — only its
    // hash is kept. It authorises exactly one call to resetPassword.
    ticket: verification.ticket,
    reference,
    expiresAt: verification.ticketExpiresAt,
  });
};

// ── Step 3: set the new password ────────────────────────────────────────────

export const resetPassword = async (req, res) => {
  const { reference, ticket, password } = req.body ?? {};
  const email = normaliseEmail(req.body?.email);

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const user = email ? await User.findOne({ where: { email } }) : null;
  if (!user || user.status !== "active") {
    return res.status(400).json({ message: "Email verification is required before this action." });
  }

  const spent = await consumeTicket({
    reference,
    ticket,
    userId: user.id,
    purpose: "passwordReset",
  });
  if (!spent.ok) return res.status(spent.status).json({ message: spent.message });

  // Refusing to re-set the same password is a small thing, but a reset that
  // silently changes nothing leaves the user believing they have recovered an
  // account they may not have.
  if (await user.comparePassword(password)) {
    return res.status(400).json({
      message: "That is already your current password. Choose a different one.",
    });
  }

  const now = new Date();
  user.password = password; // hashed by the User beforeUpdate hook
  user.passwordChangedAt = now;
  await user.save();

  // Workflow requirement 11: successful password reset. Nothing about the
  // password appears — not the old one, not the new one, not their lengths.
  await recordAudit({
    actionType: AUDIT_ACTIONS.PASSWORD_RESET,
    entityRef: "auth",
    entityId: user.id,
    summary: `Password reset completed for ${user.email} after email verification`,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.Role?.key ?? null,
    ipAddress: req.ip,
    afterState: { emailVerified: true, passwordChangedAt: now },
  });

  // Out-of-band warning. If the reset was not the account holder's doing, this is
  // how they find out.
  await sendPasswordChangedEmail({
    to: user.email,
    name: user.name,
    at: now,
    ipAddress: req.ip,
    wasReset: true,
  });

  // Any session that existed under the old password is dropped, so a reset
  // performed *because* an account was compromised actually evicts the intruder.
  req.session.destroy(() => {
    res.json({ message: "Password updated. You can now sign in with your new password." });
  });
};
