import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Announcement } from "./announcementModel.js";

// Design doc Section 2.2: vendors are onboarded through the controlled
// procurement flow (registration + document submission), not open sign-up.
export const Vendor = sequelize.define("Vendor", {
  businessName: { type: DataTypes.STRING, allowNull: false },
  tin: { type: DataTypes.STRING, allowNull: true },

  // Drives which eligibility documents apply — see
  // municipal-frontend/src/config/eligibilityRequirements.js (IRR Sec. 52/54).
  organizationType: {
    type: DataTypes.ENUM("corporation", "partnership", "soleProprietorship", "cooperative"),
    allowNull: false,
    defaultValue: "corporation",
  },
  isJointVenture: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  isForeignBidder: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // IRR Sec. 52.1 — the PhilGEPS Platinum certificate is the document the BAC
  // actually collects, and it is valid for one year (Sec. 20.2.9(b)).
  philgepsRegistrationNo: { type: DataTypes.STRING, allowNull: true },
  philgepsExpiry: { type: DataTypes.DATEONLY, allowNull: true },

  // ── Tax profile ────────────────────────────────────────────────────────────
  // Government is a withholding agent: it does not pay a supplier the full
  // invoice and leave the tax to them. What is withheld depends on whether the
  // supplier is VAT-registered and on what is being supplied, so both must be
  // known before a disbursement voucher can be computed.
  isVatRegistered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  // Drives the expanded withholding tax rate: 1% on goods, 2% on services.
  taxClassification: {
    type: DataTypes.ENUM("goods", "services"),
    allowNull: false,
    defaultValue: "goods",
  },

  // ── The accredited channel ─────────────────────────────────────────────────
  // THE authoritative email address for this bidder, captured when the
  // requirements are submitted and fixed once the registration is verified.
  //
  // Everything downstream is bound to this one value: the account an official
  // creates carries it, the activation invitation is sent to it, the one-time
  // code that proves ownership goes to it, and password recovery uses it. That
  // binding is the mechanism behind the requirement that only the address
  // submitted and approved during accreditation can activate the account — there
  // is deliberately no second address anywhere that could compete with it.
  contactEmail: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
  contactPerson: { type: DataTypes.STRING, allowNull: true },
  contactPhone: { type: DataTypes.STRING, allowNull: true },
  address: { type: DataTypes.STRING, allowNull: true },

  // Quoted back to the bidder on submission and in the acknowledgement email, so
  // they have something to cite when following up. Random rather than sequential:
  // a running number would tell every applicant how many others have applied, and
  // would let one guess another's reference.
  referenceCode: { type: DataTypes.STRING(24), allowNull: true, unique: true },

  registrationStatus: {
    type: DataTypes.ENUM("draft", "submitted", "verified", "returned", "blacklisted"),
    allowNull: false,
    defaultValue: "draft",
  },
  reviewRemarks: { type: DataTypes.TEXT, allowNull: true },

  submittedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },

  // When the bidder physically handed the papers in at the BAC office.
  //
  // Distinct from `submittedAt`/`createdAt` on purpose: accreditation documents
  // arrive over a counter and may be keyed into the system hours or days later,
  // so the timestamp the row was written is not the date the submission was made.
  // This is the officer's statement of when they received the file, and it is what
  // an announcement's registration deadline is judged against.
  receivedAt: { type: DataTypes.DATE, allowNull: true },

  // Set when an authorized official creates the bidder's account. Its presence is
  // what the console keys off to stop a second account being created for the same
  // approved registration.
  accountCreatedAt: { type: DataTypes.DATE, allowNull: true },

  // ── Blacklisting (RA 12009 Sec. 69) ────────────────────────────────────────
  // The sanction that bars a supplier from participating in any government
  // procurement. `registrationStatus: "blacklisted"` and the eligibility check
  // that reads it both existed; the *act* did not, so a supplier could only be
  // blacklisted by editing the database.
  //
  // A blacklisting has a term. The Performance Securing Declaration states the
  // default the IRR carries: one year for a first offence, two where there is a
  // prior similar offence. Storing the end date rather than a boolean means the
  // sanction lapses on its own instead of needing somebody to remember.
  blacklistedAt: { type: DataTypes.DATE, allowNull: true },
  blacklistedUntil: { type: DataTypes.DATE, allowNull: true },
  blacklistGrounds: { type: DataTypes.TEXT, allowNull: true },
  blacklistOrderNo: { type: DataTypes.STRING, allowNull: true },
  // What the registration was before the sanction, so lifting it restores the
  // supplier to where they stood rather than guessing at "verified".
  statusBeforeBlacklist: { type: DataTypes.STRING, allowNull: true },
});

// The account, once one exists.
//
// Nullable, and null for most of a registration's life. Requirements are
// submitted BEFORE any account exists — that ordering is the whole point of the
// onboarding rule, since an account that could submit its own accreditation would
// be an account that existed before it was accredited. The foreign key is
// populated later, by the official who creates the account against an approved
// registration.
Vendor.belongsTo(User, { as: "account", foreignKey: "userId" });

// Who approved (or returned, or blacklisted) the registration.
Vendor.belongsTo(User, { as: "reviewedBy", foreignKey: "reviewedByUserId" });

// The officer who received the papers at the counter and keyed them in.
//
// Held separately from `reviewedBy` even though it is usually the same person:
// receiving a submission and deciding on it are two acts, and an auditor asking
// "who says this arrived on the 12th?" is asking about this column.
Vendor.belongsTo(User, { as: "recordedBy", foreignKey: "recordedByUserId" });

// The published call this application answered, when it answered one.
//
// Nullable, and legitimately so. Accreditation is a standing status, not a
// per-opportunity one: a verified bidder does not reapply for every procurement,
// which is both how the BAC works and what IRR Sec. 52's registry-based
// eligibility assumes. A business may therefore come forward on its own, with no
// call open, and that is a valid application.
//
// What the link buys is the deadline. When an application does answer a specific
// call, it is accepted only while that call's registrationDeadline is in the
// future — so "submit by this date or you cannot take part in this procurement"
// becomes a rule the system enforces rather than a sentence on a notice.
Vendor.belongsTo(Announcement, { as: "call", foreignKey: "announcementId" });

export const VendorDocument = sequelize.define("VendorDocument", {
  // Matches the item ids in eligibilityRequirements.js so the wizard and the
  // stored record line up.
  docType: { type: DataTypes.STRING, allowNull: false },
  label: { type: DataTypes.STRING, allowNull: false },
  citation: { type: DataTypes.STRING, allowNull: true },

  // File storage is not wired yet; this holds the reference once it is.
  fileRef: { type: DataTypes.STRING, allowNull: true },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
  status: {
    type: DataTypes.ENUM("attached", "verified", "rejected"),
    allowNull: false,
    defaultValue: "attached",
  },
  remarks: { type: DataTypes.TEXT, allowNull: true },
});

Vendor.hasMany(VendorDocument, { as: "documents", foreignKey: "vendorId", onDelete: "CASCADE" });
VendorDocument.belongsTo(Vendor, { foreignKey: "vendorId" });

export { sequelize };
