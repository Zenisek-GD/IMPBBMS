import "./config/env.js";
import { sequelize } from "./models/db.js";
import { migrateUserTextSize } from "./services/migrateUserTextSize.js";

try {
  await sequelize.authenticate();
  console.log(await migrateUserTextSize(sequelize)
    ? "User text-size preference column added."
    : "User text-size preference column already exists.");
} finally {
  await sequelize.close();
}
