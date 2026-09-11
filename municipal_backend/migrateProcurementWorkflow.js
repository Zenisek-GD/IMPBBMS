import "./config/env.js";
import { sequelize } from "./models/index.js";
import { migrateProcurementWorkflow } from "./services/migrateProcurementWorkflow.js";

try {
  await sequelize.authenticate();
  const result = await migrateProcurementWorkflow();
  console.log("Procurement workflow migration complete. Added columns:", result.added);
  console.log("Existing procurement attempts registered:", result.imported);
} catch (error) {
  console.error("Procurement workflow migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
