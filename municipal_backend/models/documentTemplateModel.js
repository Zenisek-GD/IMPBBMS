import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// ── DOCUMENT TEMPLATES ───────────────────────────────────────────────────────
// Every official document this office issues — a Notice of Award, a Notice to
// Proceed, an Inspection and Acceptance Report — is the same few paragraphs
// with different names and figures dropped into them. Typing them by hand is
// how a supplier's name ends up misspelled on a contract and how two Notices of
// Award issued a week apart end up in different formats.
//
// A template is authored once as HTML with `{placeholder}` tokens; generation
// substitutes real values pulled from the procurement record. The office keeps
// control of the wording and the layout; the system guarantees the *facts* are
// the ones actually on file.

// The document types the module knows how to source data for. `other` exists
// because an office will always have a form nobody anticipated, and the
// alternative to supporting it is that they go back to Word.
export const DOCUMENT_TYPES = [
  "invitationToBid",
  "noticeOfAward",
  "noticeToProceed",
  "contractAgreement",
  "purchaseRequest",
  "inspectionAcceptanceReport",
  "certificateOfRecognition",
  "certificateOfParticipation",
  "certificateOfAppreciation",
  "other",
];

export const DOCUMENT_TYPE_LABELS = {
  invitationToBid: "Invitation to Bid",
  noticeOfAward: "Notice of Award",
  noticeToProceed: "Notice to Proceed",
  contractAgreement: "Contract Agreement",
  purchaseRequest: "Purchase Request",
  inspectionAcceptanceReport: "Inspection and Acceptance Report",
  certificateOfRecognition: "Certificate of Recognition",
  certificateOfParticipation: "Certificate of Participation",
  certificateOfAppreciation: "Certificate of Appreciation",
  other: "Other official document",
};

export const TEMPLATE_STATUSES = ["draft", "active", "archived"];

export const DocumentTemplate = sequelize.define(
  "DocumentTemplate",
  {
    // Stable slug the seed and any code path can look a template up by, so a
    // renamed template does not break the thing that generates from it.
    key: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    documentType: { type: DataTypes.ENUM(...DOCUMENT_TYPES), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },

    // draft    — being written, cannot be generated from
    // active   — the template documents are produced with
    // archived — retired, but kept because documents already generated from it
    //            must remain explicable
    status: { type: DataTypes.ENUM(...TEMPLATE_STATUSES), allowNull: false, defaultValue: "draft" },

    // Which version generation uses. Editing a template creates a *new* version
    // and repoints this; it never rewrites the old one, so a document generated
    // last March can still be shown against the wording in force at the time.
    activeVersionId: { type: DataTypes.INTEGER, allowNull: true },

    // Whether documents of this type may ever reach the public portal. A
    // Notice of Award is a public act; a purchase request is internal. Held on
    // the template rather than decided per document, so an operator cannot
    // publish something whose type was never meant to be published.
    publishable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Seeded templates are the office's known-good starting set. Flagged so the
    // UI can say "this came with the system" and so a reseed can refresh them
    // without touching anything an official authored.
    isSystemTemplate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { indexes: [{ fields: ["documentType"] }, { fields: ["status"] }] }
);

DocumentTemplate.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });

// ── VERSIONS ─────────────────────────────────────────────────────────────────
// Append-only. A version is the evidence of what a document said when it was
// issued, so editing one in place would quietly rewrite history for every
// document already generated from it.
export const DocumentTemplateVersion = sequelize.define(
  "DocumentTemplateVersion",
  {
    versionNo: { type: DataTypes.INTEGER, allowNull: false },

    // The body, header and footer are separate because a browser prints running
    // headers and footers on every page from their own fragments — they are not
    // simply the top and bottom of the body.
    bodyHtml: { type: DataTypes.TEXT("long"), allowNull: false },
    headerHtml: { type: DataTypes.TEXT, allowNull: true },
    footerHtml: { type: DataTypes.TEXT, allowNull: true },
    css: { type: DataTypes.TEXT, allowNull: true },

    pageSize: { type: DataTypes.STRING, allowNull: false, defaultValue: "A4" },
    landscape: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // { top, right, bottom, left } as CSS lengths.
    margins: { type: DataTypes.JSON, allowNull: true },

    changeNote: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    indexes: [{ fields: ["documentTemplateId", "versionNo"], unique: true }],
    hooks: {
      beforeUpdate: () => {
        throw new Error(
          "Template versions are append-only. Save a new version instead of editing one that documents may already have been generated from."
        );
      },
      beforeDestroy: () => {
        throw new Error("Template versions are append-only and cannot be deleted.");
      },
    },
  }
);

DocumentTemplateVersion.belongsTo(DocumentTemplate, {
  as: "template",
  foreignKey: "documentTemplateId",
});
DocumentTemplate.hasMany(DocumentTemplateVersion, {
  as: "versions",
  foreignKey: "documentTemplateId",
});

DocumentTemplateVersion.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });

export const nextVersionNo = async (documentTemplateId) => {
  const latest = await DocumentTemplateVersion.max("versionNo", { where: { documentTemplateId } });
  return (latest ?? 0) + 1;
};

export { sequelize };
