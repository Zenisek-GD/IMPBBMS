import QRCode from "qrcode";
import { sequelize } from "../models/db.js";
import {
  MfaEnrollment,
  MfaRecoveryCode,
  encryptSecret,
  decryptSecret,
  hashRecoveryCode,
  generateRecoveryCodes,
  MFA_LOCK_THRESHOLD,
  MFA_LOCK_MINUTES,
} from "../models/mfaModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { generateSecret, verifyToken, buildOtpAuthUri, TOTP_PARAMETERS } from "../services/totp.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { recordAudit, auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { sessionTtlForRole, serializeUser, userIncludes } from "./authController.js";

// Enrolment and verification of the second factor. The rule this file exists to
// enforce: knowing the password is not enough, and no code path here may be
// reachable in a way that makes it enough.

const MINUTE = 60_000;

export const isLocked = (enrollment, now = new Date()) =>
  Boolean(enrollment?.lockedUntil && new Date(enrollment.lockedUntil) > now);

// Shared by the enrolment confirmation and the sign-in check, so the two cannot
// drift into applying different rules. Returns { ok } or { ok: false, ... }.
export const consumeToken = async (enrollment, token, { now = new Date(), ip } = {}) => {
  if (isLocked(enrollment, now)) {
    const minutes = Math.ceil((new Date(enrollment.lockedUntil) - now) / MINUTE);
    return { ok: false, locked: true, message: `Too many incorrect codes. Try again in ${minutes} minute(s).` };
  }

  const secret = decryptSecret(enrollment.encryptedSecret);
  const step = verifyToken(secret, token, { at: now });

  // ── Replay ────────────────────────────────────────────────────────────────
  // A correct code from a step already spent is refused. Without this, a code
  // captured by a phishing proxy stays usable for the rest of its window, which
  // is the whole attack TOTP is supposed to make expensive.
  if (step !== null && enrollment.lastUsedStep !== null && BigInt(step) <= BigInt(enrollment.lastUsedStep)) {
    await enrollment.update({ failedAttempts: enrollment.failedAttempts + 1 });
    return { ok: false, replay: true, message: "That code has already been used. Wait for the next one." };
  }

  if (step === null) {
    const failed = enrollment.failedAttempts + 1;
    const lock = failed >= MFA_LOCK_THRESHOLD;
    await enrollment.update({
      failedAttempts: lock ? 0 : failed,
      lockedUntil: lock ? new Date(now.getTime() + MFA_LOCK_MINUTES * MINUTE) : enrollment.lockedUntil,
    });
    return {
      ok: false,
      message: lock
        ? `Too many incorrect codes. This account is locked for ${MFA_LOCK_MINUTES} minutes.`
        : "That code is not correct. Check your authenticator app and try again.",
      attemptsRemaining: lock ? 0 : MFA_LOCK_THRESHOLD - failed,
    };
  }

  await enrollment.update({
    lastUsedStep: step,
    lastUsedAt: now,
    failedAttempts: 0,
    lockedUntil: null,
  });
  return { ok: true, step, ip };
};

// A recovery code stands in for the app when the phone is gone. Single use, and
// spending one is worth an audit entry of its own — a recovery from an
// unfamiliar address is exactly the event somebody should look at.
export const consumeRecoveryCode = async (userId, code, { ip } = {}) => {
  const hash = hashRecoveryCode(code);
  const row = await MfaRecoveryCode.findOne({ where: { userId, codeHash: hash, usedAt: null } });
  if (!row) return { ok: false, message: "That recovery code is not valid, or has already been used." };

  await row.update({ usedAt: new Date(), usedFromIp: ip ?? null });
  const remaining = await MfaRecoveryCode.count({ where: { userId, usedAt: null } });
  return { ok: true, remaining };
};

// ── Status ───────────────────────────────────────────────────────────────────
export const getMfaStatus = async (req, res) => {
  const enrollment = await MfaEnrollment.findOne({ where: { userId: req.currentUser.id } });
  const remaining = enrollment
    ? await MfaRecoveryCode.count({ where: { userId: req.currentUser.id, usedAt: null } })
    : 0;

  res.json({
    enrolled: enrollment?.status === "active",
    pending: enrollment?.status === "pending",
    confirmedAt: enrollment?.confirmedAt ?? null,
    lastUsedAt: enrollment?.lastUsedAt ?? null,
    recoveryCodesRemaining: remaining,
    // Surfaced so the UI can nag before the user is down to their last code and
    // one lost phone away from needing an administrator.
    recoveryCodesLow: enrollment?.status === "active" && remaining <= 3,
    parameters: TOTP_PARAMETERS,
  });
};

// ── Enrolment, step 1: issue a secret ────────────────────────────────────────
export const beginEnrollment = async (req, res) => {
  const existing = await MfaEnrollment.findOne({ where: { userId: req.currentUser.id } });
  if (existing?.status === "active") {
    return res.status(409).json({
      message:
        "Two-factor authentication is already switched on for this account. Turn it off first if you are moving to a new phone.",
    });
  }

  const secret = generateSecret();
  const lgu = await getLguProfile();
  const issuer = lgu.name || "Procurenance";
  const uri = buildOtpAuthUri({ secret, account: req.currentUser.email, issuer });

  // Replaces any half-finished enrolment. A user who scanned a code, lost the
  // page and started again must not be left with two secrets, only one of which
  // works.
  //
  // Done as find-or-create then update rather than destroy-then-create, because
  // the latter races: two calls arriving together — which React's development
  // double-mount produces reliably — could interleave so that one destroys the
  // row the other had just written, or collide on the unique index on userId.
  // This way the row is never absent and the last writer simply wins.
  await sequelize.transaction(async (transaction) => {
    const [row] = await MfaEnrollment.findOrCreate({
      where: { userId: req.currentUser.id },
      defaults: {
        userId: req.currentUser.id,
        encryptedSecret: encryptSecret(secret),
        status: "pending",
      },
      transaction,
    });

    // Existing pending row: re-point it at the new secret and clear any
    // counters left over from the abandoned attempt.
    if (row.encryptedSecret !== undefined && row.status === "pending") {
      await row.update(
        {
          encryptedSecret: encryptSecret(secret),
          lastUsedStep: null,
          failedAttempts: 0,
          lockedUntil: null,
        },
        { transaction }
      );
    }
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.MFA_ENROLLMENT_STARTED,
    entityRef: "user",
    entityId: req.currentUser.id,
    summary: `${req.currentUser.name} started two-factor enrolment`,
  });

  res.json({
    // Returned exactly once, here. Nothing reads the secret back out of the
    // database afterwards, so this response is the only opportunity to see it.
    secret,
    otpauthUri: uri,
    qrDataUri: await QRCode.toDataURL(uri, { margin: 1, width: 240 }),
    issuer,
    account: req.currentUser.email,
    parameters: TOTP_PARAMETERS,
  });
};

// ── Enrolment, step 2: prove the app has it ──────────────────────────────────
// Nothing is enforced until this succeeds. Activating on issue alone would lock
// out anyone whose camera failed or who scanned into the wrong app.
export const confirmEnrollment = async (req, res) => {
  const enrollment = await MfaEnrollment.findOne({ where: { userId: req.currentUser.id } });
  if (!enrollment || enrollment.status !== "pending") {
    return res.status(409).json({ message: "Start enrolment first." });
  }

  const result = await consumeToken(enrollment, req.body.token, { ip: req.ip });
  if (!result.ok) return res.status(400).json(result);

  // Recovery codes are generated at activation, not at issue: a user who never
  // finished enrolling has no use for them, and generating early would leave
  // valid codes attached to an enrolment that was abandoned.
  const codes = generateRecoveryCodes();

  await sequelize.transaction(async (transaction) => {
    await enrollment.update({ status: "active", confirmedAt: new Date() }, { transaction });
    await MfaRecoveryCode.destroy({ where: { userId: req.currentUser.id }, transaction });
    await MfaRecoveryCode.bulkCreate(
      codes.map((code) => ({ userId: req.currentUser.id, codeHash: hashRecoveryCode(code) })),
      { transaction }
    );
  });

  // The session was created before enrolment was required; clear the flag so
  // the enforcement middleware stops redirecting.
  req.session.mfaEnrollmentRequired = false;
  req.session.mfaVerified = true;

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.MFA_ENABLED,
    entityRef: "user",
    entityId: req.currentUser.id,
    summary: `${req.currentUser.name} switched on two-factor authentication`,
    afterState: { recoveryCodesIssued: codes.length },
  });

  res.json({
    enabled: true,
    // Shown once. They are stored hashed, so this is the only time they can be
    // displayed — the UI must make the user save them before moving on.
    recoveryCodes: codes,
  });
};

// ── Regenerate recovery codes ────────────────────────────────────────────────
// Requires a current code, because whoever holds the phone is the only person
// who should be able to invalidate the codes that stand in for it.
export const regenerateRecoveryCodes = async (req, res) => {
  const enrollment = await MfaEnrollment.findOne({ where: { userId: req.currentUser.id } });
  if (enrollment?.status !== "active") {
    return res.status(409).json({ message: "Two-factor authentication is not switched on." });
  }

  const result = await consumeToken(enrollment, req.body.token, { ip: req.ip });
  if (!result.ok) return res.status(400).json(result);

  const codes = generateRecoveryCodes();
  await sequelize.transaction(async (transaction) => {
    await MfaRecoveryCode.destroy({ where: { userId: req.currentUser.id }, transaction });
    await MfaRecoveryCode.bulkCreate(
      codes.map((code) => ({ userId: req.currentUser.id, codeHash: hashRecoveryCode(code) })),
      { transaction }
    );
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.MFA_RECOVERY_REGENERATED,
    entityRef: "user",
    entityId: req.currentUser.id,
    summary: `${req.currentUser.name} regenerated their recovery codes`,
  });

  res.json({ recoveryCodes: codes });
};

// ── Turn it off ──────────────────────────────────────────────────────────────
// Both the password and a current code. Either alone would mean that whoever
// walks up to an unlocked screen, or whoever has phished the password, can
// remove the protection the password was insufficient for in the first place.
export const disableMfa = async (req, res) => {
  const enrollment = await MfaEnrollment.findOne({ where: { userId: req.currentUser.id } });
  if (!enrollment) return res.status(409).json({ message: "Two-factor authentication is not switched on." });

  const user = await User.findByPk(req.currentUser.id);
  if (!(await user.comparePassword(req.body.password ?? ""))) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.MFA_DISABLE_REFUSED,
      entityRef: "user",
      entityId: user.id,
      outcome: "denied",
      summary: `Refused attempt to switch off two-factor for ${user.email} — wrong password`,
    });
    return res.status(403).json({ message: "That password is not correct." });
  }

  const result = await consumeToken(enrollment, req.body.token, { ip: req.ip });
  if (!result.ok) return res.status(400).json(result);

  await sequelize.transaction(async (transaction) => {
    await MfaRecoveryCode.destroy({ where: { userId: user.id }, transaction });
    await enrollment.destroy({ transaction });
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.MFA_DISABLED,
    entityRef: "user",
    entityId: user.id,
    summary: `${user.name} switched off two-factor authentication`,
  });

  res.json({ enabled: false });
};

// ── Administrator reset ──────────────────────────────────────────────────────
// The way back in for a user who lost their phone and their recovery codes.
//
// It clears the enrolment; it does not reveal or set a secret, and it cannot
// sign anybody in. The administrator is a route back to *enrolling again*, not
// a bypass — which is why this endpoint returns nothing an attacker could use
// even if the administrator account itself were compromised.
export const resetUserMfa = async (req, res) => {
  const user = await User.findByPk(req.params.userId, { include: [{ model: Role }] });
  if (!user) return res.status(404).json({ message: "That user does not exist." });

  if (!req.body.reason?.trim()) {
    return res.status(400).json({
      message: "Record why this reset is being made. Clearing someone's second factor is the kind of act that gets asked about later.",
    });
  }

  const enrollment = await MfaEnrollment.findOne({ where: { userId: user.id } });
  if (!enrollment) return res.status(409).json({ message: "That account has no two-factor enrolment to reset." });

  await sequelize.transaction(async (transaction) => {
    await MfaRecoveryCode.destroy({ where: { userId: user.id }, transaction });
    await enrollment.destroy({ transaction });
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.MFA_RESET_BY_ADMIN,
    entityRef: "user",
    entityId: user.id,
    summary: `Two-factor reset for ${user.email} by ${req.currentUser.name}: ${req.body.reason.trim()}`,
    afterState: { reason: req.body.reason.trim(), targetRole: user.Role?.key ?? null },
  });

  res.json({ reset: true, mustReenroll: true });
};

// ── The second step at sign-in ───────────────────────────────────────────────
// Reached only after the password was correct. The pending state carries a user
// id and nothing else — no permissions are loaded and no protected route will
// accept it, so being stuck here grants exactly nothing.
export const verifyLoginChallenge = async (req, res) => {
  const pendingId = req.session.pendingMfaUserId;
  if (!pendingId) {
    return res.status(400).json({ message: "Start again from the sign-in page." });
  }

  // The pending state is deliberately short-lived. A half-finished sign-in left
  // open on a shared machine should not still be usable an hour later.
  if (!req.session.pendingMfaExpiresAt || Date.now() > req.session.pendingMfaExpiresAt) {
    delete req.session.pendingMfaUserId;
    delete req.session.pendingMfaExpiresAt;
    return res.status(440).json({ message: "This sign-in took too long. Start again." });
  }

  const user = await User.findByPk(pendingId, { include: [{ model: Role }] });
  const enrollment = user ? await MfaEnrollment.findOne({ where: { userId: user.id } }) : null;
  if (!user || enrollment?.status !== "active") {
    delete req.session.pendingMfaUserId;
    return res.status(400).json({ message: "Start again from the sign-in page." });
  }

  const usingRecovery = Boolean(req.body.recoveryCode);
  const result = usingRecovery
    ? await consumeRecoveryCode(user.id, req.body.recoveryCode, { ip: req.ip })
    : await consumeToken(enrollment, req.body.token, { ip: req.ip });

  if (!result.ok) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.MFA_CHALLENGE_FAILED,
      outcome: "denied",
      entityRef: "auth",
      entityId: user.id,
      summary: `Second-factor check failed for ${user.email}${result.replay ? " — code reused" : ""}`,
      actorName: user.name,
      ipAddress: req.ip,
      afterState: { method: usingRecovery ? "recoveryCode" : "authenticator", replay: Boolean(result.replay) },
    });
    return res.status(401).json(result);
  }

  // Only now does a real session exist.
  delete req.session.pendingMfaUserId;
  delete req.session.pendingMfaExpiresAt;
  req.session.userId = user.id;
  req.session.mfaVerified = true;
  req.session.cookie.maxAge = sessionTtlForRole(user.Role.key);

  await recordAudit({
    actionType: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityRef: "auth",
    entityId: user.id,
    summary: `${user.name} signed in with two-factor${usingRecovery ? " (recovery code)" : ""}`,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.Role?.key ?? null,
    ipAddress: req.ip,
    afterState: { method: usingRecovery ? "recoveryCode" : "authenticator" },
  });

  if (usingRecovery) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.MFA_RECOVERY_USED,
      entityRef: "user",
      entityId: user.id,
      summary: `${user.name} signed in with a recovery code — ${result.remaining} left`,
      actorId: user.id,
      actorName: user.name,
      ipAddress: req.ip,
      afterState: { remaining: result.remaining },
    });
  }

  const full = await User.findByPk(user.id, { include: userIncludes });
  res.json({
    ...serializeUser(full),
    ...(usingRecovery ? { recoveryCodesRemaining: result.remaining } : {}),
  });
};
