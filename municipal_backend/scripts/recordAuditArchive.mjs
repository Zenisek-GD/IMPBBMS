import "../config/env.js";
import assert from "node:assert/strict";
import { sequelize, AuditLog, SecurityAlert } from "../models/index.js";
import { legacyAuditArchive } from "../services/legacyAuditArchive.js";
import { verifyChain, withAuditTransaction } from "../services/auditLog.js";

const [target, operation] = process.argv.slice(2);
assert.ok(target && operation === "--apply", "Usage: node scripts/recordAuditArchive.mjs <database> --apply");
assert.equal(sequelize.config.database, target, "The requested database does not match the configured connection.");
assert.ok(["127.0.0.1", "localhost"].includes(sequelize.config.host), "Run this recorder on the database host.");

try {
  const verification = await verifyChain();
  assert.ok(verification.intact && verification.archivedHistory, "The saved archive and the current chain must verify before the historical alert is closed.");
  const result = await withAuditTransaction(async (transaction, audit) => {
    const actionType = "audit.archive.checkpointRecorded";
    const existing = await AuditLog.findOne({ where: { actionType }, transaction });
    if (!existing) {
      await audit({ actionType, actorRole: "system", entityRef: "audit",
        summary: "Older audit entries matched the saved archive. Original entries and hashes retained.",
        afterState: {
          ...verification.archivedHistory,
          archiveDigest: legacyAuditArchive.snapshotDigest,
          archiveTip: legacyAuditArchive.headHash,
          newerEntriesVerified: verification.currentEntriesChecked,
        },
      });
    }
    const alert = await SecurityAlert.findOne({
      where: { type: "auditChainBroken", dedupeKey: "auditChain:1" },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    const note = "The saved archive matches the older audit entries. Their original hashes and the original finding are retained for review.";
    if (!alert || alert.resolutionNote === note) return { recorded: !existing, resolvedAlert: null };
    const beforeState = { status: alert.status, summary: alert.summary, resolutionNote: alert.resolutionNote };
    await alert.update({
      status: "resolved", summary: "Older audit entries matched the saved archive",
      resolvedAt: new Date(), resolvedById: null, resolutionNote: note,
    }, { transaction });
    await audit({
      actionType: "security.alert.updated", entityRef: "securityAlert", entityId: alert.id, actorRole: "system",
      summary: "Closed the historical audit warning after verifying the saved archive.",
      beforeState, afterState: { status: alert.status, resolutionNote: note },
    });
    return { recorded: !existing, resolvedAlert: alert.id };
  });
  console.log(JSON.stringify(result));
} finally {
  await sequelize.close();
}
