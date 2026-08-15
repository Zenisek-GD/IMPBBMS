// Regression test: a record CREATED through the application must not look like
// tampering on the next sweep.
//
// The bulk-hook test next door covers writes that bypassed the per-row hooks.
// This covers the opposite case — the hook fired correctly, and the fingerprint
// was still wrong.
//
// MySQL returns DECIMAL as a string. `Bid.create({ totalBidPrice: 1950000 })`
// leaves the JS number 1950000 on the instance the `afterCreate` hook sees, but
// the sweep re-reads the row and gets "1950000.00". Hashing those raw produced
// two different fingerprints for one unchanged row, so every bid, award,
// contract, payment, appropriation, obligation and requisition raised one
// bogus "altered outside the system" alert the first time it was swept — on
// exactly the money records the monitor exists to protect.
//
// Note this test deliberately does NOT call rebaseline() before creating the
// row. Rebaselining reads every value back from the database, which puts the
// fingerprint in DB form and hides the very mismatch under test.
//
//   DB_NAME=<throwaway> node services/integrityMonitor.decimal.test.mjs
//
// Run it against a scratch database — it writes a bid.

import "../config/env.js";
import { sequelize } from "../models/index.js";
import { Bid } from "../models/biddingModel.js";
import { attachIntegrityHooks, rebaseline, sweep } from "./integrityMonitor.js";

const line = (s = "") => console.log(s);

await attachIntegrityHooks();
await rebaseline();

const baseline = await sweep();
line(`baseline: ${baseline.length} finding(s)`);
if (baseline.length !== 0) {
  line("✖ the scratch database is not clean to begin with — cannot draw a conclusion");
  process.exit(1);
}
line();

const [[rfq]] = await sequelize.query("SELECT id FROM Rfqs LIMIT 1");
const [[vendor]] = await sequelize.query("SELECT id FROM Vendors LIMIT 1");

// The shape submitBid writes: the controller coerces the price with Number(),
// so what reaches the hook is a JS number, not a string.
const bid = await Bid.create({
  rfqId: rfq.id,
  vendorId: vendor.id,
  technicalSubmitted: true,
  financialSealed: true,
  totalBidPrice: 1950000,
  submittedAt: new Date(),
  status: "submitted",
});

line(`created bid #${bid.id} through the application (totalBidPrice as a JS number)`);
line(`  value on the instance the hook saw: ${JSON.stringify(bid.totalBidPrice)} (${typeof bid.totalBidPrice})`);

const reloaded = await Bid.findByPk(bid.id);
line(`  value the sweep reads back:         ${JSON.stringify(reloaded.totalBidPrice)} (${typeof reloaded.totalBidPrice})`);
line();

const findings = await sweep();
line(`sweep after a legitimate creation: ${findings.length} finding(s)`);
for (const f of findings) line(`   ${f.type}: ${f.summary}`);

const clean = findings.length === 0;

// Leave the scratch database as we found it.
await Bid.destroy({ where: { id: bid.id } });

line();
line("─".repeat(66));
line(`${clean ? "✅" : "❌"} creating a record through the app raises no false alarm`);
line("─".repeat(66));

await sequelize.close();
process.exit(clean ? 0 : 1);
