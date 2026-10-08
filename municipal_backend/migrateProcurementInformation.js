import "./config/env.js";
import { sequelize } from "./models/index.js";
import { migrateProcurementInformation } from "./services/migrateProcurementInformation.js";

try {
  await sequelize.authenticate();
  console.log("Procurement information migration:", await migrateProcurementInformation());
} catch (error) {
  console.error("Procurement information migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
