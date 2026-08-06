import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Vendor } from "./vendorModel.js";
import { Award } from "./biddingModel.js";

// Contract / Purchase Order. Section 9's contracts table; lifecycle step 10.
export const Contract = sequelize.define("Contract", {
  contractNo: { type: DataTypes.STRING, allowNull: false, unique: true },
  poRef: { type: DataTypes.STRING, allowNull: true },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

  // Running total of disbursements released against this contract.
  //
  // Contracts are rarely settled in one payment. Infrastructure is billed by
  // progress — monthly, against the percentage of work accomplished — and goods
  // contracts are billed per accepted delivery. Without a cumulative figure the
  // system could only ever answer "has anything been paid", which is why the
  // first release used to close the whole contract.
  amountPaid: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  // Goods and small-value procurement are awarded on a Purchase Order;
  // infrastructure and consulting on a Contract. They carry different
  // securities, different payment terms and different retention rules, so the
  // instrument has to be known rather than assumed.
  instrumentType: {
    type: DataTypes.ENUM("purchaseOrder", "contract"),
    allowNull: false,
    defaultValue: "purchaseOrder",
  },

  // Infrastructure attracts 10% retention on every progress billing; goods do
  // not. Carried on the contract so the deduction engine does not have to walk
  // back to the RFQ category on every payment.
  category: {
    type: DataTypes.ENUM("goods", "infrastructure", "consulting"),
    allowNull: false,
    defaultValue: "goods",
  },

  startDate: { type: DataTypes.DATEONLY, allowNull: true },
  deliveryDeadline: { type: DataTypes.DATEONLY, allowNull: true },

  // ── Contract time ──────────────────────────────────────────────────────────
  // Contract time runs from the Notice to Proceed, not from the signing date
  // and not from an arbitrary "start date". Without the NTP there is no defined
  // day zero, so delay cannot be computed — and without delay there is no way
  // to compute liquidated damages, which is why they were absent entirely.
  noticeToProceedAt: { type: DataTypes.DATE, allowNull: true },
  contractDays: { type: DataTypes.INTEGER, allowNull: true },

  // Approved extensions add to the contract period before delay is counted.
  timeExtensionDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  timeExtensionReason: { type: DataTypes.TEXT, allowNull: true },

  // Set when the work is accepted, and the point from which delay stops
  // accruing. Left null while the contract is still running.
  actualCompletionAt: { type: DataTypes.DATE, allowNull: true },

  terms: { type: DataTypes.TEXT, allowNull: true },

  // Section 6: the contract is drafted by the Secretariat, signed by the BAC
  // Chairperson, and countersigned by the supplier.
  status: {
    type: DataTypes.ENUM("draft", "pendingSignatures", "active", "completed", "cancelled", "rescinded"),
    allowNull: false,
    defaultValue: "draft",
  },
  signedByLguAt: { type: DataTypes.DATE, allowNull: true },
  signedByVendorAt: { type: DataTypes.DATE, allowNull: true },

  // Running total of retention withheld across progress billings. Held by the
  // LGU until final acceptance and the lapse of the warranty period, then
  // released — it is the supplier's money, withheld, not the LGU's income.
  retentionHeld: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  retentionReleasedAt: { type: DataTypes.DATE, allowNull: true },

  // ── Variation orders (RA 12009 Sec. 71) ────────────────────────────────────
  // Change and Extra Work Orders for infrastructure, Amendments to Order for
  // goods. Cumulative, because the ceiling is cumulative: variations may not
  // exceed ten percent of the original contract price, and the performance
  // security has to be updated before one is issued (Sec. 68.1).
  variationTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  // ── Termination (Sec. 71) ──────────────────────────────────────────────────
  // A contract can end without being completed — default, breach, or the LGU's
  // own convenience. Recorded rather than left as a cancelled row, because the
  // ground decides what happens to the securities and the retention.
  terminatedAt: { type: DataTypes.DATE, allowNull: true },
  terminationGround: {
    type: DataTypes.ENUM("default", "breach", "convenience", "unlawfulActs"),
    allowNull: true,
  },
  terminationReason: { type: DataTypes.TEXT, allowNull: true },
});

// The original contract price, before any variation order. Kept as a derived
// read rather than a column so `amount` stays the single figure everything else
// measures against.
export const originalAmountOf = (contract) =>
  Number(contract.amount) - Number(contract.variationTotal ?? 0);

// Sec. 71 — the cumulative ceiling on variation orders.
export const VARIATION_ORDER_CEILING_RATE = 0.1;

Contract.belongsTo(Award, { as: "award", foreignKey: "awardId" });
Contract.belongsTo(Vendor, { as: "vendor", foreignKey: "vendorId" });
Contract.belongsTo(User, { as: "draftedBy", foreignKey: "draftedById" });

// Delivery / completion record. Section 6: "Delivery or implementation; GSO
// inspects and accepts."
export const Delivery = sequelize.define("Delivery", {
  deliveredAt: { type: DataTypes.DATE, allowNull: true },
  inspectedAt: { type: DataTypes.DATE, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },

  status: {
    type: DataTypes.ENUM("reported", "underInspection", "accepted", "rejected"),
    allowNull: false,
    defaultValue: "reported",
  },
  // Section 7.5: what was not delivered feeds the Pending/Unbought queue.
  acceptedQuantityNote: { type: DataTypes.TEXT, allowNull: true },
  remarks: { type: DataTypes.TEXT, allowNull: true },
});

Delivery.belongsTo(Contract, { as: "contract", foreignKey: "contractId" });
Contract.hasMany(Delivery, { as: "deliveries", foreignKey: "contractId" });
Delivery.belongsTo(User, { as: "reportedBy", foreignKey: "reportedById" });
Delivery.belongsTo(User, { as: "inspectedBy", foreignKey: "inspectedById" });

export { sequelize };
