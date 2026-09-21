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
  committeeReview: { type: DataTypes.JSON, allowNull: true },
});
NegotiatedReview.belongsTo(ProcurementAttempt, { as: "sourceAttempt", foreignKey: { name: "sourceAttemptId", allowNull: false, unique: true }, onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(User, { as: "reviewer", foreignKey: "reviewerId", onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(User, { as: "approver", foreignKey: "approverId", onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(BacResolution, { as: "resolution", foreignKey: "bacResolutionId", onDelete: "RESTRICT" });
NegotiatedReview.belongsTo(Rfq, { as: "resultingRfq", foreignKey: "resultingRfqId", onDelete: "RESTRICT" });

// Preparatory records and authenticated committee actions are permanent evidence.
// A rejected proposal may be replaced, but its record and votes are retained.
export const FailureRecord = sequelize.define("FailureRecord", {
  failureNumber: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "draft" },
  reason: { type: DataTypes.TEXT, allowNull: false },
  category: { type: DataTypes.STRING(64), allowNull: false },
  explanation: { type: DataTypes.TEXT, allowNull: false },
  twgRecommendation: { type: DataTypes.TEXT, allowNull: true },
  supportingDocuments: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  committeeReview: { type: DataTypes.JSON, allowNull: true },
  decisionRemarks: { type: DataTypes.TEXT, allowNull: true },
  nextAction: { type: DataTypes.STRING, allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
});
FailureRecord.belongsTo(ProcurementAttempt, { as: "attempt", foreignKey: { name: "attemptId", allowNull: false }, onDelete: "RESTRICT" });
ProcurementAttempt.hasMany(FailureRecord, { as: "failureRecords", foreignKey: "attemptId" });
FailureRecord.belongsTo(User, { as: "creator", foreignKey: { name: "createdById", allowNull: false }, onDelete: "RESTRICT" });
FailureRecord.belongsTo(User, { as: "reviewer", foreignKey: "reviewedById", onDelete: "RESTRICT" });
FailureRecord.belongsTo(User, { as: "approver", foreignKey: "approvedById", onDelete: "RESTRICT" });
FailureRecord.belongsTo(BacResolution, { as: "resolution", foreignKey: "bacResolutionId", onDelete: "RESTRICT" });

export const BacDecisionVote = sequelize.define("BacDecisionVote", {
  subjectType: { type: DataTypes.STRING(24), allowNull: false, validate: { isIn: [["failure", "negotiated"]] } },
  subjectId: { type: DataTypes.INTEGER, allowNull: false },
  decision: { type: DataTypes.STRING(16), allowNull: false, validate: { isIn: [["approved", "rejected", "abstained"]] } },
  role: { type: DataTypes.STRING(64), allowNull: false },
  remarks: { type: DataTypes.TEXT, allowNull: false },
  votedAt: { type: DataTypes.DATE, allowNull: false },
}, { indexes: [{ unique: true, fields: ["subjectType", "subjectId", "userId"] }] });
BacDecisionVote.belongsTo(User, { as: "member", foreignKey: { name: "userId", allowNull: false }, onDelete: "RESTRICT" });
export { sequelize };
