import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
export const ProcurementLimit = sequelize.define("ProcurementLimit", {
  category: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "all" },
  procurementMethod: { type: DataTypes.STRING(100), allowNull: false },
  minimumAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  maximumAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "active" },
  policyReference: { type: DataTypes.STRING, allowNull: false },
  remarks: { type: DataTypes.TEXT, allowNull: true },
}, { indexes: [{ name: "procurement_limits_effective", fields: ["category", "procurementMethod", "effectiveDate", "status"] }] });
