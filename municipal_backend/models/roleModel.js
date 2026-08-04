import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { Department } from "./departmentModel.js";

// `key` is the stable camelCase slug the frontend uses to pick nav config /
// landing route (see municipal-frontend/src/config/navigation.js). `name` is
// the human-readable label from the system design doc, Section 2.1.
export const Role = sequelize.define("Role", {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
});

// The office a role normally sits in. This only pre-fills the department when
// an administrator creates a user — it is a convenience, not a constraint, so
// roles that legitimately span offices (Department Requester across GSO,
// Engineering, Health...) can still be placed anywhere. Null for roles that are
// external to the LGU.
Role.belongsTo(Department, { as: "defaultDepartment", foreignKey: "defaultDepartmentId" });

export { sequelize };
