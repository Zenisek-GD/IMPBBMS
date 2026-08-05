import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Department } from "./departmentModel.js";
import { InvestmentProgram, AipEntry } from "./investmentProgramModel.js";
import { FUNDS, EXPENSE_CLASSES } from "./appropriationModel.js";

// ── THE BUDGET, BEFORE IT IS AN ORDINANCE ────────────────────────────────────
// The appropriation register records what the Sanggunian enacted. It could not
// say how the LGU got there, because the whole preparation and authorisation
// process happened outside the system and a Budget Officer simply typed the
// enacted figures in. That made the single most consequential number in the
// platform — how much an office may spend — an unsourced manual entry.
//
// This module is that missing history, and it follows the statutory sequence:
//
//   offices prepare proposals from the AIP        (LGC Sec. 316(b))
//     → Municipal Budget Council reviews them
//       → Planning Office consolidates
//         → Local Finance Committee budget forum   (LGC Sec. 316: the LFC is
//           the Planning and Development Coordinator, the Budget Officer and
//           the Treasurer — recommending income estimates and expenditure
//           ceilings, which is exactly what the forum settles)
//           → budget hearing: offices justify what they asked for
//             → deliberation and finalisation
//               → the Mayor approves the executive budget  (Sec. 318)
//                 → the Sanggunian enacts the Appropriation Ordinance (Sec. 319)
//                   → the Sangguniang Panlalawigan reviews it for legality
//                     (Sec. 327: a component municipality's ordinance is
//                     reviewable, and is deemed approved if the province does
//                     not act within 90 days)
//                       → enactment writes the Appropriation lines
//
// Only the last step touches money the rest of the system can spend. Everything
// before it is a proposal, and the state machine's job is to stop a proposal
// from being treated as authority.

export const EXECUTIVE_BUDGET_STATES = [
  "draft",
  "pendingMbcReview",
  "pendingPlanningConsolidation",
  "pendingBudgetForum",
  "pendingBudgetHearing",
  "pendingFinalisation",
  "pendingMayorApproval",
  "pendingSanggunianAction",
  "pendingProvincialReview",
  "enacted",
  "returned",
];

export const EXECUTIVE_BUDGET_STATE_LABELS = {
  draft: "Draft — offices preparing proposals",
  pendingMbcReview: "Municipal Budget Council review",
  pendingPlanningConsolidation: "Planning Office consolidation",
  pendingBudgetForum: "Local Finance Committee budget forum",
  pendingBudgetHearing: "Budget hearing",
  pendingFinalisation: "Deliberation and finalisation",
  pendingMayorApproval: "Awaiting the Mayor's approval",
  pendingSanggunianAction: "Before the Sangguniang Bayan",
  pendingProvincialReview: "Under Sangguniang Panlalawigan review",
  enacted: "Enacted — appropriations released",
  returned: "Returned for revision",
};

export const BUDGET_TYPES = ["annual", "supplemental"];

// Outcomes of the provincial review under LGC Sec. 327. "Deemed approved" is a
// real outcome, not an absence of one: if the Sangguniang Panlalawigan takes no
// action within 90 days the ordinance stands, and the system has to be able to
// say so rather than leaving the budget stuck forever.
export const PROVINCIAL_REVIEW_OUTCOMES = [
  "approved",
  "deemedApproved",
  "declaredInoperativeInPart",
  "declaredInoperativeInFull",
];

export const PROVINCIAL_REVIEW_LABELS = {
  approved: "Approved by the Sangguniang Panlalawigan",
  deemedApproved: "Deemed approved — no action within 90 days (LGC Sec. 327)",
  declaredInoperativeInPart: "Declared inoperative in part",
  declaredInoperativeInFull: "Declared inoperative in full",
};

export const ExecutiveBudget = sequelize.define(
  "ExecutiveBudget",
  {
    fiscalYear: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM(...BUDGET_TYPES), allowNull: false, defaultValue: "annual" },
    title: { type: DataTypes.STRING, allowNull: false },

    status: {
      type: DataTypes.ENUM(...EXECUTIVE_BUDGET_STATES),
      allowNull: false,
      defaultValue: "draft",
    },

    // ── What the Local Finance Committee settles at the forum ─────────────────
    // The forum is where revenue reality meets departmental appetite. Both
    // numbers are recorded because the ceiling is only defensible next to the
    // income it was derived from.
    estimatedIncome: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    expenditureCeiling: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

    // The growth cap the committee applies to each office's previous
    // appropriation. The municipality's practice is "in some cases only a 5%
    // increase", so this is a stored per-budget figure rather than a constant,
    // and exceeding it flags a proposal for the hearing instead of rejecting
    // it — the hearing is precisely where an over-ceiling request is argued.
    ceilingGrowthPct: { type: DataTypes.DECIMAL(6, 3), allowNull: true },

    // Milestones. Each is written by the transition that performs it, so the
    // record shows not just where the budget is but when each body acted.
    mbcReviewedAt: { type: DataTypes.DATE, allowNull: true },
    consolidatedAt: { type: DataTypes.DATE, allowNull: true },
    forumHeldAt: { type: DataTypes.DATE, allowNull: true },
    hearingConcludedAt: { type: DataTypes.DATE, allowNull: true },
    finalisedAt: { type: DataTypes.DATE, allowNull: true },
    mayorApprovedAt: { type: DataTypes.DATE, allowNull: true },

    // Sangguniang Bayan action — the Appropriation Ordinance itself.
    ordinanceNo: { type: DataTypes.STRING, allowNull: true },
    ordinanceDate: { type: DataTypes.DATEONLY, allowNull: true },
    sanggunianActedAt: { type: DataTypes.DATE, allowNull: true },

    // Sangguniang Panlalawigan review.
    provincialReviewOutcome: {
      type: DataTypes.ENUM(...PROVINCIAL_REVIEW_OUTCOMES),
      allowNull: true,
    },
    provincialReviewedAt: { type: DataTypes.DATE, allowNull: true },
    provincialRemarks: { type: DataTypes.TEXT, allowNull: true },

    enactedAt: { type: DataTypes.DATE, allowNull: true },
    returnRemarks: { type: DataTypes.TEXT, allowNull: true },
  },
  { indexes: [{ fields: ["fiscalYear", "type"] }, { fields: ["status"] }] }
);

ExecutiveBudget.belongsTo(InvestmentProgram, { as: "program", foreignKey: "investmentProgramId" });
InvestmentProgram.hasMany(ExecutiveBudget, { as: "budgets", foreignKey: "investmentProgramId" });

ExecutiveBudget.belongsTo(User, { as: "preparedBy", foreignKey: "preparedById" });
ExecutiveBudget.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById" });

// ── DEPARTMENT BUDGET PROPOSAL ───────────────────────────────────────────────
export const PROPOSAL_STATES = [
  "draft",
  "submitted",
  "mbcReviewed",
  "consolidated",
  "heard",
  "finalised",
  "returned",
];

export const BudgetProposal = sequelize.define(
  "BudgetProposal",
  {
    fiscalYear: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM(...PROPOSAL_STATES), allowNull: false, defaultValue: "draft" },

    // Denormalised sums, recomputed from the lines on every write so the
    // consolidated totals can never drift from what the offices actually asked.
    proposedTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    recommendedTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    finalTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

    // What this office was appropriated last year. The growth ceiling is
    // meaningless without it, and it is stored rather than derived because a
    // prior year's appropriations may be closed out or reorganised.
    previousYearAppropriation: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

    justification: { type: DataTypes.TEXT, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    returnRemarks: { type: DataTypes.TEXT, allowNull: true },
    // Written by the Municipal Budget Council when it reviews the proposal.
    reviewNotes: { type: DataTypes.TEXT, allowNull: true },
  },
  { indexes: [{ fields: ["fiscalYear", "status"] }] }
);

BudgetProposal.belongsTo(ExecutiveBudget, { as: "budget", foreignKey: "executiveBudgetId" });
ExecutiveBudget.hasMany(BudgetProposal, { as: "proposals", foreignKey: "executiveBudgetId" });

BudgetProposal.belongsTo(Department, { as: "office", foreignKey: "departmentId" });
Department.hasMany(BudgetProposal, { foreignKey: "departmentId" });

BudgetProposal.belongsTo(User, { as: "preparedBy", foreignKey: "preparedById" });

export const BudgetProposalLine = sequelize.define("BudgetProposalLine", {
  title: { type: DataTypes.STRING, allowNull: false },
  expenseClass: { type: DataTypes.ENUM(...EXPENSE_CLASSES), allowNull: false, defaultValue: "mooe" },
  fund: { type: DataTypes.ENUM(...FUNDS), allowNull: false, defaultValue: "generalFund" },

  papCode: { type: DataTypes.STRING, allowNull: true },
  uacsCode: { type: DataTypes.STRING, allowNull: true },

  // Three amounts, not one. What the office asked for, what the Budget Council
  // recommended, and what survived the hearing and deliberation. Keeping all
  // three is the only way the finalised budget can be read against the request
  // it came from — which is the question a department head asks first.
  proposedAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  recommendedAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  finalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

  remarks: { type: DataTypes.TEXT, allowNull: true },
});

BudgetProposalLine.belongsTo(BudgetProposal, { as: "proposal", foreignKey: "budgetProposalId" });
BudgetProposal.hasMany(BudgetProposalLine, {
  as: "lines",
  foreignKey: "budgetProposalId",
  onDelete: "CASCADE",
});

// The AIP project this line funds. Nullable for Personal Services and other
// standing costs, which are not investment projects and legitimately cite none.
BudgetProposalLine.belongsTo(AipEntry, { as: "aipEntry", foreignKey: "aipEntryId" });
AipEntry.hasMany(BudgetProposalLine, { as: "budgetLines", foreignKey: "aipEntryId" });

// ── PROCEEDINGS ──────────────────────────────────────────────────────────────
// The forum, the hearings and the deliberation are meetings, and what makes
// them auditable is the minutes and the attendance — the same reason the BAC
// records resolutions rather than a single approver's user id.
export const PROCEEDING_TYPES = ["forum", "hearing", "deliberation"];

export const PROCEEDING_TYPE_LABELS = {
  forum: "Budget Forum — revenue targets and expenditure ceilings",
  hearing: "Budget Hearing — offices justify their proposals",
  deliberation: "Deliberation — the budget is finalised",
};

export const BudgetProceeding = sequelize.define(
  "BudgetProceeding",
  {
    type: { type: DataTypes.ENUM(...PROCEEDING_TYPES), allowNull: false },
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    heldAt: { type: DataTypes.DATE, allowNull: true },
    venue: { type: DataTypes.STRING, allowNull: true },

    agenda: { type: DataTypes.TEXT, allowNull: true },
    minutes: { type: DataTypes.TEXT, allowNull: true },

    // Snapshot, not foreign keys — a proceeding records the bodies as they were
    // constituted on the day, and later staffing changes must not rewrite it.
    // [{ userId, name, office, capacity }]
    attendees: { type: DataTypes.JSON, allowNull: true },

    // Set on a hearing: which office was being heard. Null for the forum and
    // the deliberation, which are municipality-wide.
    departmentId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { indexes: [{ fields: ["type"] }] }
);

BudgetProceeding.belongsTo(ExecutiveBudget, { as: "budget", foreignKey: "executiveBudgetId" });
ExecutiveBudget.hasMany(BudgetProceeding, { as: "proceedings", foreignKey: "executiveBudgetId" });

BudgetProceeding.belongsTo(User, { as: "recordedBy", foreignKey: "recordedById" });
BudgetProceeding.belongsTo(Department, { as: "office", foreignKey: "departmentId" });

export { sequelize };
