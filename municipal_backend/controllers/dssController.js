import { Op, fn, col, literal } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { Department } from "../models/departmentModel.js";
import { Rfq, Bid, Award } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { LIVE_PR_STATUSES } from "../services/prWorkflow.js";

// Design doc Section 7.8: read-only analytics for HOPE, Budget Officer and
// Internal Auditor — under/over-allocated department flags, historical spending
// patterns, and forward-looking allocation recommendations.
//
// Everything here is derived from live records. Where a figure would be
// misleading on thin data, the response says so rather than presenting noise
// as insight.

const MIN_SAMPLE_FOR_TRENDS = 3;

const averageDays = (pairs) => {
  const spans = pairs
    .filter(([from, to]) => from && to)
    .map(([from, to]) => (new Date(to) - new Date(from)) / 86400000)
    .filter((days) => Number.isFinite(days) && days >= 0);

  if (spans.length === 0) return null;
  return Number((spans.reduce((sum, d) => sum + d, 0) / spans.length).toFixed(1));
};

export const getDssOverview = async (req, res) => {
  const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();

  const [entries, prs, rfqs, awards, contracts, payments] = await Promise.all([
    AppEntry.findAll({
      where: { fiscalYear, status: { [Op.in]: ["approved", "locked"] } },
      include: [{ model: Department, as: "implementingUnit" }],
    }),
    PrHeader.findAll({ include: [{ model: PrLineItem, as: "lineItems" }] }),
    Rfq.findAll(),
    Award.findAll({ include: [{ model: Vendor, as: "vendor" }] }),
    Contract.findAll({ include: [{ model: Delivery, as: "deliveries" }] }),
    Payment.findAll({ where: { status: "released" }, include: [{ model: Invoice, as: "invoice" }] }),
  ]);

  // ── Headline figures ──────────────────────────────────────────────────────
  const totalAllocated = entries.reduce((sum, e) => sum + Number(e.abc), 0);
  const totalDisbursed = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // ── Most procured items by value (Section 7.8 "historical spending") ──────
  const itemTotals = new Map();
  for (const pr of prs) {
    for (const line of pr.lineItems ?? []) {
      // Group loosely by the first words of the description — good enough to
      // surface patterns without a category taxonomy, which the doc does not
      // define. Replace with a real category once one exists.
      const key = line.description.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
      itemTotals.set(key, (itemTotals.get(key) ?? 0) + Number(line.lineTotal));
    }
  }
  const topItems = [...itemTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  // ── Cycle times ───────────────────────────────────────────────────────────
  const prCycleDays = averageDays(prs.map((pr) => [pr.createdAt, pr.submittedAt]));
  const procurementCycleDays = averageDays(
    contracts.map((contract) => [contract.createdAt, contract.signedByVendorAt])
  );
  const deliveryCycleDays = averageDays(
    contracts.flatMap((contract) =>
      (contract.deliveries ?? []).map((delivery) => [delivery.deliveredAt, delivery.inspectedAt])
    )
  );

  // ── Department allocation flags (Section 7.8) ─────────────────────────────
  const byDepartment = new Map();
  for (const entry of entries) {
    const key = entry.implementingUnitId ?? 0;
    if (!byDepartment.has(key)) {
      byDepartment.set(key, {
        departmentId: key,
        code: entry.implementingUnit?.code ?? "—",
        name: entry.implementingUnit?.name ?? "Unassigned",
        allocated: 0,
        committed: 0,
      });
    }
    byDepartment.get(key).allocated += Number(entry.abc);
  }
  for (const pr of prs) {
    // Every requisition that still holds a claim on the department's budget.
    // Taken from the state machine so a new stage cannot silently drop out of
    // the utilisation figures the way it once dropped out of the balance check.
    if (!LIVE_PR_STATUSES.includes(pr.status)) continue;
    const bucket = byDepartment.get(pr.departmentId);
    if (bucket) bucket.committed += Number(pr.totalAmount);
  }

  const departmentFlags = [...byDepartment.values()].map((row) => {
    const ratio = row.allocated > 0 ? row.committed / row.allocated : 0;
    return {
      ...row,
      utilisationRatio: Number(ratio.toFixed(4)),
      // Under-allocated: barely using the appropriation. Over-committed: at or
      // beyond it. Both are worth an executive's attention for opposite reasons.
      flag: ratio >= 0.95 ? "overCommitted" : ratio <= 0.25 ? "underUtilised" : "onTrack",
    };
  });

  // ── Supplier performance ──────────────────────────────────────────────────
  const supplierStats = new Map();
  for (const award of awards) {
    const name = award.vendor?.businessName;
    if (!name) continue;
    if (!supplierStats.has(name)) supplierStats.set(name, { name, awards: 0, value: 0 });
    const bucket = supplierStats.get(name);
    bucket.awards += 1;
    bucket.value += Number(award.amount);
  }
  const suppliers = [...supplierStats.values()].sort((a, b) => b.value - a.value).slice(0, 5);

  // ── Competition health — an anti-favoritism signal (Section 7.9) ──────────
  const bidCounts = await Bid.findAll({
    attributes: ["rfqId", [fn("COUNT", col("id")), "bids"]],
    group: ["rfqId"],
    raw: true,
  });
  const averageBidders =
    bidCounts.length > 0
      ? Number((bidCounts.reduce((sum, r) => sum + Number(r.bids), 0) / bidCounts.length).toFixed(2))
      : null;
  const singleBidderCount = bidCounts.filter((r) => Number(r.bids) === 1).length;

  res.json({
    fiscalYear,
    sampleSize: { appEntries: entries.length, requisitions: prs.length, procurements: rfqs.length },
    // Be explicit when there is too little history for the trends to mean much.
    thin: prs.length < MIN_SAMPLE_FOR_TRENDS,
    headline: {
      totalAllocated,
      totalDisbursed,
      utilisationRatio: totalAllocated > 0 ? Number((totalDisbursed / totalAllocated).toFixed(4)) : 0,
      activeProcurements: rfqs.filter((r) =>
        ["published", "closed", "opened", "evaluated"].includes(r.status)
      ).length,
      awardsIssued: awards.filter((a) => a.status === "issued").length,
    },
    cycleTimes: {
      requisitionPreparationDays: prCycleDays,
      procurementToContractDays: procurementCycleDays,
      deliveryInspectionDays: deliveryCycleDays,
    },
    topItems,
    departmentFlags: departmentFlags.sort((a, b) => a.utilisationRatio - b.utilisationRatio),
    suppliers,
    competition: {
      averageBiddersPerProcurement: averageBidders,
      singleBidderProcurements: singleBidderCount,
      // A run of single-bidder procurements is the classic favouritism smell,
      // so it is surfaced rather than buried.
      note:
        singleBidderCount > 0
          ? "Procurements attracting a single bidder warrant review for restrictive specifications."
          : null,
    },
  });
};
