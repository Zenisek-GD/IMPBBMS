import { DataTypes } from "sequelize";
import { sequelize } from "../models/db.js";
import { Role } from "../models/roleModel.js";
import { TrustedDevice } from "../models/authSecurityModel.js";
import { SystemSetting } from "../models/systemSettingModel.js";
import { Permission } from "../models/permissionModel.js";
import { AUTH_POLICY_KEY } from "./authPolicy.js";

// Additive and repeatable. Existing administrator choices are never reseeded.
export const migrateRoleSecurity = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = new Set((await qi.showAllTables()).map((table) => String(table).toLowerCase()));
  if (!tables.has(String(Role.getTableName()).toLowerCase())) return;
  const columns = await qi.describeTable(Role.getTableName());
  if (!columns.two_factor_required) {
    const legacy = tables.has(String(SystemSetting.getTableName()).toLowerCase())
      ? await SystemSetting.findOne({ where: { key: AUTH_POLICY_KEY } }) : null;
    await qi.addColumn(Role.getTableName(), "two_factor_required", {
      type: DataTypes.BOOLEAN, allowNull: false, defaultValue: legacy?.value !== "false",
    });
    await qi.changeColumn(Role.getTableName(), "two_factor_required", {
      type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true,
    });
  }
  for (const column of ["twoFactorVersion", "sessionVersion"]) {
    if (!columns[column]) await qi.addColumn(Role.getTableName(), column, {
      type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
    });
  }
  if (tables.has(String(TrustedDevice.getTableName()).toLowerCase())) {
    const trustColumns = await qi.describeTable(TrustedDevice.getTableName());
    for (const column of ["roleId", "roleVersion"]) {
      if (!trustColumns[column]) await qi.addColumn(TrustedDevice.getTableName(), column, {
        type: DataTypes.INTEGER, allowNull: true,
      });
    }
  }
  if (tables.has(String(Permission.getTableName()).toLowerCase())) {
    await Permission.findOrCreate({
      where: { key: "manage_two_factor_authentication" },
      defaults: { key: "manage_two_factor_authentication", module: "security", description: "Configure two-factor authentication requirements by role" },
    });

  }
};
