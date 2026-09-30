import { Op, fn, col } from "sequelize";
import { Appropriation, Obligation } from "../models/appropriationModel.js";
import { nextSequenceNo } from "./sequenceNo.js";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader } from "../models/prModel.js";
import { Department } from "../models/departmentModel.js";
// A cancelled plan line releases the amount it had programmed, exactly as a
// returned one does. Before cancellation existed the ledger only knew about
// "returned", so a dropped project would have gone on consuming its
// appropriation's programmed balance forever.
import { RELEASED_APP_STATUSES } from "./appWorkflow.js";
import { SystemSetting } from "../models/systemSettingModel.js";
import { ProjectAllocation } from "../models/budgetControlModel.js";
import { projectFinancialPositions } from "./projectFinancials.js";
import { sumMoney, difference, fiscalYearFilter } from "./financialCalculations.js";

// ── THE BUDGET LEDGER ────────────────────────────────────────────────────────
// The appropriation is the enacted annual authority. APP programming is a
// procurement plan; only approved allocations reserve funds for a project.
// Obligations reserve commitments and released voucher gross values measure
// spending. Supplier net, withheld taxes and retention stay separate.
// availableFor is the appropriation's unobligated balance; allocationBalanceFor
// is the balance available for an additional project allocation.

const num = (value) => (value === null || value === undefined ? 0 : Number(value));

// Only an enacted ordinance authorises spending. A draft is a proposal.
const LEDGER_STATUSES = ["enacted", "closed"];

// Obligations that still hold money. A cancelled ORS has released its
// reservation and must not count against the balance.
const LIVE_OBLIGATION = { status: "obligated" };

// Grouped SUM as a Map. The column to total is passed in rather than inferred
// from the model, so adding a third caller cannot silently sum the wrong field.
const sumBy = async (model, { groupColumn, sumColumn, where }) => {
  const rows = await model.findAll({
    attributes: [groupColumn, [fn("SUM", col(sumColumn)), "total"]],
    where,
    group: [groupColumn],
    raw: true,
  });
  return new Map(rows.map((row) => [row[groupColumn], num(row.total)]));
};

// How much of an appropriation is still free to commit. This is the number the
// Budget Officer's certification is checked against.
export const availableFor = async (appropriationId, { excludeObligationId, transaction } = {}) => {
  const appropriation = await Appropriation.findByPk(appropriationId, { transaction });
  if (!appropriation) return null;

  const where = { appropriationId, ...LIVE_OBLIGATION };
  if (excludeObligationId) where.id = { [Op.ne]: excludeObligationId };

  const obligated = num(await Obligation.sum("amount", { where, transaction }));

  return {
    appropriationId,
    ordinanceNo: appropriation.ordinanceNo,
    title: appropriation.title,
    status: appropriation.status,
    amount: num(appropriation.amount),
    obligated,
    available: difference(appropriation.amount, obligated),
  };
};

// How much of an appropriation the APP has already planned against it. Separate
// from `availableFor` on purpose: planning more than was appropriated is a
// different error from committing more than was appropriated, and they are
// caught at different moments.
export const programmedFor = async (appropriationId, { excludeAppEntryId, transaction } = {}) => {
  const appropriation = await Appropriation.findByPk(appropriationId, { transaction });
  if (!appropriation) return null;

  const where = { appropriationId, status: { [Op.notIn]: RELEASED_APP_STATUSES } };
  if (excludeAppEntryId) where.id = { [Op.ne]: excludeAppEntryId };

  const programmed = num(await AppEntry.sum("abc", { where, transaction }));

  return {
    appropriationId,
    fiscalYear: appropriation.fiscalYear,
    ordinanceNo: appropriation.ordinanceNo,
    title: appropriation.title,
    status: appropriation.status,
    amount: num(appropriation.amount),
    programmed,
    unprogrammed: difference(appropriation.amount, programmed),
  };
};

// Approved project reservations and legacy obligations share one balance.
// Taking the larger amount per project avoids charging an obligation twice.
export async function allocationBalanceFor(appropriationId, { transaction } = {}) {
  const [appropriation, allocations, obligations, entries] = await Promise.all([
    Appropriation.findByPk(appropriationId, { transaction }),
    ProjectAllocation.findAll({ where: { appropriationId, status: { [Op.in]: ["active", "closed"] } }, transaction }),
    Obligation.findAll({ where: { appropriationId, ...LIVE_OBLIGATION }, transaction }),
    AppEntry.findAll({ where: { appropriationId }, attributes: ["id"], transaction }),
  ]);
  if (!appropriation) return null;
  const prIds = obligations.map((row) => row.prHeaderId).filter(Boolean);
  const prs = prIds.length ? await PrHeader.findAll({ where: { id: { [Op.in]: prIds } }, transaction }) : [];
  const projectByPr = new Map(prs.map((row) => [Number(row.id), Number(row.appEntryId)]));
  const allocatedByProject = new Map(allocations.map((row) => [Number(row.appEntryId), num(row.amount)]));
  const obligatedByProject = new Map();
  for (const row of obligations) {
    const key = projectByPr.get(Number(row.prHeaderId)) ?? `orphan-${row.id}`;
    obligatedByProject.set(key, sumMoney([obligatedByProject.get(key), row.amount], (value) => value));
  }
  const positions = await projectFinancialPositions(entries.map((entry) => entry.id), { transaction });
  const projects = [...new Set([...allocatedByProject.keys(), ...obligatedByProject.keys(), ...positions.keys()])];
  const reserved = sumMoney(projects, (key) => Math.max(allocatedByProject.get(key) ?? 0, obligatedByProject.get(key) ?? 0, positions.get(key)?.grossExpenses ?? 0, positions.get(key)?.certifiedGross ?? 0));
  return { appropriationId, amount: num(appropriation.amount), allocated: sumMoney(allocations, (row) => row.amount), reserved,
    unallocatedAvailable: difference(appropriation.amount, reserved) };
}

const TOTAL_FIELDS = ["appropriated", "programmed", "allocated", "reserved", "obligated", "invoicedGross", "certifiedGross", "grossExpenses", "supplierPaid", "taxesWithheld", "retention", "liquidatedDamages", "otherDeductions", "recognizedSavings", "outstandingRetention", "taxesAwaitingRemittance", "unpaidCertifiedGross", "totalOutstandingLiabilities", "disbursed", "unprogrammed", "unallocated", "unobligated", "unexpended", "unpaid"];
const emptyTotals = () => Object.fromEntries(TOTAL_FIELDS.map((key) => [key, 0]));
const totalsFor = (lines) => Object.fromEntries(TOTAL_FIELDS.map((key) => [key, sumMoney(lines, (row) => row[key])]));
const rates = (row) => ({ ...row, obligationRate: row.appropriated > 0 ? Number((row.obligated / row.appropriated).toFixed(4)) : 0,
  utilisationRate: row.appropriated > 0 ? Number((row.grossExpenses / row.appropriated).toFixed(4)) : 0 });

export const buildLedger = async ({ fiscalYear, fund, departmentId } = {}) => {
  const year = fiscalYearFilter(fiscalYear);
  const where = { status: { [Op.in]: LEDGER_STATUSES } };
  if (year !== null) where.fiscalYear = year;
  if (fund) where.fund = fund;
  if (departmentId != null && departmentId !== "" && Number.isFinite(Number(departmentId))) where.departmentId = Number(departmentId);
  const appropriations = await Appropriation.findAll({ where, include: [{ model: Department, as: "office" }], order: [["ordinanceNo", "ASC"], ["title", "ASC"]] });
  const replacementMarkers = await SystemSetting.findAll({ where: { key: { [Op.like]: "budget.reenactedReplacement.%" } }, attributes: ["key"] });
  const replacedIds = new Set(replacementMarkers.map((row) => Number(row.key.split(".").at(-1))));
  const ids = appropriations.map((row) => row.id);
  if (!ids.length) return { fiscalYear: year ?? "all", lines: [], offices: [], totals: emptyTotals() };
  const scoped = { appropriationId: { [Op.in]: ids } };
  const [obligatedMap, programmedMap, entries, reservations] = await Promise.all([
    sumBy(Obligation, { groupColumn: "appropriationId", sumColumn: "amount", where: { ...scoped, ...LIVE_OBLIGATION } }),
    sumBy(AppEntry, { groupColumn: "appropriationId", sumColumn: "abc", where: { ...scoped, status: { [Op.notIn]: RELEASED_APP_STATUSES } } }),
    AppEntry.findAll({ where: scoped, attributes: ["id", "appropriationId"] }),
    Promise.all(ids.map((id) => allocationBalanceFor(id))),
  ]);
  const reservationMap = new Map(reservations.map((row) => [Number(row.appropriationId), row]));
  const positions = await projectFinancialPositions(entries.map((row) => row.id));
  const lines = appropriations.map((appropriation) => {
    // An annual ordinance replaces temporary reenacted authority. Keep its
    // historical row visible without adding that authority a second time.
    const superseded = appropriation.type === "reenacted" && appropriation.status === "closed" && replacedIds.has(Number(appropriation.id));
    const amount = superseded ? 0 : num(appropriation.amount);
    const obligated = obligatedMap.get(appropriation.id) ?? 0;
    const programmed = programmedMap.get(appropriation.id) ?? 0;
    const projects = entries.filter((entry) => Number(entry.appropriationId) === Number(appropriation.id)).map((entry) => positions.get(Number(entry.id))).filter(Boolean);
    const financials = Object.fromEntries(["invoicedGross", "certifiedGross", "grossExpenses", "supplierPaid", "taxesWithheld", "retention", "liquidatedDamages", "otherDeductions", "recognizedSavings", "outstandingRetention", "taxesAwaitingRemittance", "unpaidCertifiedGross"].map((key) => [key, sumMoney(projects, (row) => row[key])]));
    const reservation = reservationMap.get(Number(appropriation.id));
    return rates({ id: appropriation.id, fiscalYear: appropriation.fiscalYear, ordinanceNo: appropriation.ordinanceNo,
      ordinanceDate: appropriation.ordinanceDate, status: appropriation.status, type: appropriation.type, fund: appropriation.fund, expenseClass: appropriation.expenseClass,
      papCode: appropriation.papCode, uacsCode: appropriation.uacsCode, title: appropriation.title, departmentId: appropriation.departmentId,
      departmentCode: appropriation.office?.code ?? "-", departmentName: appropriation.office?.name ?? "Unassigned",
      historicalAppropriation: num(appropriation.amount), superseded,
      appropriated: amount, programmed, allocated: reservation.allocated, reserved: reservation.reserved, obligated, ...financials,
      disbursed: financials.supplierPaid,
      unprogrammed: difference(amount, programmed), unallocated: appropriation.status === "enacted" ? reservation.unallocatedAvailable : 0,
      unobligated: difference(amount, obligated), unexpended: difference(amount, financials.grossExpenses),
      unpaid: Math.max(0, difference(obligated, financials.grossExpenses)),
      totalOutstandingLiabilities: sumMoney([Math.max(0, difference(obligated, financials.grossExpenses), financials.unpaidCertifiedGross), financials.outstandingRetention, financials.taxesAwaitingRemittance], (value) => value),
    });
  });
  const offices = [...new Set(lines.map((row) => row.departmentId ?? 0))].map((id) => {
    const rows = lines.filter((row) => (row.departmentId ?? 0) === id);
    return rates({ departmentId: id, departmentCode: rows[0].departmentCode, departmentName: rows[0].departmentName,
      lineCount: rows.length, ...totalsFor(rows) });
  });
  return { fiscalYear: year ?? "all", lines, offices: offices.sort((a, b) => b.unallocated - a.unallocated), totals: totalsFor(lines) };
};

// ── Obligation register ──────────────────────────────────────────────────────
// Issues the ORS number. Sequential per fiscal year, which is how the register
// is kept on paper. Derived from the highest number present rather than a row
// COUNT, so cancelling an obligation cannot make the next one reuse a retired
// ORS number.
export const nextObligationNo = (fiscalYear, transaction) =>
  nextSequenceNo(Obligation, "obligationNo", "ORS", fiscalYear, { transaction });

// Resolves the appropriation a requisition draws on, via its APP entry. A
// requisition inherits the budget line its plan was charged against — it cannot
// nominate a different one, or the plan and the spending would diverge.
export const appropriationForRequisition = async (prHeaderId) => {
  const pr = await PrHeader.findByPk(prHeaderId, {
    include: [{ model: AppEntry, as: "appEntry" }],
  });
  return pr?.appEntry?.appropriationId ?? null;
};
