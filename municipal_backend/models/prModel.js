import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Department } from "./departmentModel.js";
import { AppEntry } from "./appEntryModel.js";
import { Obligation } from "./appropriationModel.js";

// Purchase Requisition. States from design doc Section 5.1, fields from
// Section 9's pr_headers / pr_line_items.
export const PR_STATES = [
  "draft",
  "pendingDepartmentHeadEndorsement",
  "pendingBudgetCertification",
  "pendingSecretariatReview",
  "pendingHopeApproval",
  "returned",
  "approved",
];

export const PrHeader = sequelize.define(
  "PrHeader",
  {
    prNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
    purpose: { type: DataTypes.TEXT, allowNull: true },
    dateRequired: { type: DataTypes.DATEONLY, allowNull: false },

    // Section 5.3: emergency requisitions bypass the 15-day lead time but
    // require a justification.
    isEmergency: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    justification: { type: DataTypes.TEXT, allowNull: true },

    // Denormalised sum of the line items, recomputed on every write so it can
    // be compared against the linked APP entry's remaining balance.
    totalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

    status: { type: DataTypes.ENUM(...PR_STATES), allowNull: false, defaultValue: "draft" },
    returnRemarks: { type: DataTypes.TEXT, allowNull: true },

    // Section 5.2: the Budget Officer's certification creates a soft
    // reservation against the APP entry's balance.
    fundsReservedAt: { type: DataTypes.DATE, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { indexes: [{ fields: ["status"] }] }
);

export const PrLineItem = sequelize.define("PrLineItem", {
  description: { type: DataTypes.STRING, allowNull: false },
  unit: { type: DataTypes.STRING, allowNull: true },
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  lineTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
});

// Section 4 / 5.3: no PR may exist without a linked, approved APP entry.
PrHeader.belongsTo(AppEntry, { as: "appEntry", foreignKey: "appEntryId" });
AppEntry.hasMany(PrHeader, { foreignKey: "appEntryId" });

PrHeader.belongsTo(User, { as: "requester", foreignKey: "requesterId" });
PrHeader.belongsTo(Department, { as: "department", foreignKey: "departmentId" });

PrHeader.hasMany(PrLineItem, { as: "lineItems", foreignKey: "prHeaderId", onDelete: "CASCADE" });
PrLineItem.belongsTo(PrHeader, { foreignKey: "prHeaderId" });

// The Obligation Request raised when the Budget Officer certifies this
// requisition. One per requisition: certifying again after a cancellation
// issues a new ORS rather than reviving the old one, so the register shows both
// the commitment and its reversal.
PrHeader.hasMany(Obligation, { as: "obligations", foreignKey: "prHeaderId" });
Obligation.belongsTo(PrHeader, { as: "requisition", foreignKey: "prHeaderId" });

export { sequelize };
