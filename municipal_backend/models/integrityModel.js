import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// ── DETECTING CHANGES THAT DID NOT COME THROUGH THE SYSTEM ───────────────────
//
// The audit log already proves that nothing *recorded* has been altered: it is
// hash-chained, so editing an old entry breaks every hash after it. What it
// cannot do on its own is notice a change that was never recorded in the first
// place.
//
// That is the real threat here. Somebody with a MySQL client — a developer, a
// contractor, an attacker who reached the database rather than the application
// — can raise an appropriation, grant themselves a permission, or delete an
// award, and the application will never know. The audit log stays perfectly
// intact and perfectly silent, because nothing asked it to write anything.
//
// The asymmetry this module exploits: **every legitimate change goes through
// the application**, and the application fingerprints the row as it writes it.
// So a row whose fingerprint no longer matches, a row with no fingerprint at
// all, or a fingerprint whose row has vanished, each mean the same thing —
// something changed the database without going through the system.

export const RecordFingerprint = sequelize.define(
  "RecordFingerprint",
  {
    // Which table and row this covers, in the same polymorphic shape the
    // attachment store and the audit log already use.
    entityRef: { type: DataTypes.STRING(64), allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },

    // SHA-256 over the row's *material* columns — the ones whose alteration
    // would change what the record means. Deliberately not every column:
    // `updatedAt` moves on every save and would make the fingerprint useless.
    fingerprint: { type: DataTypes.STRING(64), allowNull: false },

    // The audit entry that last changed this row legitimately. Gives a reviewer
    // an immediate answer to "what was the last authorised change, and who made
    // it?" when a mismatch is found.
    lastAuditSequence: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    indexes: [
      { fields: ["entityRef", "entityId"], unique: true },
      { fields: ["entityRef"] },
    ],
  }
);

// ── ALERTS ───────────────────────────────────────────────────────────────────

export const ALERT_TYPES = [
  // Integrity — something changed outside the application.
  "recordModifiedOutsideSystem",
  "recordInsertedOutsideSystem",
  "recordDeletedOutsideSystem",
  "auditChainBroken",

  // Behaviour — something inside the application looks wrong.
  "repeatedLoginFailures",
  "repeatedMfaFailures",
  "privilegeChanged",
  "credentialReset",
  "offHoursAccess",
  "bulkDocumentAccess",
  "duplicateBidDocument",
  "bidIpClustering",
  "amountChangedAfterApproval",
];

export const ALERT_TYPE_LABELS = {
  recordModifiedOutsideSystem: "Record altered outside the system",
  recordInsertedOutsideSystem: "Record inserted outside the system",
  recordDeletedOutsideSystem: "Record deleted outside the system",
  auditChainBroken: "Audit log hash chain broken",
  repeatedLoginFailures: "Repeated failed sign-in attempts",
  repeatedMfaFailures: "Repeated second-factor failures",
  privilegeChanged: "Role or permission changed",
  credentialReset: "Second factor reset by an administrator",
  offHoursAccess: "Access outside working hours",
  bulkDocumentAccess: "Unusual volume of document downloads",
  duplicateBidDocument: "Identical bid documents from different bidders",
  bidIpClustering: "Bids submitted from the same address",
  amountChangedAfterApproval: "Amount changed after approval",
};

export const ALERT_SEVERITIES = ["critical", "high", "medium", "low"];

export const SecurityAlert = sequelize.define(
  "SecurityAlert",
  {
    type: { type: DataTypes.ENUM(...ALERT_TYPES), allowNull: false },
    severity: { type: DataTypes.ENUM(...ALERT_SEVERITIES), allowNull: false, defaultValue: "medium" },

    summary: { type: DataTypes.STRING(500), allowNull: false },
    // Everything a reviewer needs to judge it: the expected and observed
    // fingerprints, the audit entry that should have accompanied the change,
    // the addresses involved.
    detail: { type: DataTypes.JSON, allowNull: true },

    entityRef: { type: DataTypes.STRING(64), allowNull: true },
    entityId: { type: DataTypes.INTEGER, allowNull: true },

    // A stable identity for "this same finding". The sweep runs repeatedly and
    // would otherwise raise the same alert every time it ran, burying the new
    // ones under hundreds of duplicates.
    dedupeKey: { type: DataTypes.STRING(200), allowNull: false },
    occurrences: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false },

    // open         — nobody has looked at it
    // acknowledged — an administrator has seen it and is dealing with it
    // resolved     — dealt with, with a note saying how
    // dismissed    — judged not to be a problem, with a reason
    //
    // Nothing is ever deleted. An alert that turned out to be nothing is still
    // evidence that the detection fired, and the reason it was dismissed is
    // exactly what a later reviewer needs.
    status: {
      type: DataTypes.ENUM("open", "acknowledged", "resolved", "dismissed"),
      allowNull: false,
      defaultValue: "open",
    },
    resolutionNote: { type: DataTypes.TEXT, allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [
      { fields: ["status"] },
      { fields: ["severity"] },
      { fields: ["type"] },
      { fields: ["dedupeKey"], unique: true },
    ],
  }
);

SecurityAlert.belongsTo(User, { as: "resolvedBy", foreignKey: "resolvedById" });

export { sequelize };
