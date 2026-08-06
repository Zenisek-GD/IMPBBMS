import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Vendor } from "./vendorModel.js";
import { Rfq } from "./biddingModel.js";

// ── PROTEST MECHANISM ────────────────────────────────────────────────────────
// RA 12009 Rule XVI, Sec. 83–85. A bidder who loses has a route to challenge
// the decision, and that route is a precondition to going to court: Sec. 85
// says "court action may be resorted to only after the protests contemplated in
// this Article have been completed", and cases filed in violation are dismissed
// for lack of jurisdiction.
//
// The system had none of this. A bidder disqualified at post-qualification, or
// a losing bidder who believed the evaluation was wrong, had nowhere to say so,
// and the procurement proceeded to award regardless. Sec. 84 is explicit that
// "protests must first be resolved before any award is made".
//
// Two stages, and the first is a condition of the second:
//
//   requestForReconsideration → filed with the BAC within 3 calendar days of
//                               notice of the decision; BAC decides within 7
//   protest                   → only if reconsideration was DENIED; filed with
//                               the HoPE within 7 calendar days, as a verified
//                               position paper with a non-refundable fee; HoPE
//                               resolves within 7

export const PROTEST_STAGES = ["requestForReconsideration", "protest"];

export const PROTEST_STATES = [
  "filed",
  "granted",
  "denied",
  // A protest withdrawn by the bidder, or dismissed outright for a defect the
  // IRR says amendment cannot cure (Sec. 83.3: an unverified position paper
  // "produces no legal effect, and results in the outright dismissal").
  "withdrawn",
  "dismissed",
];

// Sec. 83.1 and 83.2 — the periods, in calendar days.
export const RECONSIDERATION_FILING_DAYS = 3;
export const RECONSIDERATION_DECISION_DAYS = 7;
export const PROTEST_FILING_DAYS = 7;
export const PROTEST_DECISION_DAYS = 7;

// Sec. 83.2 — the non-refundable protest fee schedule. Bands are expressed as
// upper bounds so the table reads in the same order the IRR prints it.
const PROTEST_FEE_BANDS = [
  { upTo: 50_000_000, rate: 0.0075 },
  { upTo: 100_000_000, flat: 500_000 },
  { upTo: 500_000_000, rate: 0.005 },
  { upTo: 1_000_000_000, flat: 2_500_000 },
  { upTo: 2_000_000_000, rate: 0.0025 },
  { upTo: Infinity, flat: 5_000_000 },
];

export const protestFeeFor = (abc) => {
  const amount = Number(abc);
  const band = PROTEST_FEE_BANDS.find((candidate) => amount <= candidate.upTo);
  if (!band) return 0;
  return band.flat ?? Math.round(amount * band.rate * 100) / 100;
};

// Sec. 84.3 — for LGUs, the decision of the local chief executive is final and
// executory at or below these amounts. Above them the decision is still the
// HoPE's, but it is not the end of the road.
export const LGU_FINALITY_CEILINGS = {
  goods: 1_250_000,
  infrastructure: 12_500_000,
  consulting: 2_500_000,
};

export const decisionIsFinalAndExecutory = (category, abc) => {
  const ceiling = LGU_FINALITY_CEILINGS[category] ?? LGU_FINALITY_CEILINGS.goods;
  return Number(abc) <= ceiling;
};

export const Protest = sequelize.define(
  "Protest",
  {
    stage: { type: DataTypes.ENUM(...PROTEST_STAGES), allowNull: false },

    // The BAC decision being challenged, and when the bidder was notified of
    // it. The filing clock runs from the notice, not from the decision.
    challengedDecision: { type: DataTypes.STRING, allowNull: false },
    notifiedAt: { type: DataTypes.DATE, allowNull: false },
    filedAt: { type: DataTypes.DATE, allowNull: false },

    // Computed at filing so a later edit to the notice date cannot make a late
    // filing look timely.
    filingDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    filedOnTime: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    // Sec. 83.3 — the verified position paper. Required at the protest stage
    // only; a request for reconsideration to the BAC carries no such formality.
    grounds: { type: DataTypes.TEXT, allowNull: false },
    verifiedByAffidavit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    noForumShoppingCertified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Sec. 83.2 — non-refundable, and a condition of the protest being
    // entertained at all.
    protestFee: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    protestFeePaidAt: { type: DataTypes.DATE, allowNull: true },
    protestFeeReference: { type: DataTypes.STRING, allowNull: true },

    status: { type: DataTypes.ENUM(...PROTEST_STATES), allowNull: false, defaultValue: "filed" },

    // Sec. 84.1 — the decision "shall clearly state the factual and legal bases
    // used to resolve the protest".
    decision: { type: DataTypes.TEXT, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    dueAt: { type: DataTypes.DATE, allowNull: false },
    decidedLate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Sec. 84.2–84.3 — whether this decision ends the matter.
    finalAndExecutory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    indexes: [
      { fields: ["rfqId", "stage"] },
      { fields: ["status"] },
    ],
  }
);

Protest.belongsTo(Rfq, { as: "rfq", foreignKey: "rfqId" });
Rfq.hasMany(Protest, { as: "protests", foreignKey: "rfqId" });
Protest.belongsTo(Vendor, { as: "vendor", foreignKey: "vendorId" });
Protest.belongsTo(User, { as: "filedBy", foreignKey: "filedById" });
Protest.belongsTo(User, { as: "decidedBy", foreignKey: "decidedById" });

// A protest can only follow a denied request for reconsideration over the same
// decision (Sec. 83: "Provided, That a prior request for reconsideration should
// have been filed... and the same has been resolved").
Protest.belongsTo(Protest, { as: "reconsideration", foreignKey: "reconsiderationId" });

export { sequelize };
