import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Rfq } from "./biddingModel.js";

// ── OBSERVERS ────────────────────────────────────────────────────────────────
// RA 12009 Sec. 43. The most visible transparency control in Philippine
// procurement, and the one this system had no representation of at all: the
// `observer` role could read published records, which is what any citizen can
// do, and had no way to be invited to anything or to file the report the law
// obliges them to file.
//
// Sec. 43.1 — during eligibility checking, short-listing, the pre-bid
// conference, preliminary examination of bids, bid evaluation and
// post-qualification, the BAC shall invite, in addition to the representative
// of the COA, at least two (2) observers with no voting rights:
//
//   · at least one from a duly recognised private group in a sector or
//     discipline relevant to the procurement (CIAP-recognised constructors'
//     associations for infrastructure; a relevant PCCI chamber member for
//     goods; a PRC- or Supreme Court-recognised professional organisation for
//     consulting services); and
//   · at least one from a civil society organisation or people's organisation.
//
// Sec. 43.2 — invited in writing at least five (5) calendar days before the
// activity. Their absence does not nullify the proceedings *provided they were
// duly invited*, which is precisely why the invitation has to be a record.

// The stages at which observers must be invited. Named exactly as Sec. 43.1
// names them, so the list can be checked against the law without translation.
export const OBSERVABLE_STAGES = [
  "eligibilityChecking",
  "shortListing",
  "prebidConference",
  "preliminaryExamination",
  "bidEvaluation",
  "postQualification",
];

export const OBSERVABLE_STAGE_LABELS = {
  eligibilityChecking: "Eligibility checking",
  shortListing: "Short-listing",
  prebidConference: "Pre-bid conference",
  preliminaryExamination: "Preliminary examination of bids",
  bidEvaluation: "Bid evaluation",
  postQualification: "Post-qualification",
};

// Sec. 43.1 — the three constituencies. COA is invited in addition to the two.
export const OBSERVER_SECTORS = ["coa", "privateGroup", "csoOrPo"];

export const OBSERVER_SECTOR_LABELS = {
  coa: "Commission on Audit",
  privateGroup: "Duly recognised private group (relevant sector or discipline)",
  csoOrPo: "Civil society organisation / people's organisation",
};

// Sec. 43.2 — the minimum notice period.
export const OBSERVER_NOTICE_DAYS = 5;

// Sec. 43.4(b) — the window after which silence is read as concurrence.
export const OBSERVATION_REPORT_DAYS = 7;

// ── The organisations on the roster ──────────────────────────────────────────
// Sec. 43.1.2 requires the private group or CSO/PO to be registered with the
// SEC or the CDA, and its representative to meet knowledge and conflict-of-
// interest criteria. Sec. 43.5 has the GPPB maintaining a registry; an LGU
// keeps its own working roster against it.
export const ObserverOrganization = sequelize.define("ObserverOrganization", {
  name: { type: DataTypes.STRING, allowNull: false },
  sector: { type: DataTypes.ENUM(...OBSERVER_SECTORS), allowNull: false },

  // Which procurement categories this organisation is relevant to. A
  // constructors' association observes infrastructure, not consulting.
  relevantCategories: { type: DataTypes.JSON, allowNull: true },

  // Sec. 43.1.2 — registered with the SEC or the CDA, as the case may be.
  registryBody: { type: DataTypes.ENUM("sec", "cda", "coa", "none"), allowNull: false, defaultValue: "sec" },
  registrationNo: { type: DataTypes.STRING, allowNull: true },

  contactPerson: { type: DataTypes.STRING, allowNull: true },
  contactEmail: { type: DataTypes.STRING, allowNull: true },

  status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
  remarks: { type: DataTypes.TEXT, allowNull: true },
});

// ── The invitation ───────────────────────────────────────────────────────────
// One row per organisation per stage of one procurement. This is the artefact
// that proves the BAC did what Sec. 43.2 requires, and it is what makes an
// observer's absence lawful rather than a defect in the proceedings.
export const ObserverInvitation = sequelize.define(
  "ObserverInvitation",
  {
    stage: { type: DataTypes.ENUM(...OBSERVABLE_STAGES), allowNull: false },

    // When the activity is scheduled, and when the invitation went out. The
    // gap between them is the five-day notice the law requires.
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    invitedAt: { type: DataTypes.DATE, allowNull: false },

    // Sec. 43.2 — computed and stored rather than recalculated at read time, so
    // a later change to the schedule cannot quietly make a short notice look
    // compliant.
    noticeDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    noticeCompliant: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Sec. 43.3 — the representative who will attend should be a certified
    // member in good standing of the organisation.
    representativeName: { type: DataTypes.STRING, allowNull: true },

    // Sec. 43.5 — observers sign a confidentiality agreement in all instances.
    confidentialityAgreedAt: { type: DataTypes.DATE, allowNull: true },

    attendance: {
      type: DataTypes.ENUM("invited", "attended", "absent", "inhibited"),
      allowNull: false,
      defaultValue: "invited",
    },
    attendedAt: { type: DataTypes.DATE, allowNull: true },

    // Sec. 43.4(c) — an observer with an actual or potential interest must
    // immediately inhibit and notify the Procuring Entity in writing.
    inhibitionReason: { type: DataTypes.TEXT, allowNull: true },

    remarks: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    indexes: [{ fields: ["rfqId", "stage"] }],
  }
);

ObserverInvitation.belongsTo(Rfq, { as: "rfq", foreignKey: "rfqId" });
Rfq.hasMany(ObserverInvitation, { as: "observerInvitations", foreignKey: "rfqId" });
ObserverInvitation.belongsTo(ObserverOrganization, {
  as: "organization",
  foreignKey: "observerOrganizationId",
});
ObserverInvitation.belongsTo(User, { as: "invitedBy", foreignKey: "invitedById" });
// The account the observer signs in with, where one exists.
ObserverInvitation.belongsTo(User, { as: "observerUser", foreignKey: "observerUserId" });

// ── The Observation Report ───────────────────────────────────────────────────
// Sec. 43.4(a)–(b). Submitted to the HoPE, copy furnished the BAC Chairperson,
// and to PhilGEPS, COA, the GPPB and the Ombudsman. If none is submitted within
// seven calendar days of the activity, the proceedings are presumed regular —
// so the *absence* of a report is itself a finding, which is why the deadline
// is stored rather than inferred.
export const ObservationReport = sequelize.define("ObservationReport", {
  // "assess the extent of the BAC's compliance with the provisions of this IRR
  // and areas of improvement in the BAC's proceedings" (Sec. 43.4(a)).
  complianceAssessment: { type: DataTypes.TEXT, allowNull: false },
  areasForImprovement: { type: DataTypes.TEXT, allowNull: true },

  // Whether the observer found the proceedings regular. A dissent has to be
  // capable of being expressed, or the report is a formality.
  findingsRegular: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  submittedAt: { type: DataTypes.DATE, allowNull: false },
  dueAt: { type: DataTypes.DATE, allowNull: false },
  submittedLate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Sec. 43.4(b) — where the report was furnished. Recorded as a checklist
  // because the obligation runs to five bodies, not one.
  furnishedTo: { type: DataTypes.JSON, allowNull: true },
});

ObservationReport.belongsTo(ObserverInvitation, { as: "invitation", foreignKey: "invitationId" });
ObserverInvitation.hasOne(ObservationReport, { as: "report", foreignKey: "invitationId" });
ObservationReport.belongsTo(User, { as: "submittedBy", foreignKey: "submittedById" });

export { sequelize };
