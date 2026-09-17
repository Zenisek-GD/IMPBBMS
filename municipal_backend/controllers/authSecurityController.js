import { Op } from "sequelize";
import { Role } from "../models/roleModel.js";
import { User } from "../models/userModel.js";
import { TrustedDevice, LoginSession } from "../models/authSecurityModel.js";
import {
  TRUST_DURATION_MS, DEFAULT_SESSION_DURATION_MINUTES, SESSION_DURATION_OPTIONS_MINUTES,
  isSessionDurationMinutes,
} from "../services/authPolicy.js";
import { withAuditTransaction, AUDIT_ACTIONS } from "../services/auditLog.js";
import { SystemSetting, SETTING_KEYS, getSessionDurationMinutes } from "../models/systemSettingModel.js";

const describePolicy = async () => {
  const roles = await Role.findAll({
    attributes: ["id", "key", "name", "twoFactorRequired", "twoFactorVersion"], order: [["name", "ASC"]],
  });
  return {
    roles, requiredRoleCount: roles.filter((role) => role.twoFactorRequired).length,
    trusted2faDurationMinutes: TRUST_DURATION_MS / 60_000,
  };
};
export const getAuthenticationSecurity = async (_req, res) => res.json(await describePolicy());
const fail = (status, message, code) => { throw Object.assign(new Error(message), { status, code }); };

const describeSessionPolicy = async () => ({
  automaticSessionLogout: true,
  sessionDurationMinutes: await getSessionDurationMinutes(),
  allowedSessionDurationMinutes: SESSION_DURATION_OPTIONS_MINUTES,
});

export const getSessionSecurityPolicy = async (_req, res) => res.json(await describeSessionPolicy());

export const updateSessionSecurityPolicy = async (req, res) => {
  const { sessionDurationMinutes, expectedSessionDurationMinutes } = req.body ?? {};
  if (!isSessionDurationMinutes(sessionDurationMinutes) || !isSessionDurationMinutes(expectedSessionDurationMinutes)) {
    return res.status(400).json({
      message: `Choose a session duration of ${SESSION_DURATION_OPTIONS_MINUTES.join(", ")} minutes and reload before saving if the policy changed.`,
    });
  }

  try {
    await withAuditTransaction(async (transaction, audit) => {
      let setting = await SystemSetting.findOne({
        where: { key: SETTING_KEYS.SESSION_DURATION_MINUTES }, transaction, lock: transaction.LOCK.UPDATE,
      });
      const current = Number(setting?.value);
      const currentMinutes = isSessionDurationMinutes(current) ? current : DEFAULT_SESSION_DURATION_MINUTES;
      if (currentMinutes !== expectedSessionDurationMinutes) {
        fail(409, "The session policy was changed by another administrator. Reload settings and review your change.", "POLICY_CONFLICT");
      }
      if (currentMinutes === sessionDurationMinutes) return;

      if (setting) {
        await setting.update({ value: String(sessionDurationMinutes) }, { transaction });
      } else {
        setting = await SystemSetting.create({
          key: SETTING_KEYS.SESSION_DURATION_MINUTES,
          value: String(sessionDurationMinutes),
          description: "Maximum lifetime in minutes for newly authenticated browser sessions.",
        }, { transaction });
      }
      await audit({
        actionType: AUDIT_ACTIONS.SESSION_POLICY_UPDATED,
        entityRef: "systemSetting", entityId: setting.id,
        actorId: req.currentUser.id, actorName: req.currentUser.name,
        actorRole: req.currentUser.Role.key, ipAddress: req.ip,
        summary: `Session duration changed from ${currentMinutes} to ${sessionDurationMinutes} minutes`,
        beforeState: { sessionDurationMinutes: currentMinutes },
        afterState: { sessionDurationMinutes, appliesTo: "new authenticated sessions" },
      });
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    throw error;
  }
  res.json(await describeSessionPolicy());
};

export const updateAuthenticationSecurity = async (req, res) => {
  const { roles: updates, confirmDisable, applyMode } = req.body ?? {};
  if (!Array.isArray(updates) || !updates.length || updates.length > 500 ||
      updates.some((row) => !row || !Number.isSafeInteger(row.id) || row.id < 1 ||
        typeof row.twoFactorRequired !== "boolean" || !Number.isSafeInteger(row.expectedVersion) || row.expectedVersion < 0) ||
      new Set(updates.map((row) => row.id)).size !== updates.length) {
    return res.status(400).json({ message: "Provide unique role IDs, a boolean twoFactorRequired and an expectedVersion for each change." });
  }
  if (applyMode != null && !["nextLogin", "forceReauthentication"].includes(applyMode)) {
    return res.status(400).json({ message: "Choose Apply on Next Login or Force Re-Authentication Now." });
  }
  let reauthenticationRequired = false;
  try {
    await withAuditTransaction(async (transaction, audit) => {
      const roles = await Role.findAll({
        where: { id: { [Op.in]: updates.map((row) => row.id) } },
        order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE,
      });
      if (roles.length !== updates.length) fail(400, "One or more roles do not exist.");
      const requested = new Map(updates.map((row) => [row.id, row]));
      const changes = roles.filter((role) => {
        const update = requested.get(role.id);
        if (role.twoFactorVersion !== update.expectedVersion) {
          fail(409, "These roles were changed by another administrator. Reload settings and review your changes.", "POLICY_CONFLICT");
        }
        return role.twoFactorRequired !== update.twoFactorRequired;
      });
      if (changes.some((role) => role.twoFactorRequired) && confirmDisable !== true) {
        fail(400, "Confirm disabling two-factor authentication for the affected roles.", "CONFIRMATION_REQUIRED");
      }
      if (changes.some((role) => !role.twoFactorRequired) && !applyMode) {
        fail(400, "Choose how to apply the enabled roles to existing sessions.", "APPLY_MODE_REQUIRED");
      }
      for (const role of changes) {
        const before = role.twoFactorRequired;
        const enabled = requested.get(role.id).twoFactorRequired;
        const force = enabled && applyMode === "forceReauthentication";
        const members = await User.findAll({ where: { roleId: role.id }, attributes: ["id"], transaction });
        const ids = members.map((user) => user.id);
        await role.update({
          twoFactorRequired: enabled, twoFactorVersion: role.twoFactorVersion + 1,
          sessionVersion: role.sessionVersion + (force ? 1 : 0),
        }, { transaction });
        let revokedSessions = 0;
        if (ids.length) {
          await TrustedDevice.destroy({ where: { userId: { [Op.in]: ids } }, transaction });
          if (force) {
            [revokedSessions] = await LoginSession.update({
              endedAt: new Date(), endReason: "rolePolicy", data: {},
            }, {
              where: { endedAt: null, [Op.or]: [
                { "data.userId": { [Op.in]: ids } }, { "data.pendingMfaUserId": { [Op.in]: ids } },
              ] }, transaction,
            });
          }
        }
        if (force && req.currentUser.roleId === role.id) reauthenticationRequired = true;
        await audit({
          actionType: enabled ? AUDIT_ACTIONS.ROLE_MFA_ENABLED : AUDIT_ACTIONS.ROLE_MFA_DISABLED,
          entityRef: "role", entityId: role.id,
          actorId: req.currentUser.id, actorName: req.currentUser.name,
          actorRole: req.currentUser.Role.key, ipAddress: req.ip,
          summary: "Role 2FA " + (enabled ? "Enabled" : "Disabled") + ": " + role.name,
          beforeState: { roleName: role.name, twoFactorRequired: before },
          afterState: { roleName: role.name, twoFactorRequired: enabled, applyMode: enabled ? applyMode : "nextLogin", revokedSessions },
        });
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    throw error;
  }
  res.json({ ...await describePolicy(), reauthenticationRequired });
};
