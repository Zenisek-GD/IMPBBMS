import test from "node:test";
import assert from "node:assert/strict";
import { GENESIS_HASH, computeHash, computeAuditArchiveDigest, verifyAuditEntries } from "../services/auditLog.js";

const legacy = {
  id: 1, sequence: 1, actionType: "app.transition", outcome: "success", entityRef: "appEntry", entityId: 10,
  prevHash: GENESIS_HASH, hash: "c".repeat(64), summary: "Approved plan.",
  recordedAt: new Date("2026-01-22T04:00:00Z"), afterState: { status: "approved" },
};
const current = {
  ...legacy, id: 2, sequence: 2, prevHash: legacy.hash, summary: "Plan has been posted.",
  recordedAt: new Date("2026-11-16T04:00:00Z"), afterState: { status: "locked" },
};
current.hash = computeHash(current, current.prevHash);
const archive = {
  throughSequence: 1, entriesChecked: 1, originalHashMismatches: 1,
  headHash: legacy.hash, snapshotDigest: computeAuditArchiveDigest([legacy]),
};

test("the known older history matches its external archive while the current entry verifies normally", () => {
  const result = verifyAuditEntries([legacy, current], archive);
  assert.equal(result.intact, true);
  assert.equal(result.currentEntriesChecked, 1);
  assert.equal(result.archivedHistory.originalHashMismatches, 1);
});

test("an altered archived row fails even if its stored hash was left alone", () => {
  const changed = { ...legacy, afterState: { status: "draft" } };
  const result = verifyAuditEntries([changed, current], archive);
  assert.equal(result.intact, false);
  assert.ok(result.problems.some((issue) => issue.type === "archiveMismatch"));
});

test("an altered current row and disconnected boundary both fail", () => {
  const changed = { ...current, prevHash: GENESIS_HASH };
  const result = verifyAuditEntries([legacy, changed], archive);
  assert.equal(result.intact, false);
  assert.deepEqual(result.problems.map(({ type }) => type), ["brokenLink", "contentAltered"]);
});

test("the checkpoint does not excuse unverifiable hashes on an unrelated chain", () => {
  const result = verifyAuditEntries([{ ...legacy, hash: "d".repeat(64) }], archive);
  assert.equal(result.intact, false);
  assert.equal(result.archivedHistory, undefined);
  assert.equal(result.problems[0].type, "contentAltered");
});
