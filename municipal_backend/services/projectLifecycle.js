import { Op, json, where as sqlWhere } from "sequelize";
import { applyProjectDemonstration } from './projectDemonstration.js';
import { Appropriation } from "../models/appropriationModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { PrHeader } from "../models/prModel.js";
import { Rfq, Award, Bid } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { projectFinancialPositions } from "./projectFinancials.js";
import { FY2025_AWARD_KEYS, historicalSourceValues, isFy2025HistoricalAward } from "./historicalAwards.js";
import { calculateFinancialPosition, fiscalYearFilter, sumMoney } from "./financialCalculations.js";
import { ACADEMIC_PROJECT_KEY } from "./academicCase.js";

// ── WHAT A "PROJECT" IS ──────────────────────────────────────────────────────
// The public sees a project, not a table. In this schema a project is an APP
// entry — it is the thing that carries the title, the implementing office, the
// budget and the intent — and every later record hangs off it:
//
//   AppEntry → PrHeader → Rfq → Bid → Award → Contract → Delivery
//                                                      → Invoice → Payment
//
// This module assembles that chain and derives what a citizen actually wants to
// know: which stage is it at, is it finished, what was budgeted, what was
// actually spent.
//
// ── THE PUBLICATION BOUNDARY ─────────────────────────────────────────────────
// Only APP entries the LGU has approved are visible, matching the rule already
// applied in transparencyController.js. A draft plan is a proposal the
// municipality has not committed to; publishing it would misrepresent an
// internal deliberation as a decision. Filtering happens in the query below,
// never in the UI.
const PUBLISHED_APP_STATES = ["approved", "locked"];
export const visibleProject = { [Op.or]: [
  { status: { [Op.in]: PUBLISHED_APP_STATES } },
  { fiscalYear: 2025, recoveryKey: { [Op.in]: FY2025_AWARD_KEYS }, [Op.and]: sqlWhere(json("recoveryImport.historicalAward.id"), { [Op.gt]: 0 }) },
  { fiscalYear: 2026, recoveryKey: "2026:MDRRMO-2026-001", [Op.and]: sqlWhere(json("recoveryImport.sourceStatus"), "Awarded / For implementation") },
] };

// An RFQ is public from the moment it is advertised. "draft" and "cancelled"
// are not — a draft is not yet a solicitation, and a cancelled one never became
// one. This mirrors PUBLISHED_RFQ_STATES in transparencyController.js.
const PUBLIC_RFQ_STATES = ["published", "closed", "opened", "evaluated", "awarded", "failed"];

// ── LIFECYCLE PHASES ─────────────────────────────────────────────────────────
// The eight stages a citizen is shown, in order. `key` is stable for the UI;
// `reached` is computed per project below.
export const LIFECYCLE_PHASES = [
  { key: "planning", label: "Planning", detail: "Included in the Annual Procurement Plan" },
  { key: "requisition", label: "Requisition", detail: "Purchase requisition raised and funded" },
  { key: "solicitation", label: "Solicitation", detail: "Invitation to bid advertised publicly" },
  { key: "bidding", label: "Bid Opening", detail: "Bids received and opened" },
  { key: "evaluation", label: "Evaluation", detail: "Bids evaluated and post-qualified" },
  { key: "award", label: "Award", detail: "Notice of Award issued" },
  { key: "contract", label: "Contract", detail: "Contract signed and in force" },
  { key: "completion", label: "Delivery & Completion", detail: "Delivered, accepted and paid" },
];

const PHASE_ORDER = LIFECYCLE_PHASES.map((phase) => phase.key);

// Publish only the fields needed to explain a stage. Source forms also contain
// supplier contacts, tax identifiers and internal evaluation text.
const TIMELINE_SOURCE_FIELDS = {
  planning: ["Linked AIP Project", "Fund Source", "Expense Class", "Approved Budget for the Contract", "Appropriation Reference for Final APP", "Procurement Start Quarter", "Procurement Completion Quarter", "Expense classification", "Funding classification breakdown"],
  requisition: ["Linked Purchase Requisition", "Purchase Requisition Purpose", "Item Description", "Date Required"],
  solicitation: ["Solicitation Title", "Recommended Procurement Mode", "PhilGEPS Reference Number", "Bid Opening / Conference Venue"],
  evaluation: ["Overall Result", "Post-Qualification Overall Result"],
  award: ["Award Recommended Supplier", "Recommended Award Amount", "Award Basis", "BAC Resolution Number", "Existing Notice of Award Number", "Supplier identity"],
};

const TIMELINE_SUPPORTING_RECORDS = {
  planning: [["Original planning, funding and requisition approvals", "Original planning and funding approvals"]],
  requisition: [["Original planning, funding and requisition approvals", "Original requisition approvals"]],
  bidding: [["Signed bid opening, evaluation and post-qualification records", "Signed bid opening record"]],
  evaluation: [["Signed bid opening, evaluation and post-qualification records", "Signed evaluation and post-qualification records"]],
  award: [["Signed BAC resolution, Notice of Award and proof of receipt", "Signed BAC resolution, Notice of Award and proof of receipt"]],
  contract: [["Signed contract or purchase order and Notice to Proceed", "Signed contract or purchase order and Notice to Proceed"]],
  completion: [
    ["Delivery, inspection and acceptance records", "Delivery, inspection and acceptance records"],
    ["Invoice, payment and financial closeout records", "Invoice, payment and financial closeout records"],
  ],
};

function reviewedTimelineEvidence(fields) {
  return Object.fromEntries(PHASE_ORDER.map((key) => [key, {
    reportedDetails: (TIMELINE_SOURCE_FIELDS[key] ?? [])
      .filter((label) => fields[label]?.trim() && !/^(?:not available|not applicable|none|n\/a)$/i.test(fields[label].trim()))
      .map((label) => ({ label: label === "Date Required" ? "Date Required (target)" : label, value: fields[label] })),
    missingRecords: (TIMELINE_SUPPORTING_RECORDS[key] ?? [])
      .filter(([field]) => /^not available\b/i.test(fields[field] ?? ""))
      .map(([, label]) => label),
  }]));
}

// ── CATEGORIES ───────────────────────────────────────────────────────────────
// The public categories distinguish a historical award from contract closeout.
//
//   upcoming  — planned and approved, but not yet advertised
//   ongoing   — advertised, being bid, awarded, or under implementation
//   completed — contract closed out, or delivered, accepted and paid
export const PROJECT_CATEGORIES = [
  { key: "all", label: "All Projects" },
  { key: "completed", label: "Completed" },
  { key: "ongoing", label: "Ongoing" },
  { key: "awarded", label: "Awarded" },
  { key: "upcoming", label: "Upcoming" },
];

const num = (value) => (value === null || value === undefined ? 0 : Number(value));

// Loads every record related to the given APP entries in a fixed number of
// queries. Walking the chain per project would issue one query per project per
// level; this issues eight regardless of how many projects there are.
const loadChain = async (appEntryIds) => {
  if (appEntryIds.length === 0) {
    return { prs: [], rfqs: [], bids: [], awards: [], contracts: [], deliveries: [], invoices: [], payments: [] };
  }

  const prs = await PrHeader.findAll({ where: { appEntryId: { [Op.in]: appEntryIds } } });
  const prIds = prs.map((pr) => pr.id);

  const rfqs = appEntryIds.length
    ? await Rfq.findAll({
        where: { [Op.or]: [{ prHeaderId: { [Op.in]: prIds } }, { appEntryId: { [Op.in]: appEntryIds } }], status: { [Op.in]: PUBLIC_RFQ_STATES } },
        include: [{ model: ProcurementMode, as: "mode" }],
      })
    : [];
  const rfqIds = rfqs.map((rfq) => rfq.id);

  const [bids, awards] = await Promise.all([
    rfqIds.length ? Bid.findAll({ where: { rfqId: { [Op.in]: rfqIds } }, attributes: ["id", "rfqId", "status"] }) : [],
    rfqIds.length
      ? Award.findAll({
          where: { rfqId: { [Op.in]: rfqIds }, status: { [Op.in]: ["issued", "accepted"] } },
          include: [{ model: Vendor, as: "vendor", attributes: ["id", "businessName"] }],
        })
      : [],
  ]);

  const awardIds = awards.map((award) => award.id);
  const contracts = awardIds.length ? await Contract.findAll({ where: { awardId: { [Op.in]: awardIds } } }) : [];
  const contractIds = contracts.map((contract) => contract.id);

  const [deliveries, invoices] = await Promise.all([
    contractIds.length ? Delivery.findAll({ where: { contractId: { [Op.in]: contractIds } } }) : [],
    contractIds.length ? Invoice.findAll({ where: { contractId: { [Op.in]: contractIds } } }) : [],
  ]);

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const payments = invoiceIds.length ? await Payment.findAll({ where: { invoiceId: { [Op.in]: invoiceIds } } }) : [];

  return { prs, rfqs, bids, awards, contracts, deliveries, invoices, payments };
};

// `AppEntry.procurementMode` stores a ProcurementMode *key* ("competitiveBidding"),
// and the public view falls back to it whenever a project has not been
// advertised yet — so every upcoming project published the raw key as its
// procurement method, right under the title.
//
// These names cannot be derived by spacing the camel case: "stiProcurement" is
// "Direct Procurement for Science, Technology, and Innovation" and
// "unsolicitedOffer" is "Unsolicited Offer with Bid Matching". Two of the eleven
// modes would be renamed into something the law does not call them, so the real
// name has to be looked up.
const loadModeNames = async () => {
  const modes = await ProcurementMode.findAll({ attributes: ["key", "name"] });
  return new Map(modes.map((mode) => [mode.key, mode.name]));
};

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const bucket = map.get(row[key]);
    if (bucket) bucket.push(row);
    else map.set(row[key], [row]);
  }
  return map;
};

// Furthest stage this project has actually reached. Deliberately based on
// records that exist rather than on a status column, so the phase cannot
// disagree with the evidence shown underneath it.
// Contract closeout is the workflow's authoritative completion decision.
const derivePhase = ({ prs, rfqs, awards, contracts }) => {
  const effectiveContracts = contracts.filter((contract) => contract.status !== "rescinded");
  if (awards.length && awards.every((award) => effectiveContracts.some((contract) => contract.awardId === award.id && contract.status === "completed"))
    && effectiveContracts.every((contract) => contract.status === "completed")) return "completion";
  if (effectiveContracts.some((contract) => ["active", "completed"].includes(contract.status))) return "contract";
  if (awards.length) return "award";
  if (rfqs.some((rfq) => ["evaluated", "awarded"].includes(rfq.status))) return "evaluation";
  if (rfqs.some((rfq) => rfq.status === "opened")) return "bidding";
  if (rfqs.length) return "solicitation";
  if (prs.length) return "requisition";
  return "planning";
};

const deriveCategory = (phase) => {
  if (phase === "completion") return "completed";
  // Anything advertised or later is in motion; before that it is still a plan.
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf("solicitation") ? "ongoing" : "upcoming";
};

// The order categories are listed in publicly. An unrecognised category sorts
// last rather than first, so adding a category without updating this map cannot
// silently push it above the completed projects.
const CATEGORY_RANK = { completed: 0, ongoing: 1, awarded: 2, upcoming: 3 };

// Money, in the three figures that matter publicly: what was budgeted, what it
// was actually awarded for, and what has actually left the treasury.
const deriveFinancials = (entry, { awards, contracts, invoices, payments }, position) => {
  const financials = position ?? calculateFinancialPosition({ plannedAmount: entry.abc, invoices, payments });
  const awardedAmount = sumMoney(awards, (row) => row.amount);
  const contractAmount = sumMoney(contracts.filter((row) => row.status !== "rescinded"), (row) => row.amount);
  const savings = financials.financialCloseoutApproved ? financials.recognizedSavings : null;
  return {
    ...financials,
    budget: financials.plannedAmount,
    awardedAmount: awardedAmount || null, contractAmount: contractAmount || null,
    invoicedAmount: financials.invoicedGross || null,
    disbursedAmount: financials.supplierPaid,
    savings, savingsPercent: savings !== null && financials.allocated > 0 ? Number(((savings / financials.allocated) * 100).toFixed(1)) : null,
    utilisationPercent: financials.allocated > 0 ? Number(((financials.grossExpenses / financials.allocated) * 100).toFixed(1)) : 0,
  };
};

// Assembles one public project view. `detailed` adds the per-record breakdown
// the detail page needs; the list view omits it to keep responses small.
const buildProject = (entry, chain, { detailed = false, modeNames = null, financialPosition = null } = {}) => {
  const historical = isFy2025HistoricalAward(entry);
  const reportedOngoing = entry.fiscalYear === 2026 && entry.recoveryKey === "2026:MDRRMO-2026-001"
    && entry.recoveryImport?.sourceStatus === "Awarded / For implementation";
  const source = historicalSourceValues(entry);
  if (historical) {
    const archived = entry.recoveryImport.demonstrationCompletion;
    chain = {
      ...chain,
      contracts: chain.contracts.filter((row) => row.id !== archived?.contractId),
      deliveries: chain.deliveries.filter((row) => row.contractId !== archived?.contractId && row.id !== archived?.deliveryId),
      invoices: chain.invoices.filter((row) => row.contractId !== archived?.contractId && row.id !== archived?.invoiceId),
      payments: chain.payments.filter((row) => row.invoiceId !== archived?.invoiceId && row.id !== archived?.paymentId),
    };
  }
  const phase = derivePhase(chain);
  const confirmedOngoing = entry.recoveryImport?.displayStatusConfirmation?.category === "ongoing";
  const category = phase === "completion" ? "completed"
    : reportedOngoing || confirmedOngoing ? "ongoing"
    : historical && phase === "award" ? "awarded" : deriveCategory(phase);
  const phaseIndex = PHASE_ORDER.indexOf(phase);

  const award = chain.awards.find((row) => row.id === entry.recoveryImport?.historicalAward?.id) ?? chain.awards[0] ?? null;
  const historicalAward = award && award.id === entry.recoveryImport?.historicalAward?.id
    ? entry.recoveryImport.historicalAward : null;
  const contract = chain.contracts[0] ?? null;
  const rfq = chain.rfqs[0] ?? null;
  const reviewed = Object.fromEntries((entry.recoveryImport?.reviewedForm?.fields ?? []).map(({ label, value }) => [label, value]));
  const reportedAward = reportedOngoing ? entry.recoveryImport.reviewedForm?.award ?? null : null;

  const base = {
    id: entry.id,
    papCode: entry.papCode,
    projectTitle: entry.projectTitle,
    description: entry.description,
    ...(entry.recoveryKey === ACADEMIC_PROJECT_KEY && { recordSource: "academic" }),
    // The public list already identifies the implementing office by name. Its
    // stable id is included as well so the Worker demo snapshot can apply the
    // same office filter without issuing a second database request.
    implementingUnitId: entry.implementingUnitId ?? null,
    implementingUnit: source?.["Implementing Office"] ?? entry.implementingUnit?.name ?? null,
    implementingUnitCode: entry.implementingUnit?.code ?? null,
    category,
    phase,
    phaseLabel: LIFECYCLE_PHASES[phaseIndex]?.label ?? "Planning",
    // Completion is the last phase, so a project at index 7 of 8 reads 100%.
    progressPercent: Math.round(((phaseIndex + 1) / PHASE_ORDER.length) * 100),
    procurementMode:
      rfq?.mode?.name ?? modeNames?.get(entry.procurementMode) ?? entry.procurementMode,
    fiscalYear: financialPosition?.fiscalYear ?? entry.fiscalYear,
    targetStartQuarter: entry.targetStartQuarter,
    targetCompletionQuarter: entry.targetCompletionQuarter,
    projectCategory: entry.category,
    fundSource: entry.fundSource,
    financials: deriveFinancials(entry, chain, financialPosition),
    awardedTo: historicalAward?.supplierMismatch ? null : historicalAward?.recommendedSupplier ?? award?.vendor?.businessName ?? null,
    ...(historicalAward && { historicalAward }),
    ...(historical && { clientReportedStatus: entry.recoveryImport.sourceStatus }),
    ...(reportedOngoing && { clientReportedStatus: entry.recoveryImport.sourceStatus }),
    ...((historicalAward || reportedOngoing) && { documentedThrough: historicalAward || reportedAward ? "Notice of Award receipt" : "Recovered requisition draft" }),
    ...(reportedAward && { reportedAward }),
    ...((historical || reportedOngoing) && { reportedExpenseClass: reviewed["Expense Class"] ?? source?.["Expense Class"] ?? null }),
    ...(!historical && entry.recoveryImport?.demonstrationCompletion && { historicalDemonstration: true }),
    ...(entry.recoveryImport?.ongoingScenario && { ongoingDemonstration: true }),
    noaNumber: award?.noaNumber ?? null,
    noaDate: award?.noaDate ?? null,
    contractNo: contract?.contractNo ?? null,
    contractStatus: contract?.status ?? null,
    referenceNo: rfq?.referenceNo ?? null,
    bidsReceived: chain.bids.length,
    lastUpdatedAt: entry.updatedAt,
  };

  if (!detailed) return base;

  return {
    ...base,
    phases: LIFECYCLE_PHASES.map((definition, index) => ({
      ...definition,
      ...(historicalAward && {
        detail: [
          "Project and budget identified in the source form",
          "Purchase requisition identified in the source form",
          "Solicitation reference and dates recorded",
          "Bid submission and opening dates recorded",
          "Evaluation and post-qualification results recorded",
          "Notice of Award and supplier receipt recorded",
          chain.contracts.length ? definition.detail : "Contract details unavailable",
          phase === "completion" ? definition.detail : "Delivery, acceptance and payment details unavailable",
        ][index],
      }),
      reached: index <= phaseIndex,
      current: index === phaseIndex,
      ...(historicalAward && index <= PHASE_ORDER.indexOf("award") && { evidence: "clientReported" }),
      ...(reportedOngoing && entry.status === "draft" && definition.key === "planning" && { detail: "Recovered planning entry on file" }),
      ...(reportedOngoing && chain.prs.length && chain.prs.every((pr) => pr.status === "draft") && definition.key === "requisition" && { detail: "Recovered requisition draft on file" }),
      ...(reportedAward && index > phaseIndex && index <= PHASE_ORDER.indexOf("award") && { evidence: "clientReported", detail: "Reported in the reviewed client form" }),
      ...((historical || reportedOngoing) && index > phaseIndex && (!reportedAward || index > PHASE_ORDER.indexOf("award")) && { detail: "Supporting records unavailable" }),
    })),
    // Reference numbers only. Internal remarks, evaluator scores, bidder
    // identities before award and justification text are all withheld — the
    // same omissions transparencyController.js already makes.
    records: {
      requisitions: chain.prs.map((pr) => ({
        prNumber: pr.prNumber,
        status: historical ? "on file" : pr.status,
        totalAmount: num(pr.totalAmount),
        dateRequired: pr.dateRequired,
      })),
      solicitations: chain.rfqs.map((item) => ({
        referenceNo: item.referenceNo,
        title: item.title,
        mode: item.mode?.name ?? null,
        category: item.category,
        abc: num(item.abc),
        publishDate: item.publishDate,
        closingDate: item.closingDate,
        openingDate: item.openingDate,
        prebidAt: item.prebidAt,
        status: item.status,
        bidsReceived: chain.bids.filter((bid) => bid.rfqId === item.id).length,
      })),
      awards: chain.awards.map((item) => ({
        noaNumber: item.noaNumber,
        noaDate: item.noaDate,
        amount: num(item.amount),
        awardedTo: item.id === historicalAward?.id ? base.awardedTo : item.vendor?.businessName ?? null,
        status: item.status,
      })),
      contracts: chain.contracts.map((item) => ({
        contractNo: item.contractNo,
        amount: num(item.amount),
        startDate: item.startDate,
        deliveryDeadline: item.deliveryDeadline,
        status: item.status,
        signedByLguAt: item.signedByLguAt,
        signedByVendorAt: item.signedByVendorAt,
      })),
      deliveries: chain.deliveries.map((item) => ({
        description: item.description,
        deliveredAt: item.deliveredAt,
        inspectedAt: item.inspectedAt,
        status: item.status,
      })),
      payments: chain.payments.map((item) => ({
        disbursementNo: item.disbursementNo,
        amount: num(item.amount),
        releasedAt: item.releasedAt,
        status: item.status,
      })),
    },
    // Entity references the timeline and document endpoints resolve against.
    // Kept server-side rather than trusted from the client.
    historicalDates: historicalAward ? Object.fromEntries(
      entry.recoveryImport.sourceFields
        .filter(({ label, value }) => ["Pre-Bid Conference", "Submission Date"].includes(label) && /^[A-Za-z]+ \d{1,2}, \d{4}$/.test(value))
        .map(({ label, value }) => [label, new Date(`${value} 12:00:00 GMT+0800`).toISOString().slice(0, 10)])
    ) : {},
    demonstrationMilestones: historical ? [] : entry.recoveryImport?.demonstrationCompletion?.milestones ?? [],
    ongoingDemonstrationEvents: entry.recoveryImport?.ongoingScenario?.events ?? [],
    reportedMilestones: reportedAward ? entry.recoveryImport.reviewedForm.milestones : [],
    timelineEvidence: (historicalAward || reportedOngoing) && Object.keys(reviewed).length ? reviewedTimelineEvidence(reviewed) : null,
    entityRefs: {
      appEntry: [entry.id],
      pr: chain.prs.map((pr) => pr.id),
      rfq: chain.rfqs.map((rfq) => rfq.id),
      bid: chain.bids.map((bid) => bid.id),
      award: chain.awards.map((award) => award.id),
      contract: chain.contracts.map((contract) => contract.id),
      delivery: chain.deliveries.map((delivery) => delivery.id),
      invoice: chain.invoices.map((invoice) => invoice.id),
      payment: chain.payments.map((payment) => payment.id),
    },
  };
};

const chainFor = (entryId, grouped) => {
  const prs = grouped.prsByApp.get(entryId) ?? [];
  const prIds = new Set(prs.map((pr) => pr.id));
  const rfqs = grouped.rfqs.filter((rfq) => prIds.has(rfq.prHeaderId) || Number(rfq.appEntryId) === Number(entryId));

  const rfqIds = new Set(rfqs.map((rfq) => rfq.id));
  const bids = grouped.bids.filter((bid) => rfqIds.has(bid.rfqId));
  const awards = grouped.awards.filter((award) => rfqIds.has(award.rfqId));

  const awardIds = new Set(awards.map((award) => award.id));
  const contracts = grouped.contracts.filter((contract) => awardIds.has(contract.awardId));

  const contractIds = new Set(contracts.map((contract) => contract.id));
  const deliveries = grouped.deliveries.filter((delivery) => contractIds.has(delivery.contractId));
  const invoices = grouped.invoices.filter((invoice) => contractIds.has(invoice.contractId));

  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const payments = grouped.payments.filter((payment) => invoiceIds.has(payment.invoiceId));

  return { prs, rfqs, bids, awards, contracts, deliveries, invoices, payments };
};

// ── PUBLIC ENTRY POINTS ──────────────────────────────────────────────────────

export const listPublicProjects = async ({ search, category, fiscalYear = "all", department, detailed = false } = {}) => {
  const where = { [Op.and]: [visibleProject] };

  // Number() on a non-numeric string yields NaN, which Sequelize renders as the
  // literal `NaN` and MySQL rejects. Every numeric filter here is checked before
  // it reaches a query — these endpoints take anonymous input.
  const year = fiscalYearFilter(fiscalYear);
  if (year !== null) where[Op.and].push({ [Op.or]: [{ "$appropriation.fiscalYear$": year }, { appropriationId: null, fiscalYear: year }] });

  const departmentId = Number(department);
  if (department && Number.isFinite(departmentId)) where.implementingUnitId = departmentId;

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { projectTitle: { [Op.like]: term } },
      { description: { [Op.like]: term } },
      { papCode: { [Op.like]: term } },
      { category: { [Op.like]: term } },
    ];
  }

  const entries = await AppEntry.findAll({
    where,
    include: [{ model: Department, as: "implementingUnit" }, { model: Appropriation, as: "appropriation", attributes: ["fiscalYear"] }],
    order: [["updatedAt", "DESC"]],
  });

  const [chain, modeNames, positions] = await Promise.all([
    loadChain(entries.map((entry) => entry.id)),
    loadModeNames(), projectFinancialPositions(entries.map((entry) => entry.id), { includeDemonstrations: true }),
  ]);
  const grouped = { ...chain, prsByApp: groupBy(chain.prs, "appEntryId") };

  const projects = entries.map((entry) =>
    applyProjectDemonstration(buildProject(entry, chainFor(entry.id, grouped), { detailed, modeNames, financialPosition: positions.get(Number(entry.id)) }))
  );

  // Completed projects lead the list: a finished procurement is the one with a
  // full record behind it — award, contract, deliveries and payments all
  // published — so it is what a visitor arriving to check on the municipality
  // can actually read end to end. Ongoing follows, and upcoming last, since an
  // upcoming project is so far only a line in the plan.
  //
  // Sorted after assembly because `category` is derived from the record chain
  // rather than stored on the row, so it cannot be an ORDER BY. Array#sort is
  // stable, so within a category the `updatedAt DESC` order set by the query
  // above is preserved — most recently touched first.
  const rank = (project) => CATEGORY_RANK[project.category] ?? Number.MAX_SAFE_INTEGER;
  projects.sort((a, b) => rank(a) - rank(b));

  // Category is derived, not stored, so it is filtered after assembly.
  return category && category !== "all"
    ? projects.filter((project) => project.category === category)
    : projects;
};

export const getPublicProject = async (id) => {
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) return null;

  const entry = await AppEntry.findOne({
    where: { id: entryId, ...visibleProject },
    include: [{ model: Department, as: "implementingUnit" }, { model: Appropriation, as: "appropriation", attributes: ["fiscalYear"] }],
  });
  if (!entry) return null;

  const [chain, modeNames, positions] = await Promise.all([loadChain([entry.id]), loadModeNames(), projectFinancialPositions([entry.id], { includeDemonstrations: true })]);
  const grouped = { ...chain, prsByApp: groupBy(chain.prs, "appEntryId") };

  return applyProjectDemonstration(buildProject(entry, chainFor(entry.id, grouped), { detailed: true, modeNames, financialPosition: positions.get(Number(entry.id)) }));
};

// Counts describe the visible register. Financial totals describe municipal records.
export const getPublicSummary = async (filters = {}) => {
  const projects = await listPublicProjects(filters);
  const lastUpdatedAt = projects.reduce((latest, project) => {
    const candidate = project.lastUpdatedAt;
    if (!candidate || Number.isNaN(new Date(candidate).getTime())) return latest;
    if (!latest || new Date(candidate).getTime() > new Date(latest).getTime()) return candidate;
    return latest;
  }, null);

  // Contract totals describe awards; only approved closeouts recognize savings.
  const municipalProjects = projects.filter((project) => project.recordSource !== "academic");
  const financialProjects = municipalProjects.filter((project) => !project.historicalDemonstration);
  const contractedProjects = financialProjects.filter((project) => project.financials.contractAmount);
  const budgetOfContracted = sumMoney(contractedProjects, (project) => project.financials.plannedAmount);
  const totalContracted = sumMoney(contractedProjects, (project) => project.financials.contractAmount);

  return {
    fiscalYear: fiscalYearFilter(filters.fiscalYear ?? "all") ?? "all",
    totalAllocated: sumMoney(financialProjects, (project) => project.financials.allocated),
    totalGrossExpenses: sumMoney(financialProjects, (project) => project.financials.grossExpenses),
    recognizedSavings: sumMoney(financialProjects, (project) => project.financials.recognizedSavings),
    totalProjects: projects.length,
    academicProjects: projects.length - municipalProjects.length,
    historicalDemonstrations: projects.filter((project) => project.historicalDemonstration).length,
    clientReportedAwards: projects.filter((project) => project.clientReportedStatus === "Completed / Awarded").length,
    completed: projects.filter((project) => project.category === "completed").length,
    awarded: projects.filter((project) => project.category === "awarded").length,
    ongoing: projects.filter((project) => project.category === "ongoing").length,
    upcoming: projects.filter((project) => project.category === "upcoming").length,
    totalBudget: sumMoney(municipalProjects, (project) => project.financials.plannedAmount),
    totalSupplierPaid: sumMoney(financialProjects, (project) => project.financials.supplierPaid),
    totalTaxesWithheld: sumMoney(financialProjects, (project) => project.financials.taxesWithheld),
    totalRetention: sumMoney(financialProjects, (project) => project.financials.retention),
    totalUnpaid: sumMoney(financialProjects, (project) => project.financials.unpaid),
    totalContracted,
    // Kept for comparison with procurement plans; this is not recognized savings.
    budgetOfContracted,
    contractedProjects: contractedProjects.length,
    totalDisbursed: sumMoney(financialProjects, (project) => project.financials.supplierPaid),
    lastUpdatedAt,
  };
};
