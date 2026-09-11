import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { Rfq, Bid } from "./biddingModel.js";
import { User } from "./userModel.js";

export const TwgDeclaration = sequelize.define("TwgDeclaration", {
  noConflictDeclared: { type: DataTypes.BOOLEAN, allowNull: false },
  declaredAt: { type: DataTypes.DATE, allowNull: false },
}, { indexes: [{ unique: true, fields: ["rfqId", "memberId"] }] });
TwgDeclaration.belongsTo(Rfq, { as: "rfq", foreignKey: { name: "rfqId", allowNull: false }, onDelete: "RESTRICT" });
TwgDeclaration.belongsTo(User, { as: "member", foreignKey: { name: "memberId", allowNull: false }, onDelete: "RESTRICT" });

export const TwgAssessment = sequelize.define("TwgAssessment", {
  requirements: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  recommendation: { type: DataTypes.STRING, allowNull: true },
  remarks: { type: DataTypes.TEXT, allowNull: true },
  supportingInformation: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM("draft", "submitted"), allowNull: false, defaultValue: "draft" },
  noConflictDeclared: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  declaredAt: { type: DataTypes.DATE, allowNull: false },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ unique: true, fields: ["bidId", "memberId"] }] });
TwgAssessment.belongsTo(Bid, { as: "bid", foreignKey: { name: "bidId", allowNull: false }, onDelete: "RESTRICT" });
Bid.hasMany(TwgAssessment, { as: "twgAssessments", foreignKey: "bidId" });
TwgAssessment.belongsTo(User, { as: "member", foreignKey: { name: "memberId", allowNull: false }, onDelete: "RESTRICT" });
