import "../config/env.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Op } from "sequelize";
import { AppEntry, Award, Bid, PrHeader, Rfq, sequelize } from "../models/index.js";
import { RecordFingerprint } from "../models/integrityModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { FY2025_AWARD_KEYS, isFy2025HistoricalAward } from "../services/historicalAwards.js";
import { fingerprintOf } from "../services/integrityMonitor.js";

const [filename, mode] = process.argv.slice(2);
assert.ok(filename && [undefined, "--apply"].includes(mode), "Pass the original FY 2025 form path and optionally --apply.");
assert.equal(sequelize.config.host, "127.0.0.1");
assert.equal(sequelize.config.database, "municipal_backend");

try {
  const digest = createHash("sha256").update(await readFile(filename)).digest("hex");
  const results = await withAuditTransaction(async (transaction, audit) => {
    const lock = { transaction, lock: transaction.LOCK.UPDATE };
    const projects = await AppEntry.findAll({
      where: { fiscalYear: 2025, recoveryKey: { [Op.in]: FY2025_AWARD_KEYS } },
      order: [["id", "ASC"]], ...lock,
    });
    assert.equal(projects.length, FY2025_AWARD_KEYS.length);
    const results = [];
    for (const app of projects) {
      assert.ok(isFy2025HistoricalAward(app));
      const provenance = app.recoveryImport;
      assert.equal(provenance.sourceDigest.toLowerCase(), digest);
      const source = Object.fromEntries(provenance.sourceFields.map(({ label, value }) => [label, value]));
      assert.equal(app.papCode, source["PAP Code"]);
      assert.equal(app.projectTitle, source["Project Title"]);
      assert.equal(provenance.sourceStatus, "Completed / Awarded");
      const award = await Award.findByPk(provenance.historicalAward.id, lock);
      const rfq = await Rfq.findByPk(award.rfqId, lock);
      const pr = await PrHeader.findByPk(rfq.prHeaderId, lock);
      assert.equal(rfq.appEntryId, app.id);
      assert.equal(pr.appEntryId, app.id);
      assert.equal(pr.departmentId, app.implementingUnitId);
      assert.equal(pr.procurementModeId, rfq.procurementModeId);
      assert.equal(award.noaNumber, source["Existing Notice of Award Number"]);
      assert.equal(award.vendorId, null);
      assert.equal(award.approvedById, null);
      if (provenance.supplierMismatch) assert.equal(award.bidId, null);
      else assert.equal((await Bid.findByPk(award.bidId, lock)).rfqId, rfq.id);

      const changes = [];
      const repair = async (row, entityRef, values, reason) => {
        const afterState = Object.fromEntries(Object.entries(values).filter(([key, value]) => row[key] !== value));
        if (!Object.keys(afterState).length) return;
        const beforeState = Object.fromEntries(Object.keys(afterState).map((key) => [key, row[key]]));
        changes.push({ entityRef, id: row.id, beforeState, afterState });
        if (mode !== "--apply") return;
        const fingerprint = entityRef === "award" ? await RecordFingerprint.findOne({ where: { entityRef, entityId: row.id }, ...lock }) : null;
        if (entityRef === "award") assert.equal(fingerprint?.fingerprint, fingerprintOf(entityRef, row));
        const priorUpdate = row.updatedAt;
        await row.update(afterState, { transaction });
        const event = await audit({
          actionType: "data.recovery.reconciled", entityRef, entityId: row.id,
          actorName: "Local procurement records reconciliation", actorRole: "system",
          summary: reason, beforeState: { ...beforeState, updatedAt: priorUpdate },
          afterState: { ...afterState, updatedAt: row.updatedAt, source: provenance.source, sourceDigest: digest, appEntryId: app.id },
        });
        if (fingerprint) await fingerprint.update({ fingerprint: fingerprintOf(entityRef, row), lastAuditSequence: event.sequence }, { transaction });
      };
      const category = source["Goods, Infrastructure, or Consulting"].toLowerCase();
      assert.ok(["goods", "infrastructure"].includes(category));
      assert.equal(rfq.category, category);
      await repair(app, "appEntry", { category }, "Normalized the procurement category recorded in the FY 2025 client form.");
      if (/^Yes\s+[–-]/.test(source["Pre-Bid Conference"])) {
        assert.ok(rfq.prebidAt);
        await repair(rfq, "rfq", { prebidRequired: true }, "Reconciled the pre-bid flag with the affirmative response and schedule in the FY 2025 client form.");
      }
      assert.ok(["issued", "accepted"].includes(award.status));
      await repair(award, "award", { status: "issued" }, "Recorded the notice as issued. The FY 2025 client form documents supplier receipt and supplies no separate acceptance record.");
      results.push({ projectCode: app.papCode, changes });
    }
    return results;
  });
  console.log(JSON.stringify({ applied: mode === "--apply", results }, null, 2));
} finally {
  await sequelize.close();
}
