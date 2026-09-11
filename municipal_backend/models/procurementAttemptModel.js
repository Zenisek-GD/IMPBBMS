import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { Rfq } from "./biddingModel.js";
import { BacResolution } from "./bacResolutionModel.js";
import { User } from "./userModel.js";

export const ProcurementAttempt = sequelize.define("ProcurementAttempt", {
  projectKey: { type: DataTypes.STRING(100), allowNull: false },
  attemptNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "ongoing" },
  failureReason: { type: DataTypes.TEXT, allowNull: true },
  nextAction: { type: DataTypes.STRING, allowNull: true },
  outcomeSnapshot: { type: DataTypes.JSON, allowNull: true },
  supportingDocuments: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  startedAt: { type: DataTypes.DATE, allowNull: false },
  completedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ unique: true, fields: ["projectKey", "attemptNumber"] }, { fields: ["status"] }] });
ProcurementAttempt.belongsTo(Rfq, { as: "rfq", foreignKey: { name: "rfqId", allowNull: false, unique: true }, onDelete: "RESTRICT" });
Rfq.hasOne(ProcurementAttempt, { as: "attempt", foreignKey: "rfqId" });
ProcurementAttempt.belongsTo(BacResolution, { as: "resolution", foreignKey: "bacResolutionId", onDelete: "RESTRICT" });
ProcurementAttempt.belongsTo(User, { as: "responsibleUser", foreignKey: "responsibleUserId", onDelete: "RESTRICT" });

export const NegotiatedReview = sequelize.define("NegotiatedReview", {
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "pending" },
  justification: { type: DataTypes.TEXT, allowNull: false },
  legalBasis: { type: DataTypes.TEXT, allowNull: false },
  supportingDocuments: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  eligibilitySnapshot: { type: DataTypes.JSON, allowNull: false },
  decisionRemarks: { type: DataTypes.TEXT, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: false },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
});
NegotiatedReview.belongsTo(ProcurementAttempt, { as: "sourceAttempt", foreignKey: { name: "sourceAttemptId", allowNull: false, unique: true }, onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(User, { as: "reviewer", foreignKey: "reviewerId", onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(User, { as: "approver", foreignKey: "approverId", onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(BacResolution, { as: "resolution", foreignKey: "bacResolutionId", onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(Rfq, { as: "resultingRfq", foreignKey: "resultingRfqId", onDelete: "RESTRICT" });
export { sequelize };
