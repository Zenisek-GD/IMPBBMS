import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Department } from "./departmentModel.js";

// ── THE MISSING LAYER ────────────────────────────────────────────────────────
// Before this model existed, the system treated the Annual Procurement Plan as
// the budget: the budget monitor's own comment read "allocated = approved APP
// entries (the appropriation)". That is backwards. The APP is a *plan for
// buying things*. It carries no money and confers no authority to spend.
//
// For an LGU the authority to spend comes from an Appropriation Ordinance
// enacted by the Sanggunian. The APP is derived from that ordinance, not the
// other way round. Without the ordinance in the model there was nothing to
// check a plan against, so nothing stopped the APP from planning more
// procurement than the municipality had actually appropriated.
//
// The chain this restores:
//
//   Appropriation  (Sanggunian ordinance — authority to spend)
//     └─ Obligation  (ORS certified by the Budget Officer — funds committed)
//          └─ Disbursement  (DV certified by the Accountant, released by the
//                            Treasurer — cash actually leaves)
//
// Allotment, the layer between appropriation and obligation for national
// agencies (where DBM issues the release), is deliberately folded into the
// appropriation here: an LGU's own ordinance is the operative release
// authority, so a separate allotment record would be a row that never varies.

// Fund accounting is not optional for an LGU. Money in the Special Education
// Fund cannot pay for a road, and Trust Fund money is held for a specific
// purpose. Reporting that cannot separate the funds cannot be reconciled.
export const FUNDS = ["generalFund", "specialEducationFund", "trustFund"];

export const FUND_LABELS = {
  generalFund: "General Fund",
  specialEducationFund: "Special Education Fund (SEF)",
  trustFund: "Trust Fund",
};

// The three expense classes an LGU budget is divided into. Procurement draws on
// MOOE and Capital Outlay; Personal Services is payroll and is included only so
// the appropriation register is complete.
export const EXPENSE_CLASSES = ["personalServices", "mooe", "capitalOutlay"];

export const EXPENSE_CLASS_LABELS = {
  personalServices: "Personal Services (PS)",
  mooe: "Maintenance and Other Operating Expenses (MOOE)",
  capitalOutlay: "Capital Outlay (CO)",
};

// annual       — the Annual Budget ordinance
// supplemental — a later ordinance adding to it during the year
// continuing   — a prior year's unexpended capital appropriation carried over,
//                which is why an appropriation's fiscal year and its ordinance
//                year are not always the same
// reenacted    — LGC Sec. 323. Where the Sanggunian has not passed the annual
//                appropriations by the start of the fiscal year, "the annual
//                appropriations of the preceding fiscal year shall be deemed
//                reenacted and shall remain in force and effect" until it does.
//                A reenacted line is real spending authority — the LGU operates
//                on it — but a restricted one: Sec. 323 carries over salaries
//                of existing positions, statutory and contractual obligations
//                and essential operating expenses, and pointedly not new
//                appropriations or capital outlay.
export const APPROPRIATION_TYPES = ["annual", "supplemental", "continuing", "reenacted"];

export const Appropriation = sequelize.define(
  "Appropriation",
  {
    fiscalYear: { type: DataTypes.INTEGER, allowNull: false },

    // The ordinance is the authority. Recording its number and date is what
    // lets an auditor trace a peso back to the act of the Sanggunian that
    // authorised it.
    ordinanceNo: { type: DataTypes.STRING, allowNull: false },
    ordinanceDate: { type: DataTypes.DATEONLY, allowNull: true },
    type: { type: DataTypes.ENUM(...APPROPRIATION_TYPES), allowNull: false, defaultValue: "annual" },

    fund: { type: DataTypes.ENUM(...FUNDS), allowNull: false, defaultValue: "generalFund" },
    expenseClass: { type: DataTypes.ENUM(...EXPENSE_CLASSES), allowNull: false, defaultValue: "mooe" },

    // Program / Activity / Project code and the UACS account code. These are how
    // the line is identified in the budget document and in COA reporting.
    papCode: { type: DataTypes.STRING, allowNull: true },
    uacsCode: { type: DataTypes.STRING, allowNull: true },

    title: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

    // draft   — being prepared, cannot be charged against
    // enacted — the ordinance has passed; this is the only chargeable state
    // closed  — the fiscal year is shut and the balance reverted
    status: {
      type: DataTypes.ENUM("draft", "enacted", "closed"),
      allowNull: false,
      defaultValue: "draft",
    },

    remarks: { type: DataTypes.TEXT, allowNull: true },

    // ── Where the line came from ─────────────────────────────────────────────
    // Set when the line was released by an enacted executive budget rather than
    // keyed in by hand. A line carrying these can be traced all the way back:
    //   appropriation → budget proposal line → AIP entry → development goal.
    // A line without them was recorded directly, which the register shows —
    // "on whose authority?" should be answerable from the row itself.
    //
    // Declared as plain columns rather than associations because
    // budgetPreparationModel.js imports this file; a belongsTo pointing the
    // other way would close the import cycle. The join is done explicitly where
    // it is needed, which is only the appropriation register's detail view.
    executiveBudgetId: { type: DataTypes.INTEGER, allowNull: true },
    budgetProposalLineId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    indexes: [
      { fields: ["fiscalYear", "status"] },
      { fields: ["fund", "expenseClass"] },
      { fields: ["executiveBudgetId"] },
    ],
  }
);

// The office the appropriation is for. Budget accountability in an LGU is per
// office, which is why the monitor reports by department.
Appropriation.belongsTo(Department, { as: "office", foreignKey: "departmentId" });
Department.hasMany(Appropriation, { foreignKey: "departmentId" });

Appropriation.belongsTo(User, { as: "recordedBy", foreignKey: "recordedById" });

// ── OBLIGATION ───────────────────────────────────────────────────────────────
// The Obligation Request and Status. When the Budget Officer certifies that
// funds are available for a requisition, that certification *is* an obligation:
// the amount stops being available to anything else, whether or not a peso has
// moved. It is the document COA asks for, and the system previously had no
// equivalent — "certify" only flipped a status string on the requisition.
export const Obligation = sequelize.define(
  "Obligation",
  {
    obligationNo: { type: DataTypes.STRING, allowNull: false, unique: true },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

    // obligated — funds committed and unavailable to anything else
    // cancelled — the commitment was reversed (requisition returned or
    //             cancelled after certification), releasing the balance
    status: {
      type: DataTypes.ENUM("obligated", "cancelled"),
      allowNull: false,
      defaultValue: "obligated",
    },

    certifiedAt: { type: DataTypes.DATE, allowNull: false },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancellationReason: { type: DataTypes.TEXT, allowNull: true },

    // Free text carried onto the ORS.
    particulars: { type: DataTypes.STRING, allowNull: true },
  },
  { indexes: [{ fields: ["status"] }] }
);

Obligation.belongsTo(Appropriation, { as: "appropriation", foreignKey: "appropriationId" });
Appropriation.hasMany(Obligation, { as: "obligations", foreignKey: "appropriationId" });

// The officer who certified availability. Named, because the certification is a
// personal accountability under LGU budgeting rules.
Obligation.belongsTo(User, { as: "certifiedBy", foreignKey: "certifiedById" });

export { sequelize };
