// Add the explicit cross-sectoral value used by the one-field primary-goal
// form. This is deliberately narrow: it changes only the existing MySQL ENUM
// and preserves every stored goal and every existing sector value.
import { sequelize } from "./models/db.js";

const sectors = ["general", "social", "economic", "infrastructure", "environment", "institutional"];
const enumValues = sectors.map((sector) => `'${sector}'`).join(", ");

try {
  await sequelize.authenticate();
  await sequelize.query(
    `ALTER TABLE \`developmentgoals\` MODIFY COLUMN \`sector\` ENUM(${enumValues}) NOT NULL`
  );
  console.log("Planning goal sector updated: General / cross-sectoral is now available.");
} finally {
  await sequelize.close();
}
