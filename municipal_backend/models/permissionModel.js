import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { Role } from "./roleModel.js";

// Design doc Section 2.2: "Every role has an explicit, enumerated permission
// set — no implicit or inherited access." Permissions are rows, not code, so
// the matrix in Section 2.3 can be audited and changed without a redeploy.
export const Permission = sequelize.define("Permission", {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  module: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: false },
});

// Join table is explicit so it can carry audit columns later if needed.
export const RolePermission = sequelize.define("RolePermission", {}, { timestamps: true });

Role.belongsToMany(Permission, { through: RolePermission, foreignKey: "roleId" });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: "permissionId" });

export { sequelize };
