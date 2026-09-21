import "./config/env.js";
import { sequelize } from "./models/index.js";
import { migrateFailureGovernance } from "./services/migrateFailureGovernance.js";

try {
  await sequelize.authenticate();
  const result = await migrateFailureGovernance();
  console.log("Failure governance migration complete. Added columns:", result.added);
} catch (error) {
  console.error("Failure governance migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
