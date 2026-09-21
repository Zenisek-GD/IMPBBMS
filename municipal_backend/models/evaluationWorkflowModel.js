import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { Rfq, Bid } from "./biddingModel.js";
import { User } from "./userModel.js";

export const EvaluationPlan = sequelize.define("EvaluationPlan", {
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  status: { type: DataTypes.ENUM("draft", "approved"), allowNull: false, defaultValue: "draft" },
  criteria: { type: DataTypes.JSON, allowNull: false },
  qualityWeight: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  financialWeight: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  passingScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  financialMethod: { type: DataTypes.STRING, allowNull: false, defaultValue: "lowestResponsivePrice" },
  approvalReference: { type: DataTypes.STRING, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ unique: true, fields: ["rfqId"] }] });
EvaluationPlan.belongsTo(Rfq, { as: "rfq", foreignKey: { name: "rfqId", allowNull: false }, onDelete: "RESTRICT" });
EvaluationPlan.belongsTo(User, { as: "preparedBy", foreignKey: "preparedById", onDelete: "RESTRICT" });
EvaluationPlan.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById", onDelete: "RESTRICT" });

export const EvaluatorDeclaration = sequelize.define("EvaluatorDeclaration", {
  role: { type: DataTypes.STRING, allowNull: false },
  noConflictDeclared: { type: DataTypes.BOOLEAN, allowNull: false },
  declaredAt: { type: DataTypes.DATE, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  reassignmentRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { indexes: [{ unique: true, fields: ["rfqId", "userId"] }] });
EvaluatorDeclaration.belongsTo(Rfq, { as: "rfq", foreignKey: { name: "rfqId", allowNull: false }, onDelete: "RESTRICT" });
EvaluatorDeclaration.belongsTo(User, { as: "user", foreignKey: { name: "userId", allowNull: false }, onDelete: "RESTRICT" });

export const EvaluationReturn = sequelize.define("EvaluationReturn", {
  targetType: { type: DataTypes.ENUM("evaluation", "twgAssessment"), allowNull: false },
  targetId: { type: DataTypes.INTEGER, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  returnedAt: { type: DataTypes.DATE, allowNull: false },
  previousSubmission: { type: DataTypes.JSON, allowNull: false },
  updatedSubmission: { type: DataTypes.JSON, allowNull: true },
  correctedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ fields: ["targetType", "targetId"] }] });
EvaluationReturn.belongsTo(Bid, { as: "bid", foreignKey: { name: "bidId", allowNull: false }, onDelete: "RESTRICT" });
EvaluationReturn.belongsTo(User, { as: "returnedBy", foreignKey: { name: "returnedById", allowNull: false }, onDelete: "RESTRICT" });
EvaluationReturn.belongsTo(User, { as: "evaluator", foreignKey: { name: "evaluatorId", allowNull: false }, onDelete: "RESTRICT" });

export const EvaluationCriteriaAmendment = sequelize.define("EvaluationCriteriaAmendment", {
  status: { type: DataTypes.ENUM("submitted", "approved"), allowNull: false, defaultValue: "submitted" },
  reason: { type: DataTypes.TEXT, allowNull: false },
  previousPlan: { type: DataTypes.JSON, allowNull: false },
  proposedPlan: { type: DataTypes.JSON, allowNull: false },
  supportingDocuments: { type: DataTypes.JSON, allowNull: false },
  approvalReference: { type: DataTypes.STRING, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
});
EvaluationCriteriaAmendment.belongsTo(Rfq, { as: "rfq", foreignKey: { name: "rfqId", allowNull: false }, onDelete: "RESTRICT" });
EvaluationCriteriaAmendment.belongsTo(User, { as: "requestedBy", foreignKey: { name: "requestedById", allowNull: false }, onDelete: "RESTRICT" });
EvaluationCriteriaAmendment.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById", onDelete: "RESTRICT" });
