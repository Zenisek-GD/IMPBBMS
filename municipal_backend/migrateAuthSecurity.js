import "./config/env.js";
import { sequelize } from "./models/db.js";
import { TrustedDevice, LoginSession } from "./models/authSecurityModel.js";
import { SystemSetting } from "./models/systemSettingModel.js";
import { AUTH_POLICY_KEY } from "./services/authPolicy.js";

// Additive upgrade only: never force-sync or alter existing application tables.
try {
  await sequelize.authenticate();
  await TrustedDevice.sync();
  await LoginSession.sync();
  await SystemSetting.findOrCreate({
    where: { key: AUTH_POLICY_KEY },
    defaults: { key: AUTH_POLICY_KEY, value: "true", description: "Require authenticator verification when signing in." },
  });
  console.log("Authentication security schema is ready. Default 2FA policy: ON for new installations.");
} finally {
  await sequelize.close();
}
