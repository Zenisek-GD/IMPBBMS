import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Vendor } from "./vendorModel.js";
import { PrHeader } from "./prModel.js";
import { ProcurementMode } from "./procurementModeModel.js";
import { AppEntry } from "./appEntryModel.js";

// ── Invitation to Bid / Request for Quotation ────────────────────────────────
// Section 9's invitations_rfq. Created from an approved PR (lifecycle step 4).
export const Rfq = sequelize.define("Rfq", {
  referenceNo: { type: DataTypes.STRING, allowNull: false, unique: true },
  title: { type: DataTypes.STRING, allowNull: false },
  abc: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

  // Drives which eligibility documents apply (IRR Sec. 54.2).
  category: {
    type: DataTypes.ENUM("goods", "infrastructure", "consulting"),
    allowNull: false,
    defaultValue: "goods",
  },

  publishDate: { type: DataTypes.DATEONLY, allowNull: true },
  closingDate: { type: DataTypes.DATE, allowNull: false },

  // IRR Sec. 51.1 — mandatory at an ABC of ₱3,000,000 or more.
  prebidRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  prebidAt: { type: DataTypes.DATE, allowNull: true },

  // IRR Sec. 34.3(b) — an SVP at or below ₱200,000 need not be posted.
  postingRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  // IRR Sec. 50.3 — posting on the PhilGEPS is what makes the opportunity
  // public; notifying registered suppliers in-system is not a substitute for
  // it. This system does not integrate with the PhilGEPS, so what is recorded
  // is the fact of posting and the reference the Secretariat obtained there,
  // which is the thing COA asks for.
  philgepsPostedAt: { type: DataTypes.DATE, allowNull: true },
  philgepsReference: { type: DataTypes.STRING, allowNull: true },

  // An Early Procurement Activity: advertised against the updated Indicative
  // APP before the appropriation ordinance exists. Everything up to award is
  // lawful; the award itself is not, until the ordinance is enacted.
  isEarlyProcurement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  status: {
    type: DataTypes.ENUM("draft", "published", "closed", "opened", "evaluated", "awarded", "cancelled", "failed"),
    allowNull: false,
    defaultValue: "draft",
  },
  cancellationReason: { type: DataTypes.TEXT, allowNull: true },
});

Rfq.belongsTo(PrHeader, { as: "purchaseRequisition", foreignKey: "prHeaderId" });
Rfq.belongsTo(ProcurementMode, { as: "mode", foreignKey: "procurementModeId" });
Rfq.belongsTo(User, { as: "publishedBy", foreignKey: "publishedById" });

// An EPA solicitation hangs off the indicative APP line directly, because there
// is no requisition at that stage. Safe to declare here: appEntryModel.js does
// not import this file, so there is no cycle.
Rfq.belongsTo(AppEntry, { as: "appEntry", foreignKey: "appEntryId" });
AppEntry.hasMany(Rfq, { as: "solicitations", foreignKey: "appEntryId" });

// ── Bids ────────────────────────────────────────────────────────────────────
export const Bid = sequelize.define("Bid", {
  // IRR Sec. 54.1: two envelopes submitted simultaneously. The financial
  // component stays sealed until the technical component is rated "passed"
  // (Sec. 58), so the price is not readable before then.
  technicalSubmitted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  financialSealed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  totalBidPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

  submittedAt: { type: DataTypes.DATE, allowNull: true },

  // Anonymous label shown during blind evaluation (Section 7.9): "Bidder A",
  // "Bidder B"... assigned at bid opening, in opening order.
  blindLabel: { type: DataTypes.STRING, allowNull: true },

  status: {
    type: DataTypes.ENUM(
      "submitted",
      "opened",
      "technicalPassed",
      "technicalFailed",
      "financialOpened",
      "postQualified",
      "postDisqualified",
      "awarded",
      "lost",
      "withdrawn"
    ),
    allowNull: false,
    defaultValue: "submitted",
  },
  remarks: { type: DataTypes.TEXT, allowNull: true },
});

Bid.belongsTo(Rfq, { as: "rfq", foreignKey: "rfqId" });
Rfq.hasMany(Bid, { as: "bids", foreignKey: "rfqId" });
Bid.belongsTo(Vendor, { as: "vendor", foreignKey: "vendorId" });

// ── Bid opening record ──────────────────────────────────────────────────────
// Section 6: bid opening is witnessed per BAC rules; the record is part of the
// audit trail.
export const BidOpeningRecord = sequelize.define("BidOpeningRecord", {
  openedAt: { type: DataTypes.DATE, allowNull: false },
  witnesses: { type: DataTypes.TEXT, allowNull: true },
  remarks: { type: DataTypes.TEXT, allowNull: true },
  bidsReceived: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

BidOpeningRecord.belongsTo(Rfq, { as: "rfq", foreignKey: "rfqId" });
BidOpeningRecord.belongsTo(User, { as: "openedBy", foreignKey: "openedById" });

// ── Evaluation ──────────────────────────────────────────────────────────────
// Section 7.9: sealed/blind scoring against a system-enforced rubric, with an
// immutable timestamped trail of every evaluator's score.
export const Evaluation = sequelize.define("Evaluation", {
  criteriaBreakdown: { type: DataTypes.JSON, allowNull: false },
  score: { type: DataTypes.DECIMAL(6, 2), allowNull: false },

  // True when the evaluator could not see the vendor's identity at scoring
  // time — recorded so the audit trail can prove blindness after the fact.
  blindFlag: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  submittedAt: { type: DataTypes.DATE, allowNull: false },
  remarks: { type: DataTypes.TEXT, allowNull: true },
});

Evaluation.belongsTo(Bid, { as: "bid", foreignKey: "bidId" });
Bid.hasMany(Evaluation, { as: "evaluations", foreignKey: "bidId" });
Evaluation.belongsTo(User, { as: "evaluator", foreignKey: "evaluatorId" });

// ── Post-qualification ──────────────────────────────────────────────────────
export const PostQualification = sequelize.define("PostQualification", {
  checklist: { type: DataTypes.JSON, allowNull: true },
  result: { type: DataTypes.ENUM("passed", "failed"), allowNull: false },
  remarks: { type: DataTypes.TEXT, allowNull: true },
  verifiedAt: { type: DataTypes.DATE, allowNull: false },
});

PostQualification.belongsTo(Bid, { as: "bid", foreignKey: "bidId" });
PostQualification.belongsTo(User, { as: "verifiedBy", foreignKey: "verifiedById" });

// ── Award ───────────────────────────────────────────────────────────────────
export const Award = sequelize.define("Award", {
  noaNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  noaDate: { type: DataTypes.DATEONLY, allowNull: false },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

  // RA 12009 Sec. 65 — Goods and Infrastructure Projects go to the Lowest
  // Calculated Responsive Bid; Consulting Services to the Highest Rated
  // Responsive Bid. Recorded so the basis the award was made on is part of the
  // award rather than something reconstructed from the resolution's prose.
  awardBasis: { type: DataTypes.ENUM("LCRB", "HRRB"), allowNull: true },

  status: {
    type: DataTypes.ENUM(
      "pendingHopeApproval",
      "issued",
      "accepted",
      "declined",
      "cancelled",
      // Sec. 66 — the HoPE may disapprove the BAC's recommendation, but only on
      // valid, reasonable and justifiable grounds expressed in writing and
      // furnished to the committee. There was previously no way to record that.
      "disapproved"
    ),
    allowNull: false,
    defaultValue: "pendingHopeApproval",
  },

  // The written grounds for a disapproval, and the notice to proceed that
  // starts contract time once the contract is in force.
  disapprovalGrounds: { type: DataTypes.TEXT, allowNull: true },
  disapprovedAt: { type: DataTypes.DATE, allowNull: true },

  remarks: { type: DataTypes.TEXT, allowNull: true },
});

Award.belongsTo(Rfq, { as: "rfq", foreignKey: "rfqId" });
Award.belongsTo(Bid, { as: "bid", foreignKey: "bidId" });
Award.belongsTo(Vendor, { as: "vendor", foreignKey: "vendorId" });
Award.belongsTo(User, { as: "recommendedBy", foreignKey: "recommendedById" });
Award.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById" });

export { sequelize };
