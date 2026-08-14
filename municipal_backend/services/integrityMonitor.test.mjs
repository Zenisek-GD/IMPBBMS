// Regression test: a legitimate BULK write through the application must not
// look like tampering.
//
// `Model.update(values, { where })` and `Model.destroy({ where })` fire only
// Sequelize's *bulk* hooks. The per-row hooks that keep fingerprints current
// never run, so the rows change and their fingerprints do not — and the next
// sweep reports the LGU's own work as an unauthorised database change.
//
// This is not hypothetical. Approving an award runs
// `Bid.update({ status: "lost" }, { where: { rfqId, ... } })`, so before the
// beforeBulkUpdate hook every losing bid was flagged after every award. False
// alarms on the core workflow are how a monitor gets ignored, which costs more
// than never having built it.
//
//   node services/integrityMonitor.test.mjs
//
// Exits non-zero if either case regresses.

import "../config/env.js";
import { sequelize } from "../models/index.js";
import { Bid } from "../models/biddingModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { attachIntegrityHooks, rebaseline, sweep } from "./integrityMonitor.js";

const line = (s = "") => console.log(s);

await attachIntegrityHooks();
await rebaseline();
line(`baseline clean: ${(await sweep()).length} finding(s)`);
line();

// ── 1. The exact call the award approval makes ──────────────────────────────
const [[anyBid]] = await sequelize.query("SELECT rfqId FROM bids GROUP BY rfqId HAVING COUNT(*) > 1 LIMIT 1");
const before = await Bid.findAll({ where: { rfqId: anyBid.rfqId } });
const originals = before.map((b) => ({ id: b.id, status: b.status }));

line(`Bid.update({status:'lost'}, {where:{rfqId:${anyBid.rfqId}}})  — ${before.length} rows, bulk`);
await Bid.update({ status: "lost" }, { where: { rfqId: anyBid.rfqId } });

let findings = await sweep();
line(`  → sweep findings: ${findings.length}`);
for (const f of findings) line(`     ${f.type}: ${f.summary}`);
const bulkUpdateClean = findings.length === 0;

// Put the statuses back (individually, so this restore is itself legitimate).
for (const o of originals) await Bid.update({ status: o.status }, { where: { id: o.id } });
await sweep();
line();

// ── 2. A bulk destroy ───────────────────────────────────────────────────────
const probe = await AppEntry.create({
  referenceNo: `PROBE-${Date.now()}`,
  projectTitle: "Bulk-hook regression probe",
  abc: 1000,
  status: "draft",
  fiscalYear: 2026,
  targetStartQuarter: "Q1",
  targetCompletionQuarter: "Q2",
});
line(`created probe appEntry #${probe.id}, then AppEntry.destroy({where:{id}}) — bulk`);
await AppEntry.destroy({ where: { id: probe.id } });

findings = await sweep();
line(`  → sweep findings: ${findings.length}`);
for (const f of findings) line(`     ${f.type}: ${f.summary}`);
const bulkDestroyClean = findings.length === 0;

line();
line("─".repeat(66));
line(`${bulkUpdateClean ? "✅" : "❌"} bulk update through the app raises no false alarm`);
line(`${bulkDestroyClean ? "✅" : "❌"} bulk destroy through the app raises no false alarm`);
line("─".repeat(66));

await rebaseline();
line(`final sweep: ${(await sweep()).length} finding(s)`);
process.exit(bulkUpdateClean && bulkDestroyClean ? 0 : 1);
