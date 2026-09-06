import { sequelize } from "../models/db.js";
import { SystemSetting } from "../models/systemSettingModel.js";
import { TrustedDevice } from "../models/authSecurityModel.js";
import { AUTH_POLICY_KEY, TRUST_DURATION_MS, SESSION_DURATION_MS } from "../services/authPolicy.js";
import { twoFactorEnabled } from "../services/trustedDevices.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

const describePolicy = (enabled) => ({
  twoFactorEnabled: enabled, require2faOnNewDevice: enabled,
  trusted2faDurationMinutes: TRUST_DURATION_MS / 60_000,
  sessionDurationMinutes: SESSION_DURATION_MS / 60_000, automaticSessionLogout: true,
});

export const getAuthenticationSecurity = async (_req, res) =>
  res.json(describePolicy(await twoFactorEnabled()));

export const updateAuthenticationSecurity = async (req, res) => {
  const { twoFactorEnabled: enabled, confirmDisable } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ message: "twoFactorEnabled must be ON or OFF." });
  }
  if (!enabled && confirmDisable !== true) {
    return res.status(400).json({ code: "CONFIRMATION_REQUIRED", message: "Confirm disabling two-factor authentication." });
  }
  let changed = false;
  await sequelize.transaction(async (transaction) => {
    const [row] = await SystemSetting.findOrCreate({
      where: { key: AUTH_POLICY_KEY },
      defaults: { key: AUTH_POLICY_KEY, value: "true", description: "Require authenticator verification when signing in." },
      transaction,
    });
    await row.reload({ transaction, lock: transaction.LOCK.UPDATE });
    changed = (row.value !== "false") !== enabled;
    if (changed) {
      await row.update({ value: String(enabled) }, { transaction });
      // Old trust must not survive a policy off/on cycle.
      await TrustedDevice.destroy({ where: {}, transaction });
    }
  });
  if (changed) await auditFromRequest(req, {
    actionType: enabled ? AUDIT_ACTIONS.MFA_POLICY_ENABLED : AUDIT_ACTIONS.MFA_POLICY_DISABLED,
    entityRef: "securitySettings",
    summary: `Administrator ${enabled ? "enabled" : "disabled"} 2FA`,
    afterState: describePolicy(enabled),
  });
  res.json(describePolicy(enabled));
};
