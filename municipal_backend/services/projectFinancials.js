import { Op } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader } from "../models/prModel.js";
import { Rfq, Award } from "../models/biddingModel.js";
import { Contract } from "../models/contractModel.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { Appropriation, Obligation } from "../models/appropriationModel.js";
import { ProjectAllocation, BudgetControlRequest } from "../models/budgetControlModel.js";
import { calculateFinancialPosition, sumMoney } from "./financialCalculations.js";

// Scope financial records by their funding project, not payment date. A prior
// year's obligation paid this year still belongs to that prior appropriation.
export async function projectFinancialPositions(appEntryIds, { transaction } = {}) {
  const ids = [...new Set(appEntryIds.map(Number))];
  if (!ids.length) return new Map();
  const scope = (key, values) => ({ where: { [key]: { [Op.in]: values } }, transaction });
  const [entries, prs, allocations, closeouts] = await Promise.all([
    AppEntry.findAll(scope("id", ids)), PrHeader.findAll(scope("appEntryId", ids)),
    ProjectAllocation.findAll(scope("appEntryId", ids)),
    BudgetControlRequest.findAll({ where: { kind: "closeout", status: "approved", sourceProjectId: { [Op.in]: ids } }, transaction }),
  ]);
  const prIds = prs.map((row) => row.id);
  const [obligations, rfqs, appropriations] = await Promise.all([
    prIds.length ? Obligation.findAll(scope("prHeaderId", prIds)) : [],
    Rfq.findAll({ where: { [Op.or]: [{ appEntryId: { [Op.in]: ids } }, { prHeaderId: { [Op.in]: prIds } }] }, transaction }),
    Appropriation.findAll(scope("id", entries.map((entry) => entry.appropriationId).filter(Boolean))),
  ]);
  const appropriationMap = new Map(appropriations.map((row) => [Number(row.id), row]));
  const awards = rfqs.length ? await Award.findAll(scope("rfqId", rfqs.map((row) => row.id))) : [];
  const contracts = awards.length ? await Contract.findAll(scope("awardId", awards.map((row) => row.id))) : [];
  const invoices = contracts.length ? await Invoice.findAll(scope("contractId", contracts.map((row) => row.id))) : [];
  const payments = invoices.length ? await Payment.findAll(scope("invoiceId", invoices.map((row) => row.id))) : [];
  const prProject = new Map(prs.map((row) => [Number(row.id), Number(row.appEntryId)]));
  const rfqProject = new Map(rfqs.map((row) => [Number(row.id), prProject.get(Number(row.prHeaderId)) ?? Number(row.appEntryId)]));
  const awardProject = new Map(awards.map((row) => [Number(row.id), rfqProject.get(Number(row.rfqId))]));
  const contractProject = new Map(contracts.map((row) => [Number(row.id), awardProject.get(Number(row.awardId))]));
  const invoiceProject = new Map(invoices.map((row) => [Number(row.id), contractProject.get(Number(row.contractId))]));
  return new Map(entries.map((entry) => {
    const id = Number(entry.id);
    const position = calculateFinancialPosition({
      plannedAmount: entry.abc,
      allocations: allocations.filter((row) => Number(row.appEntryId) === id),
      obligations: obligations.filter((row) => prProject.get(Number(row.prHeaderId)) === id),
      invoices: invoices.filter((row) => contractProject.get(Number(row.contractId)) === id),
      payments: payments.filter((row) => invoiceProject.get(Number(row.invoiceId)) === id),
      closeouts: closeouts.filter((row) => Number(row.sourceProjectId) === id),
    });
    const projectContracts = contracts.filter((row) => awardProject.get(Number(row.awardId)) === id);
    const funding = appropriationMap.get(Number(entry.appropriationId));
    return [id, { appEntryId: id, appropriationId: entry.appropriationId,
      fiscalYear: funding?.fiscalYear ?? entry.fiscalYear,
      contractCommitted: sumMoney(projectContracts.filter((row) => row.status !== "rescinded"), (row) => row.amount),
      liveContractCount: projectContracts.filter((row) => !["completed", "rescinded"].includes(row.status)).length,
      ...position }];
  }));
}

export async function projectFinancialPosition(appEntryId, options = {}) {
  return (await projectFinancialPositions([appEntryId], options)).get(Number(appEntryId)) ?? null;
}
