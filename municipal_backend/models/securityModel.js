import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Vendor } from "./vendorModel.js";

// ── PROCUREMENT SECURITIES ───────────────────────────────────────────────────
// The instruments that make a bid and a contract enforceable. None of them
// existed in this system, which meant a bidder could walk away from a winning
// bid at no cost and a supplier could sign a contract without posting anything
// against non-performance.
//
//   bid          Posted with the bid. Forfeited if the bidder withdraws during
//                the bid validity period, or refuses to sign after award. It is
//                what makes a bid a commitment rather than an expression of
//                interest.
//   performance  Posted BEFORE contract signing. This is the LGU's protection
//                against non-performance and is the reason a contract may not
//                be activated without it.
//   warranty     Posted on final acceptance, covering defects during the
//                warranty period. Released when that period lapses.
//
// RA 12009 added declaration-based alternatives — the Bid Securing Declaration
// and Performance Securing Declaration — where the bidder undertakes liability
// instead of tying up cash. They are recorded here as forms of the same
// instrument, because legally they occupy the same slot.
export const SECURITY_TYPES = ["bid", "performance", "warranty"];

export const SECURITY_FORMS = [
  "cash",
  "managersCheck",
  "bankDraftGuarantee",
  "suretyBond",
  "securingDeclaration",
];

export const SECURITY_FORM_LABELS = {
  cash: "Cash or cashier's/manager's check",
  managersCheck: "Manager's check",
  bankDraftGuarantee: "Bank draft / guarantee",
  suretyBond: "Surety bond",
  securingDeclaration: "Securing Declaration (RA 12009)",
};

export const Security = sequelize.define(
  "Security",
  {
    type: { type: DataTypes.ENUM(...SECURITY_TYPES), allowNull: false },
    form: { type: DataTypes.ENUM(...SECURITY_FORMS), allowNull: false, defaultValue: "suretyBond" },

    // Zero for a securing declaration — the undertaking carries the liability
    // rather than a deposited sum, so the amount is not the measure of it.
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

    // The percentage this instrument represents of the ABC or contract price,
    // recorded so a reviewer can see the basis rather than only the figure.
    percentage: { type: DataTypes.DECIMAL(6, 3), allowNull: true },

    referenceNo: { type: DataTypes.STRING, allowNull: true },
    issuer: { type: DataTypes.STRING, allowNull: true },

    postedAt: { type: DataTypes.DATE, allowNull: false },
    validUntil: { type: DataTypes.DATEONLY, allowNull: true },

    // posted    — held by the LGU
    // released  — returned to the supplier, the obligation having been met
    // forfeited — claimed by the LGU following a default
    status: {
      type: DataTypes.ENUM("posted", "released", "forfeited"),
      allowNull: false,
      defaultValue: "posted",
    },
    releasedAt: { type: DataTypes.DATE, allowNull: true },
    forfeitedAt: { type: DataTypes.DATE, allowNull: true },
    forfeitureReason: { type: DataTypes.TEXT, allowNull: true },

    // Polymorphic owner: a bid security hangs off a bid, a performance and
    // warranty security off a contract.
    entityRef: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    indexes: [
      { fields: ["entityRef", "entityId"] },
      { fields: ["type", "status"] },
    ],
  }
);

Security.belongsTo(Vendor, { as: "vendor", foreignKey: "vendorId" });
Security.belongsTo(User, { as: "recordedBy", foreignKey: "recordedById" });

// ── Required amounts ─────────────────────────────────────────────────────────
// Percentages follow the long-standing government procurement schedule carried
// into the RA 12009 IRR. They are expressed as configuration rather than
// hardcoded at call sites, because the GPPB may adjust them.

// Bid security, as a proportion of the ABC. The form determines the rate: cash
// ties up less because it is immediately callable.
export const BID_SECURITY_RATES = {
  cash: 0.02,
  managersCheck: 0.02,
  bankDraftGuarantee: 0.02,
  suretyBond: 0.05,
  securingDeclaration: 0, // The undertaking replaces the deposit.
};

// Performance security, as a proportion of the contract price. Infrastructure
// carries a higher cash rate than goods because the exposure is larger and
// longer-running.
export const PERFORMANCE_SECURITY_RATES = {
  goods: { cash: 0.05, managersCheck: 0.05, bankDraftGuarantee: 0.05, suretyBond: 0.3, securingDeclaration: 0 },
  infrastructure: { cash: 0.1, managersCheck: 0.1, bankDraftGuarantee: 0.1, suretyBond: 0.3, securingDeclaration: 0 },
  consulting: { cash: 0.05, managersCheck: 0.05, bankDraftGuarantee: 0.05, suretyBond: 0.3, securingDeclaration: 0 },
};

// Warranty security retained after final acceptance, as a proportion of the
// contract price.
export const WARRANTY_SECURITY_RATE = 0.01;

export const requiredBidSecurity = (abc, form) =>
  Math.round(Number(abc) * (BID_SECURITY_RATES[form] ?? 0) * 100) / 100;

export const requiredPerformanceSecurity = (contractAmount, category, form) => {
  const table = PERFORMANCE_SECURITY_RATES[category] ?? PERFORMANCE_SECURITY_RATES.goods;
  return Math.round(Number(contractAmount) * (table[form] ?? 0) * 100) / 100;
};

export { sequelize };
