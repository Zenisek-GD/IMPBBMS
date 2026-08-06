import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Department } from "./departmentModel.js";
import { Appropriation } from "./appropriationModel.js";
import { AipEntry } from "./investmentProgramModel.js";

// Annual Procurement Plan entry. Fields follow design doc Section 4.4 and the
// suggested schema in Section 9; states follow Section 4.1.
export const APP_STATES = [
  "draft",
  "pendingConsolidation",
  "pendingBudgetCertification",
  "pendingHopeApproval",
  "approved",
  "returned",
  "locked",
  // A project dropped after the plan was approved. Kept as a state rather than
  // deleting the row, because the municipality's process is that a cancelled
  // project's PPMP is *revised* — which is only meaningful if the original
  // line, and the reason it went, survive.
  "cancelled",
];

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

// ── THE THREE PPMPs AND THE TWO APPs ─────────────────────────────────────────
// RA 12009 IRR Sec. 7.7 prescribes a cycle that runs alongside the budget, not
// after it:
//
//   7.7.1  Indicative PPMP   — prepared by the End-User to SUPPORT the budget
//                              proposal, before anything is appropriated
//   7.7.2  Indicative APP    — the BAC Secretariat consolidates the approved
//                              indicative PPMPs; the BAC then recommends the
//                              mode of procurement to the HoPE
//   7.7.3  Revised PPMP      — on submission of the Local Expenditure Program
//                              to the Sanggunian, revised to the budgetary
//                              allocation
//   7.7.4  Updated Indicative APP — consolidated from the revised PPMPs and
//                              posted; this is what Early Procurement
//                              Activities run against
//   7.7.5  Finalized PPMP    — once the appropriation ordinance is final
//          Final APP         — consolidated, BAC-recommended, HoPE-approved,
//                              posted and submitted to the GPPB by end-January
//
// This system previously implemented only the last of those. Every entry
// required an ENACTED appropriation before it could be created, so all three
// stages happened after enactment and the "indicative" stage was indicative of
// nothing — the label said "pending appropriation" while the controller refused
// to accept a line without one.
//
// `planCycle` is what distinguishes them. An indicative line is charged against
// a budget PROPOSAL; a final line against an ENACTED appropriation. They are
// the same project at two points in the year, which is why the final line
// carries a link back to the indicative one it came from.
export const PLAN_CYCLES = ["indicative", "final"];

export const PLAN_CYCLE_LABELS = {
  indicative: "Indicative — supports the budget proposal (IRR Sec. 7.7.1–7.7.2)",
  final: "Final — aligned to the enacted appropriation (IRR Sec. 7.7.5)",
};

export const PLAN_STAGES = [
  "ppmp",
  "indicativeApp",
  // Sec. 7.7.4 — the indicative APP re-consolidated from PPMPs revised to the
  // Local Expenditure Program. This is the document Early Procurement
  // Activities are conducted against.
  "updatedIndicativeApp",
  "finalApp",
];

export const PLAN_STAGE_LABELS = {
  ppmp: "PPMP — office project procurement management plan",
  indicativeApp: "Indicative APP — consolidated to support the budget proposal",
  updatedIndicativeApp: "Updated Indicative APP — revised to the Local Expenditure Program (EPA basis)",
  finalApp: "Final APP — aligned to the enacted appropriation",
};

export const AppEntry = sequelize.define(
  "AppEntry",
  {
    projectTitle: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },

    // Section 4.4 reference codes.
    mfoId: { type: DataTypes.STRING, allowNull: true },
    papCode: { type: DataTypes.STRING, allowNull: true },
    uacsCode: { type: DataTypes.STRING, allowNull: true },

    category: { type: DataTypes.STRING, allowNull: true },
    procurementMode: { type: DataTypes.STRING, allowNull: false, defaultValue: "competitiveBidding" },

    // Approved Budget for the Contract. DECIMAL rather than FLOAT so peso
    // amounts stay exact.
    abc: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: true },
    quantity: { type: DataTypes.INTEGER, allowNull: true },

    fundSource: { type: DataTypes.STRING, allowNull: true },
    accountCode: { type: DataTypes.STRING, allowNull: true },

    targetStartQuarter: { type: DataTypes.ENUM(...QUARTERS), allowNull: false },
    targetCompletionQuarter: { type: DataTypes.ENUM(...QUARTERS), allowNull: false },

    // Section 4.3: alternative procurement modes require a justification.
    justification: { type: DataTypes.TEXT, allowNull: true },

    fiscalYear: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM(...APP_STATES), allowNull: false, defaultValue: "draft" },

    // Which document this line currently belongs to. Advances with the
    // workflow rather than being set by hand.
    planStage: { type: DataTypes.ENUM(...PLAN_STAGES), allowNull: false, defaultValue: "ppmp" },

    // Which of the two cycles this line belongs to. An indicative line is
    // filed against a budget proposal before anything is appropriated; a final
    // line against an enacted appropriation. The distinction is what lets the
    // indicative APP exist at all.
    planCycle: { type: DataTypes.ENUM(...PLAN_CYCLES), allowNull: false, defaultValue: "final" },

    // Sec. 7.7.2(i) — "Indication whether the project shall be undertaken
    // through EPA". Early Procurement Activities let the LGU run the whole
    // procurement short of award before the ordinance is enacted, which is one
    // of the substantive changes RA 12009 made and the reason the indicative
    // APP matters operationally rather than only on paper.
    earlyProcurement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Sec. 7.7.2(e) and (j) — fields the Indicative APP is required to carry
    // and which had no representation at all.
    bidEvaluationCriteria: { type: DataTypes.TEXT, allowNull: true },
    procurementStrategy: { type: DataTypes.TEXT, allowNull: true },

    // Sec. 7.7.2 — the BAC's recommendation of the mode to the HoPE. The mode
    // itself was being chosen by the requesting office with nothing checking it
    // against the thresholds and nothing reconciling it with what the committee
    // later determined on the requisition.
    modeRecommendedAt: { type: DataTypes.DATE, allowNull: true },
    modeRecommendationBasis: { type: DataTypes.TEXT, allowNull: true },

    // Sec. 7.7.5 — the approved final APP is posted and submitted to the GPPB
    // on or before the end of January of the budget year.
    postedAt: { type: DataTypes.DATE, allowNull: true },
    gppbSubmittedAt: { type: DataTypes.DATE, allowNull: true },

    // Set when the entry is approved; Section 4.3 forbids edits afterwards.
    lockedAt: { type: DataTypes.DATE, allowNull: true },
    returnRemarks: { type: DataTypes.TEXT, allowNull: true },

    // Why an approved line was reopened or dropped, and when. A PPMP revision
    // is a documented act — an unexplained change to an approved plan is
    // exactly what a plan being approved is supposed to prevent.
    revisionRemarks: { type: DataTypes.TEXT, allowNull: true },
    revisedAt: { type: DataTypes.DATE, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [{ fields: ["fiscalYear", "status"] }],
  }
);

// The office the entry is for (Section 4.4 "Implementing unit").
AppEntry.belongsTo(Department, { as: "implementingUnit", foreignKey: "implementingUnitId" });
Department.hasMany(AppEntry, { foreignKey: "implementingUnitId" });

// The budget line this planned procurement is charged against. An APP entry
// without one is a plan to spend money nobody has appropriated, which is the
// gap this link closes: the controller now refuses to create an entry whose ABC
// does not fit the remaining balance of its appropriation.
//
// Nullable at the database level so that entries predating the appropriation
// register are still readable; required by the controller on creation.
AppEntry.belongsTo(Appropriation, { as: "appropriation", foreignKey: "appropriationId" });
Appropriation.hasMany(AppEntry, { as: "appEntries", foreignKey: "appropriationId" });

// The investment-program project this PPMP line procures for. Together with the
// appropriation link above it closes the loop: the appropriation says the money
// exists, and this says the money was programmed for this purpose. Without it,
// an office could plan to procure anything at all against a budget line, which
// is how "the appropriation was for a health centre" ends up buying vehicles.
//
// Nullable in the schema for lines predating the planning module; the
// controller requires it on creation.
AppEntry.belongsTo(AipEntry, { as: "aipEntry", foreignKey: "aipEntryId" });
AipEntry.hasMany(AppEntry, { as: "appEntries", foreignKey: "aipEntryId" });

AppEntry.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });

// The indicative line this final line was carried forward from. Sec. 7.7.5 has
// the End-User "finalize the PPMPs to reflect the authorized budgetary
// allocation" — it is the same project, re-costed, not a new one, and the link
// is what lets an auditor see what was originally asked for against what the
// ordinance actually allowed.
AppEntry.belongsTo(AppEntry, { as: "indicativeOrigin", foreignKey: "indicativeOriginId" });

export { sequelize };
