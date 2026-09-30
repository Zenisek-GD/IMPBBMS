import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const BUDGET_CONTROL_KINDS = ["allocation", "closeout", "transfer", "correction", "migration", "reenactment"];
export const CLOSEOUT_CLASSIFICATIONS = ["contractSavings", "unusedAppropriation", "cancelledObligation", "outstandingRetention", "revertedAmount", "other"];

// These are approved financial reservations, never inferred from an APP's ABC.
export const ProjectAllocation = sequelize.define("ProjectAllocation", {
  appEntryId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  appropriationId: { type: DataTypes.INTEGER, allowNull: false },
  fiscalYear: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  status: { type: DataTypes.ENUM("active", "closed"), allowNull: false, defaultValue: "active" },
  approvedById: { type: DataTypes.INTEGER, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  sourceRequestId: { type: DataTypes.INTEGER, allowNull: true },
  origin: { type: DataTypes.ENUM("approvedRequest", "legacyObligation"), allowNull: false, defaultValue: "approvedRequest" },
}, { indexes: [{ fields: ["appropriationId", "fiscalYear"] }] });

// Submitted records and their evidence cannot be edited. A rejected request is
// retained; a corrected request is a new record, preserving the decision trail.
export const BudgetControlRequest = sequelize.define("BudgetControlRequest", {
  kind: { type: DataTypes.ENUM(...BUDGET_CONTROL_KINDS), allowNull: false },
  status: { type: DataTypes.ENUM("draft", "submitted", "approved", "rejected"), allowNull: false, defaultValue: "draft" },
  sourceProjectId: { type: DataTypes.INTEGER, allowNull: true },
  destinationProjectId: { type: DataTypes.INTEGER, allowNull: true },
  sourceAppropriationId: { type: DataTypes.INTEGER, allowNull: true },
  destinationAppropriationId: { type: DataTypes.INTEGER, allowNull: true },
  fiscalYear: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  classification: { type: DataTypes.STRING, allowNull: true },
  fund: { type: DataTypes.STRING, allowNull: true },
  expenseClass: { type: DataTypes.STRING, allowNull: true },
  sector: { type: DataTypes.STRING, allowNull: true },
  reason: { type: DataTypes.TEXT, allowNull: false },
  authorityReference: { type: DataTypes.STRING, allowNull: false },
  supportingDocumentIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  beforeBalances: { type: DataTypes.JSON, allowNull: true },
  afterBalances: { type: DataTypes.JSON, allowNull: true },
  requesterId: { type: DataTypes.INTEGER, allowNull: false },
  approverId: { type: DataTypes.INTEGER, allowNull: true },
  requestedAt: { type: DataTypes.DATE, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  decisionRemarks: { type: DataTypes.TEXT, allowNull: true },
}, { indexes: [{ fields: ["fiscalYear", "status"] }, { fields: ["sourceProjectId", "kind", "status"] }] });
