import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Department } from "./departmentModel.js";
import { AppEntry } from "./appEntryModel.js";
import { Obligation } from "./appropriationModel.js";
import { ProcurementMode } from "./procurementModeModel.js";

// Purchase Requisition. The states follow the order the signatures are
// actually collected on the municipality's Purchase Request form — see the
// long note at the top of services/prWorkflow.js, which is the authority for
// this sequence and explains why it is not the LGC Sec. 344 disbursement order.
export const PR_STATES = [
  "draft",
  "pendingDepartmentHeadEndorsement",
  // The Treasurer certifies that the funds are available (step 16).
  "pendingCashCertification",
  // The Mayor approves the request (step 17).
  "pendingMayorApproval",
  // The Budget Office certifies the appropriation and names the funding
  // source (step 18).
  "pendingBudgetCertification",
  // The Accountant obligates that appropriation and raises the ORS (step 18b).
  // LGC Sec. 344 names three officers on a disbursement — budget officer,
  // accountant, treasurer — and the accountant's obligation was previously
  // folded into the budget officer's certification.
  "pendingAccountantObligation",
  // The BAC determines how it will be procured (step 19).
  "pendingModeDetermination",
  "returned",
  // Cleared: every signature collected and a mode determined. Procurement may
  // begin (step 20).
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

    // The Budget Officer's certification that an appropriation exists and has
    // room under it (step 18). Distinct from the obligation below: certifying
    // is a statement about the ordinance, obligating is an entry in the books.
    appropriationCertifiedAt: { type: DataTypes.DATE, allowNull: true },

    // The moment the Accountant's obligation actually encumbers the money
    // (step 18b). From here the amount is unavailable to anything else.
    fundsReservedAt: { type: DataTypes.DATE, allowNull: true },

    // The Treasurer's certification that the cash exists. Held separately from
    // `fundsReservedAt` because they answer different questions and are made by
    // different officers — an auditor asking "who said the money was there?"
    // is asking about this column, not that one.
    cashCertifiedAt: { type: DataTypes.DATE, allowNull: true },

    // The Mayor's approval of the request itself (step 17), which is a
    // different act from the requisition reaching its final "approved" state —
    // the Budget Office and the BAC still have to act after it. Recorded on its
    // own column so the form can be reproduced with the right name in the right
    // box.
    mayorApprovedAt: { type: DataTypes.DATE, allowNull: true },

    // ── The funding source ────────────────────────────────────────────────────
    // Step 18 is not only "does an appropriation exist" — the Budget Office also
    // identifies which fund pays. The system knew this implicitly through the
    // appropriation, but the requisition itself did not carry it, so a printed
    // PR could not state its own charge. Copied from the appropriation at
    // certification rather than chosen, so it cannot disagree with the line the
    // money is actually obligated against.
    fundSource: {
      type: DataTypes.ENUM("generalFund", "specialEducationFund", "trustFund"),
      allowNull: true,
    },

    // ── The BAC's determination (step 19) ─────────────────────────────────────
    // Which mode of procurement the committee resolved to use, and why if it is
    // not the one the thresholds indicate. Recorded here rather than left to be
    // chosen on the RFQ form, so the determination exists as an act with a date
    // and an officer behind it even for requisitions that never reach an RFQ.
    modeDeterminedAt: { type: DataTypes.DATE, allowNull: true },
    modeJustification: { type: DataTypes.TEXT, allowNull: true },
    // What the threshold service indicated at the time, kept alongside what was
    // chosen. A determination that departed from the indicated mode is the
    // thing an auditor looks for, and it cannot be reconstructed later if the
    // LGU's income classification changes in between.
    suggestedModeKey: { type: DataTypes.STRING, allowNull: true },

    submittedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { indexes: [{ fields: ["status"] }] }
);

// ── How an item is carried in the books ──────────────────────────────────────
// Three outcomes, decided by useful life first and cost second:
//
//   expense         consumed within the year — supplies, fuel, services
//   semiExpendable  lasts beyond a year but costs less than the capitalisation
//                   threshold. Still property and still accounted for on issue
//                   and in the inventory, but not capitalised as PPE
//   capitalOutlay   lasts beyond a year and costs at least the threshold —
//                   capitalised as Property, Plant and Equipment and depreciated
//
// COA Circular 2022-004 sets that threshold at ₱50,000 per item. It is read
// from settings rather than hardcoded because COA has moved it before.
//
// The distinction is not cosmetic: it decides which appropriation class the
// purchase may be charged to (Capital Outlay vs MOOE) and whether the item ends
// up in the PPE register or the semi-expendable inventory.
export const ASSET_CLASSES = ["expense", "semiExpendable", "capitalOutlay"];

export const ASSET_CLASS_LABELS = {
  expense: "Expense — consumed within the year",
  semiExpendable: "Semi-expendable property — useful life over a year, below the capitalisation threshold",
  capitalOutlay: "Capital Outlay — capitalised as Property, Plant and Equipment",
};

export const PrLineItem = sequelize.define("PrLineItem", {
  description: { type: DataTypes.STRING, allowNull: false },
  unit: { type: DataTypes.STRING, allowNull: true },
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  lineTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

  // Whether the item lasts beyond one accounting period. This is the requester's
  // to state — the system cannot infer it from a description — and it is what
  // the classification below is derived from.
  hasUsefulLifeOverOneYear: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Derived server-side from `hasUsefulLifeOverOneYear` and the **unit** cost
  // against the threshold. Unit cost, not line total: ten chairs at ₱6,000 are
  // ten semi-expendable items, not one capital asset.
  assetClass: {
    type: DataTypes.ENUM(...ASSET_CLASSES),
    allowNull: false,
    defaultValue: "expense",
  },
});

// The classification rule, in one place so the requisition form, the validator
// and any report that groups by asset class can never disagree.
export const classifyLineItem = ({ hasUsefulLifeOverOneYear, unitCost }, threshold) => {
  if (!hasUsefulLifeOverOneYear) return "expense";
  return Number(unitCost) >= Number(threshold) ? "capitalOutlay" : "semiExpendable";
};

// Section 4 / 5.3: no PR may exist without a linked, approved APP entry.
PrHeader.belongsTo(AppEntry, { as: "appEntry", foreignKey: "appEntryId" });
AppEntry.hasMany(PrHeader, { foreignKey: "appEntryId" });

PrHeader.belongsTo(User, { as: "requester", foreignKey: "requesterId" });
PrHeader.belongsTo(Department, { as: "department", foreignKey: "departmentId" });

// The officers behind each signature on the form. Named individually because
// these certifications are personal accountabilities under LGU budgeting rules,
// not office-level ones — an auditor asks "who signed?", not "which office?".
PrHeader.belongsTo(User, { as: "cashCertifiedBy", foreignKey: "cashCertifiedById" });
PrHeader.belongsTo(User, { as: "mayorApprovedBy", foreignKey: "mayorApprovedById" });
PrHeader.belongsTo(User, { as: "modeDeterminedBy", foreignKey: "modeDeterminedById" });
// LGC Sec. 344's three officers, each recorded personally: the statement that
// an appropriation exists, the entry that obligates it, and the certification
// that the cash is there are three accountabilities, not one.
PrHeader.belongsTo(User, { as: "appropriationCertifiedBy", foreignKey: "appropriationCertifiedById" });
PrHeader.belongsTo(User, { as: "obligatedBy", foreignKey: "obligatedById" });

// The mode the BAC determined. Held on the requisition rather than only on the
// RFQ, because the determination happens before any solicitation exists and
// applies even to modes that never produce one.
PrHeader.belongsTo(ProcurementMode, { as: "procurementMode", foreignKey: "procurementModeId" });

PrHeader.hasMany(PrLineItem, { as: "lineItems", foreignKey: "prHeaderId", onDelete: "CASCADE" });
PrLineItem.belongsTo(PrHeader, { foreignKey: "prHeaderId" });

// The Obligation Request raised when the Budget Officer certifies this
// requisition. One per requisition: certifying again after a cancellation
// issues a new ORS rather than reviving the old one, so the register shows both
// the commitment and its reversal.
PrHeader.hasMany(Obligation, { as: "obligations", foreignKey: "prHeaderId" });
Obligation.belongsTo(PrHeader, { as: "requisition", foreignKey: "prHeaderId" });

export { sequelize };
