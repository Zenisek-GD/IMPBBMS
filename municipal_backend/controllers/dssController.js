import { Op, fn, col } from "sequelize";
import { Appropriation } from "../models/appropriationModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { Department } from "../models/departmentModel.js";
import { Rfq, Bid, Award } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { buildLedger } from "../services/budgetLedger.js";
import { fiscalYearFilter, sumMoney } from "../services/financialCalculations.js";

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
  const fiscalYear = fiscalYearFilter(req.query.fiscalYear);
  const [entries, ledger] = await Promise.all([
    AppEntry.findAll({ where: { ...(fiscalYear === null ? {} : { [Op.or]: [{ "$appropriation.fiscalYear$": fiscalYear }, { appropriationId: null, fiscalYear }] }), status: { [Op.in]: ["approved", "locked"] } }, include: [{ model: Department, as: "implementingUnit" }, { model: Appropriation, as: "appropriation", attributes: ["fiscalYear"] }] }),
    buildLedger({ fiscalYear: fiscalYear ?? "all" }),
  ]);
  const prs = entries.length ? await PrHeader.findAll({ where: { appEntryId: { [Op.in]: entries.map((row) => row.id) } }, include: [{ model: PrLineItem, as: "lineItems" }] }) : [];
  const rfqs = prs.length ? await Rfq.findAll({ where: { prHeaderId: { [Op.in]: prs.map((row) => row.id) } } }) : [];
  const awards = rfqs.length ? await Award.findAll({ where: { rfqId: { [Op.in]: rfqs.map((row) => row.id) } }, include: [{ model: Vendor, as: "vendor" }] }) : [];
  const contracts = awards.length ? await Contract.findAll({ where: { awardId: { [Op.in]: awards.map((row) => row.id) } }, include: [{ model: Delivery, as: "deliveries" }] }) : [];
  const totalAllocated = ledger.totals.allocated;
  const totalDisbursed = ledger.totals.grossExpenses;

  // ── Most procured items by value (Section 7.8 "historical spending") ──────
  const itemTotals = new Map();
  for (const pr of prs) {
    for (const line of pr.lineItems ?? []) {
      // Group loosely by the first words of the description — good enough to
      // surface patterns without a category taxonomy, which the doc does not
      // define. Replace with a real category once one exists.
      const key = line.description.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
      itemTotals.set(key, sumMoney([itemTotals.get(key), line.lineTotal], (value) => value));
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
  const byDepartment = new Map(ledger.offices.map((office) => [office.departmentId, {
    departmentId: office.departmentId, code: office.departmentCode, name: office.departmentName,
    appropriated: office.appropriated, planned: office.programmed, allocated: office.allocated, committed: office.obligated,
    grossExpenses: office.grossExpenses, supplierPaid: office.supplierPaid,
  }]));

  const departmentFlags = [...byDepartment.values()].map((row) => {
    const ratio = row.appropriated > 0 ? row.committed / row.appropriated : 0;
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
    bucket.value = sumMoney([bucket.value, award.amount], (value) => value);
  }
  const suppliers = [...supplierStats.values()].sort((a, b) => b.value - a.value).slice(0, 5);

  // ── Competition health — an anti-favoritism signal (Section 7.9) ──────────
  const bidCounts = await Bid.findAll({
    where: { rfqId: { [Op.in]: rfqs.map((row) => row.id) } },
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
    fiscalYear: fiscalYear ?? "all",
    sampleSize: { appEntries: entries.length, requisitions: prs.length, procurements: rfqs.length },
    // Be explicit when there is too little history for the trends to mean much.
    thin: prs.length < MIN_SAMPLE_FOR_TRENDS,
    headline: {
      totalAppropriated: ledger.totals.appropriated,
      totalPlanned: ledger.totals.programmed,
      totalSupplierPaid: ledger.totals.supplierPaid,
      totalGrossExpenses: ledger.totals.grossExpenses,
      totalAvailable: ledger.totals.unallocated,
      totalRemaining: ledger.totals.unexpended,
      recognizedSavings: ledger.totals.recognizedSavings,
      totalObligated: ledger.totals.obligated,
      totalTaxesWithheld: ledger.totals.taxesWithheld,
      totalRetention: ledger.totals.retention,
      totalUnpaid: ledger.totals.unpaid,
      totalAllocated,
      totalDisbursed,
      utilisationRatio: ledger.totals.appropriated > 0 ? Number((totalDisbursed / ledger.totals.appropriated).toFixed(4)) : 0,
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
