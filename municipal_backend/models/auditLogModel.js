import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// Design doc Section 7.9 / Section 8: a tamper-evident, hash-chained,
// append-only event trail. This is what the doc relies on *instead of* a
// blockchain, so its integrity properties are the whole point:
//
//   hash = SHA256(prevHash + canonical(entry fields))
//
// Changing any recorded field changes that row's hash, which no longer matches
// what the next row recorded as its prevHash — so any edit breaks the chain at
// a detectable point. See services/auditLog.js for write and verify.
export const AuditLog = sequelize.define(
  "AuditLog",
  {
    actionType: { type: DataTypes.STRING, allowNull: false },

    // What was acted upon (Section 9: entity_ref / ref_id).
    entityRef: { type: DataTypes.STRING, allowNull: true },
    entityId: { type: DataTypes.INTEGER, allowNull: true },

    // Section 9 records before/after state. Stored as JSON so a reviewer can
    // see exactly what changed, including denied and returned actions.
    beforeState: { type: DataTypes.JSON, allowNull: true },
    afterState: { type: DataTypes.JSON, allowNull: true },

    // Section 2.2: Internal Auditors must be able to inspect denied/returned
    // actions, so failures are recorded too — not just successes.
    outcome: {
      type: DataTypes.ENUM("success", "denied", "failed"),
      allowNull: false,
      defaultValue: "success",
    },
    summary: { type: DataTypes.STRING, allowNull: true },

    // Security-relevant context (Section 12).
    ipAddress: { type: DataTypes.STRING, allowNull: true },
    actorName: { type: DataTypes.STRING, allowNull: true },
    actorRole: { type: DataTypes.STRING, allowNull: true },

    recordedAt: { type: DataTypes.DATE, allowNull: false },

    // Chain links. `sequence` makes ordering explicit rather than relying on
    // insertion order or timestamps, which can collide.
    sequence: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    prevHash: { type: DataTypes.STRING(64), allowNull: false },
    hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  },
  {
    // Append-only: no updatedAt, because a row must never be updated.
    timestamps: false,
    indexes: [{ fields: ["entityRef", "entityId"] }, { fields: ["actionType"] }],
  }
);

// ON DELETE RESTRICT, not the Sequelize default of SET NULL.
//
// `actorId` is one of the fields covered by the row's hash, so nulling it rewrites
// the entry's content and breaks the chain at that point — silently, from the
// application's perspective, because the deletion looks like an ordinary success.
// A default SET NULL therefore makes the integrity of the whole audit trail
// contingent on nobody ever deleting a user account, which is not a property that
// should rest on nobody getting round to writing that endpoint.
//
// RESTRICT makes the database refuse instead: an account that has acted in this
// system cannot be erased, only deactivated (see userController.updateUser, which
// is the only supported way to retire an account). That is the correct behaviour
// for an accountability record regardless of the hash — "who did this" must not
// become unanswerable because someone tidied up the users table.
//
// The log stays fully readable either way: actorName and actorRole are stored
// denormalised on every entry, so nothing depends on the join surviving.
AuditLog.belongsTo(User, { as: "actor", foreignKey: "actorId", onDelete: "RESTRICT" });

// Belt and braces against accidental mutation from application code. This does
// not stop someone with direct database access — nothing can — but that is
// exactly the case the hash chain is designed to *detect*.
AuditLog.beforeUpdate(() => {
  throw new Error("Audit log entries are append-only and cannot be modified.");
});
AuditLog.beforeDestroy(() => {
  throw new Error("Audit log entries are append-only and cannot be deleted.");
});

export { sequelize };
