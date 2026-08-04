import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// File storage for procurement documents, held in MySQL as requested.
//
// Trade-off worth knowing: keeping bytes in the database means uploads are
// transactional with the records that reference them, there is no second store
// to secure or back up separately, and a database restore brings the documents
// back with it. The cost is a larger database and higher memory use per
// request, since a BLOB is materialised in full rather than streamed. At
// municipal procurement volumes (PDFs and scans, a few MB each) that is a
// reasonable exchange; if attachment volume ever grows into the tens of GB,
// move `content` to object storage and keep this table as the metadata index —
// every other table references documents by id, so nothing else would change.
export const Document = sequelize.define(
  "Document",
  {
    filename: { type: DataTypes.STRING, allowNull: false },
    mimeType: { type: DataTypes.STRING, allowNull: false },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: false },

    // LONGBLOB. MySQL's max_allowed_packet caps a single insert well below the
    // 4GB type limit, so the application enforces its own smaller limit.
    content: { type: DataTypes.BLOB("long"), allowNull: false },

    // SHA-256 of the bytes. Lets a reviewer confirm a downloaded file is
    // byte-identical to what was submitted, and detects silent corruption.
    checksum: { type: DataTypes.STRING(64), allowNull: false },

    // Polymorphic owner so one table serves vendor documents, bid attachments,
    // contracts, delivery proofs and invoices without a table per kind.
    entityRef: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },

    // What the file is *for* — e.g. "philgeps-platinum", matching the ids in
    // the frontend's eligibilityRequirements config.
    docType: { type: DataTypes.STRING, allowNull: true },
    label: { type: DataTypes.STRING, allowNull: true },

    uploadedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    indexes: [{ fields: ["entityRef", "entityId"] }],
  }
);

Document.belongsTo(User, { as: "uploadedBy", foreignKey: "uploadedById" });

// Metadata only — deliberately never includes `content`, so listing documents
// cannot accidentally pull megabytes of blobs into memory.
export const DOCUMENT_METADATA_ATTRIBUTES = [
  "id",
  "filename",
  "mimeType",
  "sizeBytes",
  "checksum",
  "entityRef",
  "entityId",
  "docType",
  "label",
  "uploadedAt",
  "uploadedById",
];

export { sequelize };
