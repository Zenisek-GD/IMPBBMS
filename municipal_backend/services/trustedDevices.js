import { Op } from "sequelize";
import { TrustedDevice } from "../models/authSecurityModel.js";
import { SystemSetting } from "../models/systemSettingModel.js";
import { recordAudit, AUDIT_ACTIONS } from "./auditLog.js";
import {
  AUTH_POLICY_KEY, TRUST_DURATION_MS, hashToken, credentialVersion,
  newDeviceToken, cookieOptions, trustCookieName, readDeviceToken, trustedRecordValid,
} from "./authPolicy.js";

export const twoFactorEnabled = async () => {
  const row = await SystemSetting.findOne({ where: { key: AUTH_POLICY_KEY } });
  return row?.value !== "false"; // Missing or malformed policy fails closed.
};

export const securityAudit = (req, user, actionType, summary, afterState = {}) =>
  recordAudit({
    actionType, outcome: actionType.endsWith(".failed") ? "denied" : "success",
    entityRef: "auth", entityId: user.id, actorId: user.id,
    actorName: user.name, actorRole: user.Role?.key ?? null, ipAddress: req.ip,
    summary, afterState: { device: "Current Browser", ...afterState },
  });

export const expireTrustedDevice = async (row) => {
  const removed = await TrustedDevice.destroy({
    where: { id: row.id, twoFactorTrustedUntil: { [Op.lte]: new Date() } },
  });
  if (removed) await recordAudit({
    actionType: AUDIT_ACTIONS.MFA_TRUST_EXPIRED, actorId: row.userId,
    entityRef: "auth", entityId: row.userId, summary: "Trusted 2FA expired",
    afterState: { deviceRecordId: row.id, trustedUntil: row.twoFactorTrustedUntil },
  });
};

export const findTrustedDevice = async (req, user, enrollment) => {
  const token = readDeviceToken(req, user.id);
  const row = token ? await TrustedDevice.findOne({
    where: { userId: user.id, tokenHash: hashToken(token) },
  }) : null;
  if (row && Date.now() >= new Date(row.twoFactorTrustedUntil).getTime()) {
    await expireTrustedDevice(row);
  }
  if (trustedRecordValid(row, user, enrollment)) {
    await securityAudit(req, user, AUDIT_ACTIONS.MFA_TRUST_USED, "Trusted 2FA used during login", {
      result: "Authenticator Code Skipped", deviceRecordId: row.id,
      trustedUntil: row.twoFactorTrustedUntil,
    });
    return row;
  }
  if (row) await TrustedDevice.destroy({ where: { id: row.id } });
  await securityAudit(req, user, AUDIT_ACTIONS.LOGIN_NEW_DEVICE,
    "Login from an untrusted browser/device", { result: "Authenticator Code Required" });
  return null;
};

export const createTrustedDevice = async (req, res, user, enrollment) => {
  const oldToken = readDeviceToken(req, user.id);
  if (oldToken) await TrustedDevice.destroy({ where: { userId: user.id, tokenHash: hashToken(oldToken) } });
  const token = newDeviceToken();
  const verifiedAt = Date.now();
  const trustedUntil = verifiedAt + TRUST_DURATION_MS;
  const row = await TrustedDevice.create({
    userId: user.id, enrollmentId: enrollment.id, credentialVersion: credentialVersion(user),
    tokenHash: hashToken(token), verifiedAt: new Date(verifiedAt),
    twoFactorTrustedUntil: new Date(trustedUntil),
  });
  res.cookie(trustCookieName(user.id), token, { ...cookieOptions(), maxAge: TRUST_DURATION_MS });
  await securityAudit(req, user, AUDIT_ACTIONS.MFA_TRUST_CREATED, "Trusted 2FA created", {
    deviceRecordId: row.id, verifiedAt: new Date(verifiedAt), trustedUntil: new Date(trustedUntil),
  });
  return trustedUntil;
};

export const revokeUserTrust = (userId, options = {}) =>
  TrustedDevice.destroy({ where: { userId }, ...options });
