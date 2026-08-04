import { Vendor } from "../models/vendorModel.js";
import { sequelize } from "../models/db.js";
import {
  resolveActivationToken,
  markActivationAccessed,
  consumeActivationToken,
} from "../services/activation.js";
import { issueOtp, verifyOtp, serializeChallenge, maskEmail } from "../services/otp.js";
import { validatePassword } from "./passwordResetController.js";
import { recordAudit, AUDIT_ACTIONS } from "../services/auditLog.js";
import { sendActivationCompleteEmail } from "../services/mailer.js";
import { notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Steps 3–5 of bidder onboarding, all performed by the bidder with no session:
//
//   1. GET  /api/activation/verify?token=…   is this link live?
//   2. POST /api/activation/setup            set a password, optionally a name,
//                                            and receive a code by email
//   3. POST /api/activation/confirm          enter the code; the account becomes
//                                            active and the link dies
//
// Nothing here is authenticated, because the person acting has no account to
// authenticate with yet. The activation token is the only credential in play, and
// it is exactly as powerful as it needs to be: it identifies one pending account,
// once, for a bounded time, and it can do nothing else.
// ─────────────────────────────────────────────────────────────────────────────

// What the bidder is told about their own pending account.
//
// The email address is masked. The token proves the holder can read the mailbox
// the link was sent to, so showing them the address would be no revelation — but
// a link forwarded, quoted in a support ticket, or left in a browser history
// should not hand over a working address, and the masked form is enough to
// confirm they are activating the right account.
const describeAccount = (user, vendor) => ({
  email: maskEmail(user.email),
  displayName: user.name,
  businessName: vendor?.businessName ?? null,
  referenceCode: vendor?.referenceCode ?? null,
});

const findVendorFor = (userId) => Vendor.findOne({ where: { userId } });

/**
 * Checks the link before the setup form is shown, so an expired invitation does
 * not waste the bidder's time choosing a password they cannot save.
 *
 * Workflow requirement 11: activation link accessed. Recorded on every hit,
 * including rejected ones — a stream of failures against expired tokens is worth
 * being able to see.
 */
export const verifyActivationLink = async (req, res) => {
  const { token } = req.query;
  const resolved = await resolveActivationToken(token);

  if (!resolved.ok) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.BIDDER_ACTIVATION_REJECTED,
      outcome: "denied",
      entityRef: "auth",
      summary: "Activation link rejected — invalid, expired, already used, or the address changed",
      actorName: "unauthenticated visitor",
      ipAddress: req.ip,
    });
    return res.status(400).json({ valid: false, message: resolved.message });
  }

  const { record, user } = resolved;
  const vendor = await findVendorFor(user.id);
  const firstAccess = await markActivationAccessed(record);

  await recordAudit({
    actionType: AUDIT_ACTIONS.BIDDER_ACTIVATION_ACCESSED,
    entityRef: "user",
    entityId: user.id,
    summary: `Activation link opened for ${user.email}${firstAccess ? " (first access)" : ""}`,
    // No actorId: the visitor is not signed in, and will not be until activation
    // completes. They are identified by the account the token points at.
    actorName: user.name,
    actorRole: "vendor",
    ipAddress: req.ip,
    afterState: { firstAccess, invitationExpiresAt: record.expiresAt },
  });

  res.json({ valid: true, account: describeAccount(user, vendor) });
};

/**
 * The bidder sets their own password and, optionally, changes the display name
 * the official entered for them.
 *
 * The password is NOT saved here. It is validated, and a code is emailed to the
 * accredited address; the password is submitted again alongside that code, and
 * only then hashed and stored. That ordering is what keeps the system from ever
 * holding a plaintext password while it waits for a verification step — see the
 * note on OtpChallenge.ticketHash.
 */
export const setupActivation = async (req, res) => {
  const { token, password, displayName } = req.body ?? {};

  const resolved = await resolveActivationToken(token);
  if (!resolved.ok) {
    return res.status(400).json({ message: resolved.message });
  }

  const { user } = resolved;

  // Workflow requirement 5: the password is required.
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  // Workflow requirement 5: the display name is optional. Blank means "keep what
  // the official entered".
  const requestedName = String(displayName ?? "").trim();
  if (requestedName && requestedName.length > 190) {
    return res.status(400).json({ message: "That display name is too long." });
  }

  // Workflow requirement 6: a code goes to the registered address. `user.email`
  // is used rather than anything from the request body — resolveActivationToken
  // has already confirmed it matches the address the invitation was issued to, so
  // this is provably the accredited channel.
  const issued = await issueOtp({
    user,
    purpose: "accountActivation",
    deliveredTo: user.email,
  });

  if (!issued.ok) {
    return res.status(issued.status).json({ message: issued.message });
  }

  await recordAudit({
    actionType: AUDIT_ACTIONS.BIDDER_ACTIVATION_SETUP,
    entityRef: "user",
    entityId: user.id,
    summary: `Activation details submitted for ${user.email}; verification code issued`,
    actorName: user.name,
    actorRole: "vendor",
    ipAddress: req.ip,
    // A password was chosen. What it is does not appear here, in any form —
    // not the value, not its length, not a hash. See redactSecrets in
    // services/auditLog.js, which would strip it even if a future edit tried.
    afterState: {
      passwordSet: true,
      displayNameChanged: Boolean(requestedName && requestedName !== user.name),
      codeSentTo: maskEmail(user.email),
    },
  });

  await recordAudit({
    actionType: AUDIT_ACTIONS.OTP_ISSUED,
    entityRef: "user",
    entityId: user.id,
    summary: `Verification code issued for account activation (${maskEmail(user.email)})`,
    actorName: user.name,
    actorRole: "vendor",
    ipAddress: req.ip,
    afterState: { purpose: "accountActivation", expiresAt: issued.expiresAt },
  });

  res.json({
    message: `We sent a 6-digit code to ${maskEmail(user.email)}. It expires in ${issued.expiresInMinutes} minutes.`,
    challenge: serializeChallenge(issued),
  });
};

/**
 * Workflow requirements 7 and 8. The bidder enters the code; if it is right, the
 * password chosen at the previous step is saved, the account becomes Active, the
 * activation token is spent, and the event is recorded.
 *
 * The password is resubmitted here rather than remembered from the setup call.
 * That is the point of the design: it exists in memory for the duration of this
 * one request and is written only as a bcrypt hash.
 */
export const confirmActivation = async (req, res) => {
  const { token, code, reference, password, displayName } = req.body ?? {};

  const resolved = await resolveActivationToken(token);
  if (!resolved.ok) return res.status(400).json({ message: resolved.message });

  const { record, user } = resolved;

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const verification = await verifyOtp({
    reference,
    code,
    userId: user.id,
    purpose: "accountActivation",
  });

  if (!verification.ok) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.OTP_FAILED,
      outcome: "denied",
      entityRef: "user",
      entityId: user.id,
      summary: `Incorrect or expired activation code submitted for ${user.email}`,
      actorName: user.name,
      actorRole: "vendor",
      ipAddress: req.ip,
      afterState: { purpose: "accountActivation" },
    });
    return res.status(verification.status).json({ message: verification.message });
  }

  const requestedName = String(displayName ?? "").trim();
  const previousName = user.name;
  const now = new Date();

  // The account flips to active and the invitation is spent in one transaction.
  // Split apart, a failure between them would leave either an active account with
  // a live invitation still attached, or a spent invitation and an account still
  // locked out with nothing left to activate it.
  await sequelize.transaction(async (transaction) => {
    user.password = password; // hashed by the User beforeUpdate hook
    user.status = "active";
    user.activatedAt = now;
    user.passwordChangedAt = now;
    if (requestedName) user.name = requestedName.slice(0, 190);
    await user.save({ transaction });

    await consumeActivationToken(record, { transaction });
  });

  const vendor = await findVendorFor(user.id);

  await recordAudit({
    actionType: AUDIT_ACTIONS.OTP_VERIFIED,
    entityRef: "user",
    entityId: user.id,
    summary: `Email ownership verified by one-time code for ${user.email}`,
    actorId: user.id,
    actorName: user.name,
    actorRole: "vendor",
    ipAddress: req.ip,
    afterState: { purpose: "accountActivation", verifiedAddress: user.email },
  });

  await recordAudit({
    actionType: AUDIT_ACTIONS.BIDDER_ACCOUNT_ACTIVATED,
    entityRef: "user",
    entityId: user.id,
    summary: `Bidder account activated for ${user.email}${vendor ? ` (${vendor.businessName})` : ""}`,
    actorId: user.id,
    actorName: user.name,
    actorRole: "vendor",
    ipAddress: req.ip,
    beforeState: { status: "pendingActivation", displayName: previousName },
    afterState: {
      status: "active",
      displayName: user.name,
      displayNameChanged: previousName !== user.name,
      // Recorded because it is the fact that matters for accountability: the
      // link cannot be used again.
      activationTokenConsumed: true,
      vendorId: vendor?.id ?? null,
      referenceCode: vendor?.referenceCode ?? null,
    },
  });

  // Tells the bidder the account is live, and tells them by mail — so an
  // activation performed by someone else who intercepted the link does not go
  // unnoticed by the person whose mailbox it is.
  await sendActivationCompleteEmail({
    to: user.email,
    name: user.name,
    businessName: vendor?.businessName ?? "your business",
  });

  await notifyByPermission("bidders.createAccount", {
    type: NOTIFICATION_EVENTS.BIDDER_ACCOUNT_ACTIVATED,
    title: "Bidder account activated",
    body: `${vendor?.businessName ?? user.name} completed activation and can now sign in.`,
    link: "/secretariat/vendors",
    refEntity: "vendor",
    refId: vendor?.id ?? null,
    severity: "success",
  });

  res.json({
    message: "Your account is active. You can now sign in with your email address and new password.",
    activated: true,
  });
};

/**
 * Resends the activation code — not the invitation link. Used when the code did
 * not arrive or expired while the bidder was still on the page. The link itself is
 * unchanged and still has to be valid for this to work.
 */
export const resendActivationCode = async (req, res) => {
  const { token } = req.body ?? {};

  const resolved = await resolveActivationToken(token);
  if (!resolved.ok) return res.status(400).json({ message: resolved.message });

  const { user } = resolved;

  const issued = await issueOtp({
    user,
    purpose: "accountActivation",
    deliveredTo: user.email,
  });
  if (!issued.ok) return res.status(issued.status).json({ message: issued.message });

  await recordAudit({
    actionType: AUDIT_ACTIONS.OTP_ISSUED,
    entityRef: "user",
    entityId: user.id,
    summary: `Activation code re-issued for ${maskEmail(user.email)}`,
    actorName: user.name,
    actorRole: "vendor",
    ipAddress: req.ip,
    afterState: { purpose: "accountActivation", resend: true, expiresAt: issued.expiresAt },
  });

  res.json({
    message: `A new code is on its way to ${maskEmail(user.email)}.`,
    challenge: serializeChallenge(issued),
  });
};
