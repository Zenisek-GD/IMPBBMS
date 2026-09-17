import { DataTypes } from "sequelize";
import { sequelize } from "../models/db.js";
import { PublicMessage } from "../models/publicMessageModel.js";

// Additive and repeatable. `sequelize.sync()` safely creates a new table but
// does not add a column to an established PublicMessages table, so existing
// deployments need this focused migration before contextual reports can persist.
export const migratePublicMessageProjectContext = async ({
  queryInterface = sequelize.getQueryInterface(),
  tableName = PublicMessage.getTableName(),
} = {}) => {
  const tables = new Set(
    (await queryInterface.showAllTables()).map((table) =>
      String(typeof table === "string" ? table : table.tableName).toLowerCase())
  );
  if (!tables.has(String(tableName).toLowerCase())) return { added: false, reason: "tableMissing" };

  const columns = await queryInterface.describeTable(tableName);
  if (columns.projectContext) return { added: false, reason: "alreadyPresent" };

  await queryInterface.addColumn(tableName, "projectContext", {
    type: DataTypes.JSON,
    allowNull: true,
  });
  return { added: true, reason: "added" };
};
