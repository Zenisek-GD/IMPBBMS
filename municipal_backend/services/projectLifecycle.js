import { Op } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { PrHeader } from "../models/prModel.js";
import { Rfq, Award, Bid } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Invoice, Payment } from "../models/paymentModel.js";

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

// ── CATEGORIES ───────────────────────────────────────────────────────────────
// The three buckets the public page filters on.
//
//   upcoming  — planned and approved, but not yet advertised
//   ongoing   — advertised, being bid, awarded, or under implementation
//   completed — contract closed out, or delivered, accepted and paid
export const PROJECT_CATEGORIES = [
  { key: "all", label: "All Projects" },
  { key: "completed", label: "Completed" },
  { key: "ongoing", label: "Ongoing" },
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

  const rfqs = prIds.length
    ? await Rfq.findAll({
        where: { prHeaderId: { [Op.in]: prIds }, status: { [Op.in]: PUBLIC_RFQ_STATES } },
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
const derivePhase = ({ prs, rfqs, bids, awards, contracts, deliveries, payments }) => {
  const released = payments.some((payment) => payment.status === "released");
  const accepted = deliveries.some((delivery) => delivery.status === "accepted");
  const contractClosed = contracts.some((contract) => contract.status === "completed");

  if (contractClosed || (accepted && released)) return "completion";
  if (contracts.some((contract) => ["active", "completed"].includes(contract.status))) return "contract";
  if (awards.length) return "award";
  if (rfqs.some((rfq) => ["evaluated", "awarded"].includes(rfq.status))) return "evaluation";
  if (bids.length || rfqs.some((rfq) => ["opened", "closed"].includes(rfq.status))) return "bidding";
  if (rfqs.length) return "solicitation";
  if (prs.length) return "requisition";
  return "planning";
};

const deriveCategory = (phase, { contracts, deliveries, payments }) => {
  const contractClosed = contracts.some((contract) => contract.status === "completed");
  const settled = deliveries.some((d) => d.status === "accepted") && payments.some((p) => p.status === "released");

  if (contractClosed || settled) return "completed";
  // Anything advertised or later is in motion; before that it is still a plan.
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf("solicitation") ? "ongoing" : "upcoming";
};

// Money, in the three figures that matter publicly: what was budgeted, what it
// was actually awarded for, and what has actually left the treasury.
const deriveFinancials = (entry, { awards, contracts, invoices, payments }) => {
  const budget = num(entry.abc);
  const awardedAmount = awards.reduce((sum, award) => sum + num(award.amount), 0);
  const contractAmount = contracts.reduce((sum, contract) => sum + num(contract.amount), 0);
  const invoiced = invoices.reduce((sum, invoice) => sum + num(invoice.amount), 0);
  const disbursed = payments
    .filter((payment) => payment.status === "released")
    .reduce((sum, payment) => sum + num(payment.amount), 0);

  // Savings only mean something once there is an award to compare against.
  const contracted = contractAmount || awardedAmount;
  const savings = contracted ? budget - contracted : null;

  return {
    budget,
    awardedAmount: awardedAmount || null,
    contractAmount: contractAmount || null,
    invoicedAmount: invoiced || null,
    disbursedAmount: disbursed,
    savings,
    savingsPercent: savings !== null && budget > 0 ? Number(((savings / budget) * 100).toFixed(1)) : null,
    // How much of the awarded value has actually been paid out.
    utilisationPercent: contracted > 0 ? Number(((disbursed / contracted) * 100).toFixed(1)) : 0,
  };
};

// Assembles one public project view. `detailed` adds the per-record breakdown
// the detail page needs; the list view omits it to keep responses small.
const buildProject = (entry, chain, { detailed = false } = {}) => {
  const phase = derivePhase(chain);
  const category = deriveCategory(phase, chain);
  const phaseIndex = PHASE_ORDER.indexOf(phase);

  const award = chain.awards[0] ?? null;
  const contract = chain.contracts[0] ?? null;
  const rfq = chain.rfqs[0] ?? null;

  const base = {
    id: entry.id,
    projectTitle: entry.projectTitle,
    description: entry.description,
    implementingUnit: entry.implementingUnit?.name ?? null,
    implementingUnitCode: entry.implementingUnit?.code ?? null,
    category,
    phase,
    phaseLabel: LIFECYCLE_PHASES[phaseIndex]?.label ?? "Planning",
    // Completion is the last phase, so a project at index 7 of 8 reads 100%.
    progressPercent: Math.round(((phaseIndex + 1) / PHASE_ORDER.length) * 100),
    procurementMode: rfq?.mode?.name ?? entry.procurementMode,
    fiscalYear: entry.fiscalYear,
    targetStartQuarter: entry.targetStartQuarter,
    targetCompletionQuarter: entry.targetCompletionQuarter,
    projectCategory: entry.category,
    fundSource: entry.fundSource,
    financials: deriveFinancials(entry, chain),
    awardedTo: award?.vendor?.businessName ?? null,
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
      reached: index <= phaseIndex,
      current: index === phaseIndex,
    })),
    // Reference numbers only. Internal remarks, evaluator scores, bidder
    // identities before award and justification text are all withheld — the
    // same omissions transparencyController.js already makes.
    records: {
      requisitions: chain.prs.map((pr) => ({
        prNumber: pr.prNumber,
        status: pr.status,
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
        status: item.status,
        bidsReceived: chain.bids.filter((bid) => bid.rfqId === item.id).length,
      })),
      awards: chain.awards.map((item) => ({
        noaNumber: item.noaNumber,
        noaDate: item.noaDate,
        amount: num(item.amount),
        awardedTo: item.vendor?.businessName ?? null,
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
  const rfqs = grouped.rfqs.filter((rfq) => prIds.has(rfq.prHeaderId));

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

export const listPublicProjects = async ({ search, category, fiscalYear, department, detailed = false } = {}) => {
  const where = { status: { [Op.in]: PUBLISHED_APP_STATES } };

  // Number() on a non-numeric string yields NaN, which Sequelize renders as the
  // literal `NaN` and MySQL rejects. Every numeric filter here is checked before
  // it reaches a query — these endpoints take anonymous input.
  const year = Number(fiscalYear);
  if (fiscalYear && Number.isFinite(year)) where.fiscalYear = year;

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
    include: [{ model: Department, as: "implementingUnit" }],
    order: [["updatedAt", "DESC"]],
  });

  const chain = await loadChain(entries.map((entry) => entry.id));
  const grouped = { ...chain, prsByApp: groupBy(chain.prs, "appEntryId") };

  const projects = entries.map((entry) => buildProject(entry, chainFor(entry.id, grouped), { detailed }));

  // Category is derived, not stored, so it is filtered after assembly.
  return category && category !== "all"
    ? projects.filter((project) => project.category === category)
    : projects;
};

export const getPublicProject = async (id) => {
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) return null;

  const entry = await AppEntry.findOne({
    where: { id: entryId, status: { [Op.in]: PUBLISHED_APP_STATES } },
    include: [{ model: Department, as: "implementingUnit" }],
  });
  if (!entry) return null;

  const chain = await loadChain([entry.id]);
  const grouped = { ...chain, prsByApp: groupBy(chain.prs, "appEntryId") };

  return buildProject(entry, chainFor(entry.id, grouped), { detailed: true });
};

// Aggregate figures for the portal header, computed over the same published set
// the list returns so the totals always agree with the rows beneath them.
export const getPublicSummary = async () => {
  const projects = await listPublicProjects({});

  // Savings are only meaningful against the projects that actually reached a
  // contract. Comparing total contracted value to the budget of every project —
  // including ones not yet advertised — would read as an enormous underspend
  // when nothing of the sort has happened.
  const contractedProjects = projects.filter((project) => project.financials.contractAmount);
  const budgetOfContracted = contractedProjects.reduce(
    (sum, project) => sum + project.financials.budget,
    0
  );
  const totalContracted = contractedProjects.reduce(
    (sum, project) => sum + project.financials.contractAmount,
    0
  );

  return {
    totalProjects: projects.length,
    completed: projects.filter((project) => project.category === "completed").length,
    ongoing: projects.filter((project) => project.category === "ongoing").length,
    upcoming: projects.filter((project) => project.category === "upcoming").length,
    totalBudget: projects.reduce((sum, project) => sum + project.financials.budget, 0),
    totalContracted,
    // The comparable budget for the contracted set, so the UI can state a
    // savings figure that means what it says.
    budgetOfContracted,
    contractedProjects: contractedProjects.length,
    totalDisbursed: projects.reduce((sum, project) => sum + project.financials.disbursedAmount, 0),
  };
};
