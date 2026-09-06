import "./config/env.js";
import { sequelize } from "./models/db.js";
import { TrustedDevice, LoginSession } from "./models/authSecurityModel.js";
import { migrateRoleSecurity } from "./services/migrateRoleSecurity.js";

try {
  await sequelize.authenticate();
  await TrustedDevice.sync();
  await LoginSession.sync();
  await migrateRoleSecurity();
  console.log("Role-based authentication security schema is ready. Existing policy choices were preserved.");
} finally {
  await sequelize.close();
}
