import "./config/env.js";
import { sequelize } from "./models/db.js";
import { migratePlanningGoalSector } from "./services/migratePlanningGoalSector.js";

try {
  await sequelize.authenticate();
  const added = await migratePlanningGoalSector(sequelize);
  console.log(added ? "Planning goal sector updated: General / cross-sectoral is now available." : "Planning goal sector is already up to date.");
} finally {
  await sequelize.close();
}
