import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Municipal offices/units. Design doc Section 7.7 allows non-BAC offices (GSO,
// IT Office, etc.) to raise their own procurement, so `type` records what part
// the office plays rather than what it is allowed to do — permissions stay
// entirely on the user's Role, per Section 2.2.
export const Department = sequelize.define("Department", {
  name: { type: DataTypes.STRING, allowNull: false },
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  type: {
    type: DataTypes.ENUM("endUser", "committee", "support", "executive"),
    allowNull: false,
    defaultValue: "endUser",
  },
  status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },

  // Design doc Section 5.2 requires a "Department Head endorses it" step, but
  // Section 2.1 lists no Department Head role and Section 2.3 grants no such
  // permission — an inconsistency in the spec. Rather than invent a 13th role,
  // the head is modelled as a designated user *within* the office: whoever is
  // named here may endorse that department's requisitions. Set via
  // PATCH /api/departments/:id { headUserId }.
  headUserId: { type: DataTypes.INTEGER, allowNull: true },
});

export { sequelize };
