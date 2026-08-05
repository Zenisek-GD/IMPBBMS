import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Department } from "./departmentModel.js";
import { DevelopmentPlan, DevelopmentGoal } from "./developmentPlanModel.js";
import { FUNDS, EXPENSE_CLASSES } from "./appropriationModel.js";

// ── ANNUAL INVESTMENT PROGRAM ────────────────────────────────────────────────
// The AIP is the year's slice of the Comprehensive Development Plan: the
// projects the municipality intends to fund this fiscal year, costed, assigned
// to an implementing office, and scheduled. Under LGC Sec. 305(i) no ordinance
// may appropriate for a purpose outside the approved development plan, which is
// what makes the AIP the hinge between planning and budgeting rather than a
// document that sits beside them.
//
// Two things downstream depend on it and could not be checked before:
//   • a budget proposal line that cites no AIP entry is a request to fund
//     something the LGU never planned;
//   • an APP/PPMP line that cites no AIP entry is a plan to procure something
//     the LGU never programmed.

export const AIP_STATES = [
  "draft",
  "pendingMayorEndorsement",
  "pendingSanggunianAdoption",
  "adopted",
  "returned",
];

export const InvestmentProgram = sequelize.define(
  "InvestmentProgram",
  {
    fiscalYear: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    title: { type: DataTypes.STRING, allowNull: false },

    status: { type: DataTypes.ENUM(...AIP_STATES), allowNull: false, defaultValue: "draft" },

    endorsedAt: { type: DataTypes.DATE, allowNull: true },
    adoptedAt: { type: DataTypes.DATE, allowNull: true },
    // The Sanggunian resolution adopting the AIP, on the recommendation of the
    // Local Development Council.
    resolutionNo: { type: DataTypes.STRING, allowNull: true },

    returnRemarks: { type: DataTypes.TEXT, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
  },
  { indexes: [{ fields: ["fiscalYear"] }, { fields: ["status"] }] }
);

InvestmentProgram.belongsTo(DevelopmentPlan, { as: "plan", foreignKey: "developmentPlanId" });
DevelopmentPlan.hasMany(InvestmentProgram, { as: "programs", foreignKey: "developmentPlanId" });

InvestmentProgram.belongsTo(User, { as: "preparedBy", foreignKey: "preparedById" });
InvestmentProgram.belongsTo(User, { as: "endorsedBy", foreignKey: "endorsedById" });

export const AIP_ENTRY_STATES = ["planned", "dropped"];

export const AipEntry = sequelize.define(
  "AipEntry",
  {
    // The AIP reference code the office and the budget document both quote.
    reference: { type: DataTypes.STRING, allowNull: true },

    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    expectedOutput: { type: DataTypes.TEXT, allowNull: true },

    // Which of the three expense classes the project falls in, and which fund
    // pays for it. Carried here rather than left to the budget stage because a
    // road financed from the Special Education Fund is a planning error, and it
    // should be caught while it is still a plan.
    expenseClass: { type: DataTypes.ENUM(...EXPENSE_CLASSES), allowNull: false, defaultValue: "mooe" },
    fund: { type: DataTypes.ENUM(...FUNDS), allowNull: false, defaultValue: "generalFund" },

    papCode: { type: DataTypes.STRING, allowNull: true },

    estimatedCost: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

    startQuarter: { type: DataTypes.ENUM("Q1", "Q2", "Q3", "Q4"), allowNull: false, defaultValue: "Q1" },
    endQuarter: { type: DataTypes.ENUM("Q1", "Q2", "Q3", "Q4"), allowNull: false, defaultValue: "Q4" },

    status: { type: DataTypes.ENUM(...AIP_ENTRY_STATES), allowNull: false, defaultValue: "planned" },
    remarks: { type: DataTypes.TEXT, allowNull: true },
  },
  { indexes: [{ fields: ["status"] }] }
);

AipEntry.belongsTo(InvestmentProgram, { as: "program", foreignKey: "investmentProgramId" });
InvestmentProgram.hasMany(AipEntry, { as: "entries", foreignKey: "investmentProgramId" });

// The goal this project pursues. Nullable in the schema so entries recorded
// before a CDP was captured remain readable; required by the controller, which
// is where "every peso traces to a goal" is actually enforced.
AipEntry.belongsTo(DevelopmentGoal, { as: "goal", foreignKey: "developmentGoalId" });
DevelopmentGoal.hasMany(AipEntry, { as: "aipEntries", foreignKey: "developmentGoalId" });

AipEntry.belongsTo(Department, { as: "implementingUnit", foreignKey: "implementingUnitId" });
Department.hasMany(AipEntry, { foreignKey: "implementingUnitId" });

export { sequelize };
