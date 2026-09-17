import "./config/env.js";
import { sequelize } from "./models/db.js";
import { migrateAuditVisibility } from "./services/migrateAuditVisibility.js";

try {
  await sequelize.authenticate();
  const result = await migrateAuditVisibility();
  console.log(`Audit visibility permission migration: ${result.reason}.`);
} finally {
  await sequelize.close();
}
