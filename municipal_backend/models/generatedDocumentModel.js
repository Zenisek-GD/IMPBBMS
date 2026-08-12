import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Document } from "./documentModel.js";
import { DocumentTemplate, DocumentTemplateVersion, DOCUMENT_TYPES } from "./documentTemplateModel.js";

// ── A DOCUMENT THAT WAS ACTUALLY ISSUED ──────────────────────────────────────
// The template is the wording; this is the paper. One row per document the
// office produced, tied to the procurement record it was produced from, the
// exact template version it was produced with, and the PDF that came out.
//
// Three things are kept that a naive implementation would omit, each because a
// question gets asked later that cannot otherwise be answered:
//
//   renderedHtml   what the document actually said, including any manual edit
//                  the officer made before issuing it. Regenerating from the
//                  template would not reproduce it.
//   dataSnapshot   the values the placeholders resolved to at the moment of
//                  generation. A supplier's address can change afterwards; the
//                  Notice of Award still bears the old one, and this explains
//                  why without anyone having to guess.
//   templateVersionId  which wording was in force. Points at an append-only
//                  row, so it cannot be quietly rewritten.

export const GENERATED_DOCUMENT_STATUSES = ["draft", "pendingApproval", "approved", "void"];

export const GENERATED_DOCUMENT_STATUS_LABELS = {
  draft: "Draft",
  pendingApproval: "Awaiting approval",
  approved: "Approved and issued",
  void: "Void",
};

export const GeneratedDocument = sequelize.define(
  "GeneratedDocument",
  {
    documentNo: { type: DataTypes.STRING, allowNull: false, unique: true },
    documentType: { type: DataTypes.ENUM(...DOCUMENT_TYPES), allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },

    // The procurement record this document is *about*. Polymorphic for the same
    // reason the attachment store is: one table serves awards, contracts,
    // deliveries and requisitions without a table per kind.
    entityRef: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },

    renderedHtml: { type: DataTypes.TEXT("long"), allowNull: false },
    dataSnapshot: { type: DataTypes.JSON, allowNull: true },

    // True once an officer has changed the generated wording by hand. Worth a
    // flag of its own: a document that was edited after the data was merged is
    // exactly the one a reviewer wants to read closely.
    manuallyEdited: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    status: {
      type: DataTypes.ENUM(...GENERATED_DOCUMENT_STATUSES),
      allowNull: false,
      defaultValue: "draft",
    },

    approvedAt: { type: DataTypes.DATE, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidReason: { type: DataTypes.TEXT, allowNull: true },

    // ── Public transparency ───────────────────────────────────────────────────
    // Publication is a deliberate act taken after approval, never a side effect
    // of it. `isPublic` is the switch the public portal reads; the timestamp and
    // the officer are kept because putting a document in front of the whole
    // municipality is an accountable decision.
    isPublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    unpublishedAt: { type: DataTypes.DATE, allowNull: true },

    // How many times the PDF has been produced. A reprint is legitimate and
    // routine; a document reprinted twenty times is worth a second look.
    printCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastPrintedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [
      { fields: ["entityRef", "entityId"] },
      { fields: ["documentType"] },
      { fields: ["status"] },
      { fields: ["isPublic"] },
    ],
  }
);

GeneratedDocument.belongsTo(DocumentTemplate, { as: "template", foreignKey: "documentTemplateId" });
GeneratedDocument.belongsTo(DocumentTemplateVersion, {
  as: "templateVersion",
  foreignKey: "documentTemplateVersionId",
});

// The PDF itself lives in the existing attachment store rather than in a new
// blob column — same table, same checksum, same download route and the same
// access logging that every other file in the system already goes through.
GeneratedDocument.belongsTo(Document, { as: "pdf", foreignKey: "pdfDocumentId" });

GeneratedDocument.belongsTo(User, { as: "generatedBy", foreignKey: "generatedById" });
GeneratedDocument.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById" });
GeneratedDocument.belongsTo(User, { as: "publishedBy", foreignKey: "publishedById" });
GeneratedDocument.belongsTo(User, { as: "voidedBy", foreignKey: "voidedById" });

// A reissued document points at the one it replaces. Voiding and regenerating
// is how a mistake on an issued document is corrected — the wrong one is never
// deleted, because it may already be in a supplier's hands.
GeneratedDocument.belongsTo(GeneratedDocument, { as: "supersedes", foreignKey: "supersedesId" });

export const nextDocumentNo = async (prefix) => {
  const { Op } = await import("sequelize");
  const year = new Date().getFullYear();
  const count = await GeneratedDocument.count({
    where: { documentNo: { [Op.like]: `${prefix}-${year}-%` } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
};

export { sequelize };
