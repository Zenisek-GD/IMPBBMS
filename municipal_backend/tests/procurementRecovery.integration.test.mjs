import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

// Synthetic form values in a uniquely named disposable schema. Never run the
// client form or mutate the application database from automated tests.
test("scoped recovery preserves provenance, relationships, boundaries and idempotency", {
  skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000,
}, async (t) => {
  const scratch = `impbbms_recovery_test_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  assert.match(scratch, /^impbbms_recovery_test_[a-f0-9]{16}$/);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test" });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  const m = await import("../models/index.js");
  t.after(async () => { await m.sequelize.close(); assert.match(scratch, /^impbbms_recovery_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  await m.sequelize.sync();
  const service = await import("../services/procurementRecovery.js");
  const { migrateProcurementRecovery } = await import("../services/migrateProcurementRecovery.js");
  const { captureRecoveryBaseline, verifyRecoveryBaseline } = await import("../services/procurementRecoveryVerification.js");
  const { verifyChain } = await import("../services/auditLog.js");
  const appApi = await import("../controllers/appEntryController.js"), prApi = await import("../controllers/prController.js");
  const values = [
    "2026", "Synthetic recovery project", "Synthetic source description", "Goods – test equipment", "Goods",
    "Synthetic service office (QA)", "Synthetic development goal", "Synthetic expected output", "Synthetic named AIP project",
    "Synthetic earmarked fund", "Capital Outlay / MOOE", "PHP 2,000.00", "Lot", "2", "Public Bidding",
    "Not applicable – regular public bidding procedure.", "Q1 2026", "Q2 2026", "QA-2026-IMPORT", "Synthetic MFO / account description",
    "Synthetic ordinance reference", "Synthetic requisition purpose", "June 15, 2026", "No", "Not applicable", "Synthetic service office", "Synthetic service officer",
    "Emergency response equipment and supplies",
  ];
  const manifest = { version: 1, source: { filename: "synthetic-form.docx", sha256: "a".repeat(64) }, checkpoint: service.RECOVERY_CHECKPOINT, fields: service.RECOVERY_LABELS.map((label, index) => ({ label, value: values[index], sourceParagraph: index * 2 + 3 })) };
  const sentinel = await m.Department.create({ name: "Unrelated existing office", code: "SENTINEL" });
  const call = async (handler, params = {}, body = {}, query = {}) => {
    let output, status = 200;
    await handler({ params, body, query, currentUser: { id: 999, departmentId: sentinel.id }, permissions: new Set(["app.view", "app.create", "app.submit", "app.consolidate", "pr.view", "pr.create", "pr.approve", "audit.viewAll"]), ip: "127.0.0.1" }, { status(code) { status = code; return this; }, json(value) { output = value; return this; } });
    if (status >= 400) throw new Error(output?.message);
    return output;
  };
  await t.test("manifest rejects fields beyond the checkpoint, malformed dates and changed field order", async () => {
    assert.equal(service.validateRecoveryManifest(manifest).abc, "2000.00");
    const extra = structuredClone(manifest); extra.fields.push({ label: "Technical Specifications", value: "Forbidden later data" });
    assert.throws(() => service.validateRecoveryManifest(extra), /exactly the authorized/);
    const changed = structuredClone(manifest); [changed.fields[1], changed.fields[2]] = [changed.fields[2], changed.fields[1]];
    assert.throws(() => service.validateRecoveryManifest(changed), /original order/);
    const invalid = structuredClone(manifest); invalid.fields[22].value = "June 31, 2026";
    assert.throws(() => service.validateRecoveryManifest(invalid), /date required is invalid/);
  });
  await t.test("targeted migration preserves existing values and can run twice", async () => {
    const qi = m.sequelize.getQueryInterface();
    await qi.removeColumn("appentries", "recoveryImport");
    const first = await migrateProcurementRecovery();
    assert.deepEqual(first.added, ["appentries.recoveryImport"]);
    assert.deepEqual(await migrateProcurementRecovery(), { added: [], changed: [] });
    assert.equal((await sentinel.reload()).name, "Unrelated existing office");
  });
  let restored, baseline;
  await t.test("restores linked drafts without manufacturing approvals, costs or historical timestamps", async () => {
    baseline = await captureRecoveryBaseline();
    const start = Date.now();
    restored = await service.restoreProcurement(manifest, { reconstructProgression: true });
    const app = await m.AppEntry.findByPk(restored.appEntryId), pr = await m.PrHeader.findByPk(restored.prHeaderId), item = await m.PrLineItem.findByPk(restored.lineItemId);
    assert.equal(restored.status, "restored"); assert.equal(pr.appEntryId, app.id); assert.equal(pr.departmentId, app.implementingUnitId); assert.equal(item.prHeaderId, pr.id);
    assert.equal(app.abc, "2000.00"); assert.equal(app.quantity, 2); assert.equal(app.unit, "Lot");
    assert.equal(pr.dateRequired, "2026-06-15"); assert.equal(pr.isEmergency, false); assert.equal(pr.justificationStatus, "notApplicable");
    assert.equal(app.status, "draft"); assert.equal(pr.status, "draft"); assert.equal(app.appropriationId, null); assert.equal(app.aipEntryId, null); assert.equal(pr.requesterId, null);
    assert.equal(app.earlyProcurement, null);
    for (const key of ["unit", "quantity", "unitCost", "lineTotal", "technicalSpecifications", "hasUsefulLifeOverOneYear", "assetClass"]) assert.equal(item[key], null);
    assert.equal(pr.totalAmount, null); assert.equal(pr.submittedAt, null); assert.equal(pr.modeDeterminedAt, null);
    assert.ok(app.createdAt.getTime() >= start - 1000); assert.ok(pr.createdAt.getTime() >= start - 1000);
    assert.equal(app.recoveryImport.historicalActivity.originalCreatedAt, null);
    assert.equal(app.recoveryImport.reconstructedProgression.length, 15);
    const progression = app.recoveryImport.reconstructedProgression;
    assert.equal(progression[0].activityDate, "2026-09-25"); assert.equal(progression.at(-1).activityDate, "2026-10-09");
    assert.deepEqual(progression.flatMap((event) => event.sourceFields.map((field) => field.label)), service.RECOVERY_LABELS);
    assert.ok(progression.every((event) => event.dateVerification === "reconstructed" && event.actorId === null));
    const auditRows = await m.AuditLog.findAll();
    assert.ok(auditRows.every((event) => event.actorId === null && event.actionType.startsWith("data.recovery.") && event.recordedAt.getTime() >= start - 1000));
    assert.equal((await verifyChain()).intact, true);
    assert.equal(await m.RecordFingerprint.count(), 2);
    const preservation = await verifyRecoveryBaseline(baseline);
    assert.equal(preservation.existingRowsPreserved, true);
    assert.deepEqual(Object.keys(preservation.rowCountChanges).sort(), ["appentries", "auditlogs", "departments", "prheaders", "prlineitems", "recordfingerprints"].sort());
  });
  await t.test("rerunning does not add records, alter timestamps or duplicate reconstructed events", async () => {
    const before = await captureRecoveryBaseline();
    const repeated = await service.restoreProcurement(manifest, { reconstructProgression: true });
    assert.equal(repeated.status, "alreadyImported"); assert.equal(repeated.importedAt, restored.importedAt);
    assert.deepEqual(await verifyRecoveryBaseline(before), { existingRowsPreserved: true, alteredTables: [], rowCountChanges: {} });
  });
  await t.test("source changes and pre-existing duplicates cannot overwrite recovered records", async () => {
    const before = await captureRecoveryBaseline(), changed = structuredClone(manifest); changed.fields[2].value = "Changed description";
    await assert.rejects(service.restoreProcurement(changed), /No overwrite/);
    assert.deepEqual(await verifyRecoveryBaseline(before), { existingRowsPreserved: true, alteredTables: [], rowCountChanges: {} });
    const other = structuredClone(manifest); other.fields[1].value = "Unverified existing project"; other.fields[18].value = "QA-2026-EXISTING";
    await m.AppEntry.create({ projectTitle: other.fields[1].value, papCode: other.fields[18].value, abc: 50, fiscalYear: 2026, targetStartQuarter: "Q1", targetCompletionQuarter: "Q2" });
    await assert.rejects(service.restoreProcurement(other), /No overwrite/);
  });
  await t.test("existing modules expose exact source responses, genuine NULLs and recovery state", async () => {
    const apps = await call(appApi.listAppEntries, {}, {}, { fiscalYear: "2026" });
    const app = apps.find((row) => row.id === restored.appEntryId);
    assert.equal(app.expectedOutput, values[7]); assert.equal(app.editable, false); assert.equal(app.recoveryImport.sourceFields.length, 28);
    const prs = await call(prApi.listPrs, {}, {}, { fiscalYear: "2026" });
    const pr = prs.find((row) => row.id === restored.prHeaderId);
    assert.equal(pr.requesterName, values[26]); assert.equal(pr.departmentName, values[25]); assert.equal(pr.totalAmount, null); assert.equal(pr.lineItems[0].unitCost, null);
    assert.equal(pr.lineItems[0].quantity, null); assert.equal(pr.lineItems[0].assetClass, null); assert.equal(pr.editable, false);
    await assert.rejects(call(appApi.transitionAppEntry, { id: app.id }, { action: "submit" }), /held at Item Description/);
    await assert.rejects(call(prApi.transitionPr, { id: pr.id }, { action: "submit" }), /held at Item Description/);
    await assert.rejects(call(prApi.createPr, {}, { appEntryId: app.id, dateRequired: "2026-12-31", lineItems: [{ description: "New item", quantity: 1, unitCost: 1 }] }), /held at Item Description/);
    await assert.rejects(m.PrHeader.create({ prNumber: "PR-QA-INVALID", dateRequired: "2026-12-31", totalAmount: null }), /only on a held/);
    await assert.rejects(m.PrLineItem.create({ description: "Incomplete ordinary item", quantity: null, unitCost: null, lineTotal: null }), /only on a held/);
    assert.equal((await verifyChain()).intact, true);
  });
});
