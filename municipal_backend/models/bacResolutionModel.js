import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { nextSequenceNo } from "../services/sequenceNo.js";

// ── BAC RESOLUTION ───────────────────────────────────────────────────────────
// The Bids and Awards Committee is a collegial body. It does not act through
// one person's click — it acts through a numbered resolution, signed by its
// members, recording what was decided and who concurred.
//
// The system previously recorded `Award.recommendedById`: a single user id. For
// a platform whose selling point is auditability, the actual auditable artifact
// of the committee was the one thing missing. A COA auditor asking "on what
// authority was this awarded?" would have been handed a foreign key.
export const RESOLUTION_TYPES = [
  "recommendAward",
  "failureOfBidding",
  "adoptAlternativeMode",
  "declareFailedProject",
  "postDisqualification",
];

export const RESOLUTION_TYPE_LABELS = {
  recommendAward: "Resolution Recommending Award",
  failureOfBidding: "Resolution Declaring Failure of Bidding",
  adoptAlternativeMode: "Resolution Adopting an Alternative Mode of Procurement",
  declareFailedProject: "Resolution Declaring the Project Failed",
  postDisqualification: "Resolution on Post-Disqualification",
};

export const BacResolution = sequelize.define(
  "BacResolution",
  {
    resolutionNo: { type: DataTypes.STRING, allowNull: false, unique: true },
    type: { type: DataTypes.ENUM(...RESOLUTION_TYPES), allowNull: false },

    title: { type: DataTypes.STRING, allowNull: false },
    // The operative text: what the committee resolved, and on what grounds.
    recitals: { type: DataTypes.TEXT, allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: false },

    // Who was present and who concurred. Stored as a snapshot rather than as
    // foreign keys, because a resolution records the committee as it was
    // constituted on the day — later membership changes must not rewrite it.
    //
    // [{ userId, name, role, concurred }]
    members: { type: DataTypes.JSON, allowNull: true },

    // A BAC resolution needs a majority of the members present to carry.
    quorumMet: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    // What the resolution is about — an RFQ, an award, a bid.
    entityRef: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },
  },
  { indexes: [{ fields: ["entityRef", "entityId"] }, { fields: ["type"] }] }
);

BacResolution.belongsTo(User, { as: "chairperson", foreignKey: "chairpersonId" });

export const nextResolutionNo = (year, transaction) =>
  nextSequenceNo(BacResolution, "resolutionNo", "BAC-RES", year, { transaction });

export { sequelize };
