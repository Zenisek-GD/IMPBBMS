import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Vendor } from "./vendorModel.js";
import { Contract, Delivery } from "./contractModel.js";

// Invoice raised by the supplier once a delivery has been accepted
// (lifecycle step 12). Section 9's invoices table.
export const Invoice = sequelize.define("Invoice", {
  invoiceNo: { type: DataTypes.STRING, allowNull: false, unique: true },
  supplierInvoiceRef: { type: DataTypes.STRING, allowNull: true },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  submittedAt: { type: DataTypes.DATE, allowNull: false },

  status: {
    type: DataTypes.ENUM("submitted", "certified", "returned", "paid", "cancelled"),
    allowNull: false,
    defaultValue: "submitted",
  },
  remarks: { type: DataTypes.TEXT, allowNull: true },
});

Invoice.belongsTo(Contract, { as: "contract", foreignKey: "contractId" });
Invoice.belongsTo(Delivery, { as: "delivery", foreignKey: "deliveryId" });
Invoice.belongsTo(Vendor, { as: "vendor", foreignKey: "vendorId" });

// Disbursement. Section 6: "Accounting prepares documents; Treasurer releases
// payment" — two distinct acts, so preparation and release are separate
// columns and the same person may not do both (see paymentController).
export const Payment = sequelize.define("Payment", {
  disbursementNo: { type: DataTypes.STRING, allowNull: false, unique: true },

  // ── gross − deductions = net ───────────────────────────────────────────────
  // A disbursement voucher is not a single number. The system used to pay the
  // invoice amount in full, which handed the supplier money the LGU is legally
  // obliged to withhold and remit or retain. Every line below is money that
  // must not leave the treasury with the cheque.
  //
  // `amount` is the NET — what the supplier actually receives, and what the
  // treasury actually disburses.
  grossAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  // Expanded withholding tax: 1% on goods, 2% on services, computed on the
  // amount net of VAT. Remitted to the BIR, not kept.
  ewtAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  // Final VAT withholding on government purchases — 5% of the VAT-exclusive
  // price, and only for VAT-registered suppliers.
  vatWithheldAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  // 10% on infrastructure progress billings, held until final acceptance and
  // the lapse of the warranty period. The supplier's money, withheld.
  retentionAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  // 1/10 of 1% of the cost of the unperformed portion per day of delay.
  liquidatedDamages: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  otherDeductions: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

  // Human-readable breakdown carried onto the voucher, so a reviewer can see
  // how each figure was arrived at rather than only the totals.
  deductionBreakdown: { type: DataTypes.JSON, allowNull: true },

  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

  preparedAt: { type: DataTypes.DATE, allowNull: true },
  releasedAt: { type: DataTypes.DATE, allowNull: true },

  status: {
    type: DataTypes.ENUM("prepared", "released", "cancelled"),
    allowNull: false,
    defaultValue: "prepared",
  },
  method: { type: DataTypes.STRING, allowNull: true },
  reference: { type: DataTypes.STRING, allowNull: true },
  remarks: { type: DataTypes.TEXT, allowNull: true },
});

Payment.belongsTo(Invoice, { as: "invoice", foreignKey: "invoiceId" });
Invoice.hasOne(Payment, { as: "payment", foreignKey: "invoiceId" });
Payment.belongsTo(User, { as: "preparedBy", foreignKey: "preparedById" });
Payment.belongsTo(User, { as: "releasedBy", foreignKey: "releasedById" });

export { sequelize };
