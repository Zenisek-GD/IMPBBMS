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

// ── PPMP → INDICATIVE APP → FINAL APP ────────────────────────────────────────
// The plan is not one document. Each office prepares its own Project
// Procurement Management Plan; the BAC Secretariat consolidates those into the
// Annual Procurement Plan, which is indicative while the budget is still a
// proposal and becomes final once the Appropriation Ordinance is enacted.
//
// The system had one flat entry created directly by departments, which meant
// the "consolidate" step in its own workflow had nothing to consolidate *from*.
// The stage now moves with the workflow: an entry is filed as a PPMP line,
// becomes part of the indicative APP on consolidation, and is marked final on
// approval — at which point it is charged against an enacted appropriation.
export const PLAN_STAGES = ["ppmp", "indicativeApp", "finalApp"];

export const PLAN_STAGE_LABELS = {
  ppmp: "PPMP — office project procurement management plan",
  indicativeApp: "Indicative APP — consolidated, pending appropriation",
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

export { sequelize };
