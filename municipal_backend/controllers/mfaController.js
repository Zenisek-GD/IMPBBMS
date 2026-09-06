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
import { serializeUser, userIncludes } from "./authController.js";
import { startLoginSession } from "../services/loginSession.js";
import { credentialVersion, sessionDetails, roleRequiresTwoFactor } from "../services/authPolicy.js";
import { createTrustedDevice, revokeUserTrust, securityAudit } from "../services/trustedDevices.js";

// Enrolment and verification of the second factor. The rule this file exists to
// enforce: knowing the password is not enough, and no code path here may be
// reachable in a way that makes it enough.

const MINUTE = 60_000;

export const isLocked = (enrollment, now = new Date()) =>
  Boolean(enrollment?.lockedUntil && new Date(enrollment.lockedUntil) > now);

// Shared by the enrolment confirmation and the sign-in check, so the two cannot
// drift into applying different rules. Returns { ok } or { ok: false, ... }.
export const consumeToken = async (enrollment, token, { now = new Date(), ip } = {}) => {
  return sequelize.transaction(async (transaction) => {
    const locked = await MfaEnrollment.findByPk(enrollment.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked) return { ok: false, message: "Start again from the sign-in page." };
    enrollment = locked;
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
      const failed = enrollment.failedAttempts + 1;
      await enrollment.update({
        failedAttempts: failed >= MFA_LOCK_THRESHOLD ? 0 : failed,
        lockedUntil: failed >= MFA_LOCK_THRESHOLD ? new Date(now.getTime() + MFA_LOCK_MINUTES * MINUTE) : null,
      }, { transaction });
      return { ok: false, replay: true, message: "That code has already been used. Wait for the next one." };
    }

    if (step === null) {
      const failed = enrollment.failedAttempts + 1;
      const lock = failed >= MFA_LOCK_THRESHOLD;
      await enrollment.update({
        failedAttempts: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + MFA_LOCK_MINUTES * MINUTE) : enrollment.lockedUntil,
      }, { transaction });
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
    }, { transaction });
    return { ok: true, step, ip };
  });
};

// A recovery code stands in for the app when the phone is gone. Single use, and
// spending one is worth an audit entry of its own — a recovery from an
// unfamiliar address is exactly the event somebody should look at.
export const consumeRecoveryCode = async (userId, code, { ip } = {}) => {
  const hash = hashRecoveryCode(code);
  const row = await MfaRecoveryCode.findOne({ where: { userId, codeHash: hash, usedAt: null } });
  if (!row) return { ok: false, message: "That recovery code is not valid, or has already been used." };

  const [changed] = await MfaRecoveryCode.update(
    { usedAt: new Date(), usedFromIp: ip ?? null }, { where: { id: row.id, usedAt: null } }
  );
  if (!changed) return { ok: false, message: "That recovery code has already been used." };
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
    requiredByRole: roleRequiresTwoFactor(req.currentUser.Role),
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
  if (!roleRequiresTwoFactor(req.currentUser.Role)) {
    return res.status(403).json({ message: "Your role does not require 2FA. Only a security administrator can change this requirement." });
  }
  const existing = await MfaEnrollment.findOne({ where: { userId: req.currentUser.id } });
  if (existing?.status === "active") {
    return res.status(409).json({
      message:
        "An authenticator is already registered. Contact a System Administrator to reset it if you are moving to a new phone.",
    });
  }

  const secret = generateSecret();
  const lgu = await getLguProfile();
  const issuer = lgu.name || "ProcureNance";
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
  if (!roleRequiresTwoFactor(req.currentUser.Role)) {
    return res.status(403).json({ message: "Your role does not require 2FA. Only a security administrator can change this requirement." });
  }
  const enrollment = await MfaEnrollment.findOne({ where: { userId: req.currentUser.id } });
  if (!enrollment || enrollment.status !== "pending") {
    return res.status(409).json({ message: "Start enrolment first." });
  }

  const result = await consumeToken(enrollment, req.body.token, { ip: req.ip });
  if (!result.ok) {
    await securityAudit(req, req.currentUser, AUDIT_ACTIONS.MFA_CHALLENGE_FAILED, "2FA enrollment verification failed", { result: "Denied" });
    return res.status(400).json(result);
  }

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
  const user = await User.findByPk(req.currentUser.id, { include: userIncludes });
  await securityAudit(req, user, AUDIT_ACTIONS.MFA_CHALLENGE_SUCCESS, "2FA verification successful");
  const trustedUntil = await createTrustedDevice(req, res, user, enrollment);
  await startLoginSession(req, user, { enrollment, trustedUntil, verified: true });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.MFA_ENABLED,
    entityRef: "user",
    entityId: req.currentUser.id,
    summary: `${req.currentUser.name} switched on two-factor authentication`,
    afterState: { recoveryCodesIssued: codes.length },
  });

  res.json({
    enabled: true,
    ...sessionDetails(req),
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

// Account holders cannot override their assigned role's security policy.
export const disableMfa = async (_req, res) =>
  res.status(403).json({ message: "Two-factor authentication is managed by role in Security Settings. Contact a security administrator." });

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
    await revokeUserTrust(user.id, { transaction });
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
  if (req.session.pendingMfaExpired) {
    return res.status(440).json({ message: "This sign-in took too long. Start again." });
  }
  const pendingId = req.session.pendingMfaUserId;
  if (!pendingId) {
    return res.status(400).json({ message: "Start again from the sign-in page." });
  }

  // The pending state is deliberately short-lived. A half-finished sign-in left
  // open on a shared machine should not still be usable an hour later.
  if (!req.session.pendingMfaExpiresAt || Date.now() >= req.session.pendingMfaExpiresAt) {
    delete req.session.pendingMfaUserId;
    delete req.session.pendingMfaExpiresAt;
    return res.status(440).json({ message: "This sign-in took too long. Start again." });
  }

  const user = await User.findByPk(pendingId, { include: [{ model: Role }] });
  const enrollment = user ? await MfaEnrollment.findOne({ where: { userId: user.id } }) : null;
  if (!user || user.status !== "active" || enrollment?.status !== "active" ||
      req.session.pendingRoleId !== user.Role.id ||
      req.session.pendingRoleSessionVersion !== user.Role.sessionVersion ||
      req.session.pendingCredentialVersion !== credentialVersion(user) ||
      req.session.pendingEnrollmentId !== enrollment.id) {
    delete req.session.pendingMfaUserId;
    return res.status(400).json({ message: "Start again from the sign-in page." });
  }

  if (!roleRequiresTwoFactor(user.Role)) {
    await startLoginSession(req, user);
    await securityAudit(req, user, AUDIT_ACTIONS.LOGIN_SUCCESS, "Login successful", { method: "password", twoFactorEnabled: false });
    const full = await User.findByPk(user.id, { include: userIncludes });
    return res.json({ ...serializeUser(full), ...sessionDetails(req) });
  }
  if (req.session.pendingRoleVersion !== user.Role.twoFactorVersion) {
    delete req.session.pendingMfaUserId;
    return res.status(401).json({ code: "ROLE_SECURITY_CHANGED", message: "Your role security settings changed. Please start sign-in again." });
  }
  const usingRecovery = Boolean(req.body.recoveryCode);
  if (usingRecovery && isLocked(enrollment)) {
    return res.status(429).json({ message: "Too many incorrect codes. Try again later." });
  }
  const result = usingRecovery
    ? await consumeRecoveryCode(user.id, req.body.recoveryCode, { ip: req.ip })
    : await consumeToken(enrollment, req.body.token, { ip: req.ip });

  if (!result.ok) {
    if (usingRecovery) await sequelize.transaction(async (transaction) => {
      const locked = await MfaEnrollment.findByPk(enrollment.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!locked) return;
      const failed = locked.failedAttempts + 1;
      await locked.update({
        failedAttempts: failed >= MFA_LOCK_THRESHOLD ? 0 : failed,
        lockedUntil: failed >= MFA_LOCK_THRESHOLD ? new Date(Date.now() + MFA_LOCK_MINUTES * MINUTE) : locked.lockedUntil,
      }, { transaction });
    });
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

  await securityAudit(req, user, AUDIT_ACTIONS.MFA_CHALLENGE_SUCCESS, "2FA verification successful", {
    method: usingRecovery ? "recoveryCode" : "authenticator",
  });
  // Only a successful authenticator verification creates a browser trust period.
  const trustedUntil = usingRecovery ? null : await createTrustedDevice(req, res, user, enrollment);
  await startLoginSession(req, user, { enrollment, trustedUntil, verified: true });

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
    ...sessionDetails(req),
    ...(usingRecovery ? { recoveryCodesRemaining: result.remaining } : {}),
  });
};
