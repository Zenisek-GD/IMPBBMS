import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// ── THE TOP OF THE CHAIN ─────────────────────────────────────────────────────
// Everything this system procures is supposed to be traceable back to a
// development goal the municipality committed to. Before this model existed the
// chain started at the Annual Procurement Plan, which meant the first question
// an auditor or a citizen asks — "why is the LGU buying this at all?" — had no
// answer inside the system.
//
// The full chain the planning module restores:
//
//   Comprehensive Development Plan  (multi-year, adopted by the Sanggunian)
//     └─ Development Goal / Mayor's priority
//          └─ Annual Investment Program entry   (the year's slice of the CDP)
//               └─ Budget proposal line          (what the office asks for)
//                    └─ Appropriation             (what the ordinance grants)
//                         └─ APP / PPMP entry     (what will be procured)
//                              └─ Purchase Requisition
//
// The CDP is prepared for a multi-year horizon — three years in this LGU's
// practice, though the Local Government Code fixes no single figure and DILG
// guidance ties the horizon to the term of office, so the span is stored as
// start/end years rather than assumed.

export const PLAN_STATUSES = ["draft", "adopted", "superseded"];

export const DevelopmentPlan = sequelize.define(
  "DevelopmentPlan",
  {
    title: { type: DataTypes.STRING, allowNull: false },
    startYear: { type: DataTypes.INTEGER, allowNull: false },
    endYear: { type: DataTypes.INTEGER, allowNull: false },

    // The Sanggunian resolution that adopted the plan. Recording it is what
    // makes the goals below citable rather than aspirational.
    resolutionNo: { type: DataTypes.STRING, allowNull: true },
    adoptedAt: { type: DataTypes.DATEONLY, allowNull: true },

    status: {
      type: DataTypes.ENUM(...PLAN_STATUSES),
      allowNull: false,
      defaultValue: "draft",
    },

    vision: { type: DataTypes.TEXT, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
  },
  { indexes: [{ fields: ["status"] }, { fields: ["startYear", "endYear"] }] }
);

DevelopmentPlan.belongsTo(User, { as: "preparedBy", foreignKey: "preparedById" });

// The five development sectors the DILG's CDP preparation guide organises a
// local plan around. The everyday shorthand an office uses — "health",
// "education", "agriculture", "disaster preparedness" — all sit under one of
// these, so the sector is the enum and the specific programme is free text in
// `subsector`. Storing the loose words as the enum instead would have produced
// a list nobody could roll up.
export const SECTORS = ["social", "economic", "infrastructure", "environment", "institutional"];

export const SECTOR_LABELS = {
  social: "Social (health, education, housing, social welfare)",
  economic: "Economic (agriculture, enterprise, tourism, employment)",
  infrastructure: "Infrastructure (roads, buildings, water, power)",
  environment: "Environment and disaster risk reduction",
  institutional: "Institutional (governance, fiscal, administrative capacity)",
};

export const GOAL_STATUSES = ["active", "achieved", "dropped"];

export const DevelopmentGoal = sequelize.define(
  "DevelopmentGoal",
  {
    sector: { type: DataTypes.ENUM(...SECTORS), allowNull: false },
    subsector: { type: DataTypes.STRING, allowNull: true },

    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },

    // ── The Mayor's priorities ────────────────────────────────────────────────
    // Step 2 of the municipal process is the Local Chief Executive naming which
    // of the plan's goals the year's spending will actually chase. That is a
    // separate act from writing the plan, performed by a different officer, so
    // it is a flag set on the goal rather than a property of it — the goal
    // exists in the CDP whether or not this year's Mayor prioritises it.
    isMayorPriority: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Rank among the priorities, so "top three priorities" is answerable.
    priorityRank: { type: DataTypes.INTEGER, allowNull: true },
    prioritisedAt: { type: DataTypes.DATE, allowNull: true },
    // The fiscal year the prioritisation applies to. Priorities are re-set each
    // year against the same standing plan.
    priorityFiscalYear: { type: DataTypes.INTEGER, allowNull: true },

    status: { type: DataTypes.ENUM(...GOAL_STATUSES), allowNull: false, defaultValue: "active" },
  },
  { indexes: [{ fields: ["sector"] }, { fields: ["isMayorPriority", "priorityFiscalYear"] }] }
);

DevelopmentGoal.belongsTo(DevelopmentPlan, { as: "plan", foreignKey: "developmentPlanId" });
DevelopmentPlan.hasMany(DevelopmentGoal, { as: "goals", foreignKey: "developmentPlanId" });

DevelopmentGoal.belongsTo(User, { as: "prioritisedBy", foreignKey: "prioritisedById" });

export { sequelize };
