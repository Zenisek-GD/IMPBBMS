import { Op } from "sequelize";
import { ProjectAllocation, BudgetControlRequest, CLOSEOUT_CLASSIFICATIONS } from "../models/budgetControlModel.js";
import { Appropriation, Obligation, FUNDS, EXPENSE_CLASSES, APPROPRIATION_TYPES } from "../models/appropriationModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { AipEntry } from "../models/investmentProgramModel.js";
import { DevelopmentGoal } from "../models/developmentPlanModel.js";
import { Document } from "../models/documentModel.js";
import { activeDepartment, recordState } from "./requisitionRecords.js";
import { projectFinancialPosition } from "./projectFinancials.js";
import { availableFor, allocationBalanceFor } from "./budgetLedger.js";
import { workflowError } from "./workflowSupport.js";
import { cents, money, difference, sumMoney, fiscalYearFilter } from "./financialCalculations.js";
import { PrHeader } from "../models/prModel.js";
import { Rfq, Award } from "../models/biddingModel.js";
import { Contract } from "../models/contractModel.js";
import { Invoice } from "../models/paymentModel.js";
import { ExecutiveBudget } from "../models/budgetPreparationModel.js";
import { SystemSetting } from "../models/systemSettingModel.js";

const transferable = ["contractSavings", "unusedAppropriation", "cancelledObligation"];
export { money };
const ensure = (condition, message, status = 409) => { if (!condition) throw workflowError(message, status); };

// When the annual ordinance takes effect, temporary reenacted authority is
// replaced, not added to it. Keep historic rows and move current reservations
// onto an unambiguous final ordinance line within the same funding identity.
export const reconcileReenactedAppropriations = async (budget, released, transaction) => {
  if (budget.type !== "annual") return [];
  const previous = await Appropriation.findAll({ where: { fiscalYear: budget.fiscalYear, type: "reenacted", status: "enacted" }, order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
  const result = [];
  for (const line of previous) {
    const projects = await AppEntry.findAll({ where: { appropriationId: line.id }, transaction, lock: transaction.LOCK.UPDATE });
    const obligations = await Obligation.findAll({ where: { appropriationId: line.id }, transaction, lock: transaction.LOCK.UPDATE });
    const allocations = await ProjectAllocation.findAll({ where: { appropriationId: line.id }, transaction, lock: transaction.LOCK.UPDATE });
    const matches = released.filter(row => ["fund", "expenseClass", "departmentId"].every(key => row[key] === line[key]) && (line.papCode || line.uacsCode ? ["papCode", "uacsCode"].every(key => (row[key] || null) === (line[key] || null)) : row.title.trim().toLowerCase() === line.title.trim().toLowerCase()));
    ensure(matches.length === 1 || !(projects.length || obligations.length || allocations.length), `Reenacted appropriation ${line.id} needs one matching final annual line (office, fund, expense class and PAP/UACS code or title) before its linked records can be reconciled.`);
    const target = matches[0];
    const before = { appropriation: recordState(line), projects: projects.map(recordState), obligations: obligations.map(recordState), allocations: allocations.map(recordState) };
    if (target) {
      for (const row of projects) await row.update({ appropriationId: target.id }, { transaction });
      for (const row of obligations) await row.update({ appropriationId: target.id }, { transaction });
      for (const row of allocations) await row.update({ appropriationId: target.id }, { transaction });
      const balances = await allocationBalanceFor(target.id, { transaction });
      ensure(cents(balances.reserved) <= cents(target.amount), `The final annual line ${target.title} cannot cover its existing reenacted allocations and obligations.`);
    }
    await line.update({ status: "closed", remarks: `${line.remarks || ""}\nReplaced by annual budget #${budget.id}, ${budget.ordinanceNo}${target ? `, appropriation #${target.id}` : ""}.` }, { transaction });
    await SystemSetting.create({ key: `budget.reenactedReplacement.${line.id}`, value: JSON.stringify({ executiveBudgetId: budget.id, replacementAppropriationId: target?.id ?? null, ordinanceNo: budget.ordinanceNo, fiscalYear: budget.fiscalYear }), description: "Permanent reference replacing temporary reenacted authority with the final annual ordinance." }, { transaction });
    result.push({ before, after: { appropriation: recordState(line), replacementAppropriationId: target?.id ?? null, projects: projects.map(recordState), obligations: obligations.map(recordState), allocations: allocations.map(recordState) } });
  }
  return result;
};

export const validateBudgetEvidence = async (request, transaction) => {
  ensure(request.reason?.trim().length >= 10, "Explain the reason for this budget action (at least 10 characters).", 400);
  ensure(request.authorityReference?.trim(), "An authority or ordinance reference is required.", 400);
  const evidence = await Document.findAll({ where: { entityRef: "budgetControlRequest", entityId: request.id }, attributes: ["id", "checksum", "filename"], order: [["id", "ASC"]], transaction });
  ensure(evidence.length > 0, "Attach the supporting authority and financial documents before submitting.", 400);
  return evidence.map((doc) => ({ id: doc.id, checksum: doc.checksum, filename: doc.filename }));
};

export const validateBudgetIntent = async (request, transaction) => {
  if (["allocation", "closeout", "transfer"].includes(request.kind)) {
    const source = await approvedProject(request.sourceProjectId, transaction, { closed: request.kind !== "allocation" });
    ensure(request.fiscalYear === source.entry.fiscalYear, "The request fiscal year must match its source project.");
    const fields = { sourceAppropriationId: source.appropriation.id, fund: source.appropriation.fund, expenseClass: source.appropriation.expenseClass, sector: source.sector };
    if (request.kind === "transfer") {
      const destination = await approvedProject(request.destinationProjectId, transaction);
      ensure(destination.entry.id !== source.entry.id && destination.entry.fiscalYear === request.fiscalYear, "Select a different destination project in the same fiscal year.");
      fields.destinationAppropriationId = destination.appropriation.id;
    }
    await request.update(fields, { transaction });
  } else if (request.kind === "correction") {
    const source = await Appropriation.findByPk(request.sourceAppropriationId, { transaction });
    ensure(source && source.status !== "closed", "Select an existing open appropriation for correction.");
    ensure(source.fiscalYear === request.fiscalYear, "A correction must retain its appropriation fiscal year.");
    await request.update({ fund: request.payload.fund || source.fund, expenseClass: request.payload.expenseClass || source.expenseClass }, { transaction });
  } else if (request.kind === "migration") ensure(!request.sourceAppropriationId, "Use a correction request to amend an existing appropriation.");
};

const approvedProject = async (id, transaction, { closed = false } = {}) => {
  const entry = await AppEntry.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(entry, "The project does not exist.", 404);
  ensure(entry.planCycle === "final" && (["approved", "locked"].includes(entry.status) || (closed && entry.status === "cancelled")), "Select a final approved procurement project.");
  const appropriation = await Appropriation.findByPk(entry.appropriationId, { transaction });
  ensure(appropriation?.status === "enacted" && appropriation.fiscalYear === entry.fiscalYear, "The project needs an enacted appropriation for its fiscal year.");
  const aip = entry.aipEntryId ? await AipEntry.findByPk(entry.aipEntryId, { transaction }) : null;
  const goal = aip?.developmentGoalId ? await DevelopmentGoal.findByPk(aip.developmentGoalId, { transaction }) : null;
  return { entry, appropriation, sector: goal?.sector ?? null };
};

export const transferableProjectBalance = async (appEntryId, { transaction } = {}) => {
  const closeouts = await BudgetControlRequest.findAll({ where: { sourceProjectId: appEntryId, kind: "closeout", status: "approved", classification: { [Op.in]: transferable } }, transaction });
  const transfers = Number(await BudgetControlRequest.sum("amount", { where: { sourceProjectId: appEntryId, kind: "transfer", status: "approved" }, transaction })) || 0;
  const position = await projectFinancialPosition(appEntryId, { transaction });
  if (!position) return 0;
  const eligible = closeouts.filter((row) => row.classification !== "unusedAppropriation" || row.payload?.reuseAuthorized === true);
  return Math.max(0, Math.min(difference(sumMoney(eligible, row => row.amount), transfers), difference(position.allocated, Math.max(position.obligated, position.grossExpenses))));
};

const correctAppropriation = async (request, transaction) => {
  const source = request.sourceAppropriationId ? await Appropriation.findByPk(request.sourceAppropriationId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
  ensure(request.kind !== "correction" || source, "Select the appropriation being corrected.");
  ensure(!source || source.status !== "closed", "A closed appropriation cannot be corrected through this process.");
  const input = { ...(source ? recordState(source) : {}), ...request.payload, amount: money(request.amount), fiscalYear: request.fiscalYear };
  ensure(input.title?.trim() && input.ordinanceNo?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.ordinanceDate ?? ""), "The enacted ordinance number, date, and appropriation title are required.", 400);
  const ordinanceDate = new Date(`${input.ordinanceDate}T00:00:00+08:00`);
  ensure(Number.isFinite(ordinanceDate.getTime()) && new Date(ordinanceDate.getTime() + 8 * 3600000).toISOString().slice(0, 10) === input.ordinanceDate && ordinanceDate <= new Date(), "Record a valid enacted ordinance date that is not in the future.", 400);
  ensure(FUNDS.includes(input.fund) && EXPENSE_CLASSES.includes(input.expenseClass) && APPROPRIATION_TYPES.includes(input.type) && input.type !== "reenacted", "Choose a valid fund, expense class and appropriation type.", 400);
  ensure(input.amount > 0, "The authorized appropriation amount must be positive.", 400);
  if (input.departmentId) await activeDepartment(input.departmentId, { transaction });
  if (source) {
    const commitments = await availableFor(source.id, { transaction });
    const reserved = await allocationBalanceFor(source.id, { transaction });
    const allocations = reserved.allocated;
    ensure(cents(input.amount) >= cents(reserved.reserved), "The correction would remove funds already allocated or obligated.");
    const linkedPlans = await AppEntry.count({ where: { appropriationId: source.id }, transaction });
    if (commitments.obligated || allocations || linkedPlans) {
      for (const field of ["fiscalYear", "fund", "expenseClass", "departmentId", "type"]) ensure(String(input[field]) === String(source[field]), "The funding identity of a used appropriation cannot be reassigned.");
    }
  } else {
    const duplicate = await Appropriation.findOne({ where: { fiscalYear: input.fiscalYear, ordinanceNo: input.ordinanceNo.trim(), fund: input.fund, expenseClass: input.expenseClass, departmentId: input.departmentId || null, title: input.title.trim(), papCode: input.papCode || null, uacsCode: input.uacsCode || null, status: { [Op.in]: ["enacted", "closed"] } }, transaction });
    ensure(!duplicate, "This ordinance line is already recorded; use a documented correction instead of duplicating its authority.");
  }
  const values = Object.fromEntries(["fiscalYear", "ordinanceNo", "ordinanceDate", "title", "amount", "fund", "expenseClass", "type", "departmentId", "papCode", "uacsCode", "remarks"].map((key) => [key, input[key] ?? null]));
  const before = source ? recordState(source) : null;
  const line = source ? await source.update({ ...values, status: "enacted" }, { transaction }) : await Appropriation.create({ ...values, status: "enacted", recordedById: request.requesterId }, { transaction });
  await request.update({ sourceAppropriationId: line.id, fund: line.fund, expenseClass: line.expenseClass }, { transaction });
  return { before: { appropriation: before }, after: { appropriation: recordState(line) } };
};

// Reenactment records selected eligible expenditure, not every MOOE line.
// RA 7160 s.323 also requires a review of recurring income and the 90-day lapse.
const executeReenactment = async (request, transaction) => {
  const now = new Date();
  ensure(request.fiscalYear <= fiscalYearFilter(undefined, now), "Future fiscal years cannot be reenacted.");
  ensure(now.getTime() >= Date.UTC(request.fiscalYear, 0, 1) - 8 * 3600000 + 90 * 86400000, "Reenactment requires the ninety-day period from the start of the fiscal year to have elapsed.");
  ensure(!await ExecutiveBudget.count({ where: { fiscalYear: request.fiscalYear, type: "annual", status: { [Op.in]: ["enacted", "pendingProvincialReview"] } }, transaction }), "The annual ordinance has already been enacted; complete its release through budget preparation.");
  ensure(!await Appropriation.count({ where: { fiscalYear: request.fiscalYear, [Op.or]: [{ status: "enacted", type: "annual" }, { type: "reenacted" }] }, transaction }), "Annual or reenacted authority already exists for this fiscal year.");
  const selected = request.payload.reenactmentLines;
  ensure(Array.isArray(selected) && selected.length > 0, "Identify each eligible prior-year line and the amount being reenacted.", 400);
  ensure(request.payload.incomeEstimatesReviewed === true && Number.isFinite(Number(request.payload.recurringIncomeAmount)) && Number(request.payload.recurringIncomeAmount) > 0, "Confirm the Treasurer's reviewed recurring-income estimate, excluding nonrecurring sources.", 400);
  const ids = selected.map(row => Number(row.sourceAppropriationId));
  ensure(ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length, "Each source appropriation must be selected once.", 400);
  const source = await Appropriation.findAll({ where: { id: ids, fiscalYear: request.fiscalYear - 1, status: "enacted", type: { [Op.in]: ["annual", "supplemental"] } }, order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
  ensure(source.length === selected.length, "Only enacted annual or supplemental appropriations from the preceding fiscal year are eligible.");
  let total = 0;
  const after = [];
  for (const row of source) {
    const selection = selected.find(item => Number(item.sourceAppropriationId) === row.id);
    ensure(["existingSalaries", "statutoryContractual", "essentialOperations"].includes(selection.eligibility), "Record the statutory eligibility of every reenacted line.", 400);
    ensure(row.expenseClass !== "capitalOutlay" && (selection.eligibility !== "existingSalaries" || row.expenseClass === "personalServices"), "New capital outlay and incorrectly classified salaries cannot be reenacted.");
    ensure(Number.isFinite(Number(selection.amount)) && Number(selection.amount) > 0 && Number(selection.amount) <= Number(row.amount), "The reenacted amount must be positive and cannot exceed its prior-year authority.", 400);
    const amount = money(selection.amount);
    ensure(cents(amount) > 0 && cents(amount) <= cents(row.amount), "The reenacted amount must be positive and cannot exceed its prior-year authority.");
    total += cents(amount);
    const { id, createdAt, updatedAt, executiveBudgetId, budgetProposalLineId, ...values } = recordState(row);
    void id; void createdAt; void updatedAt; void executiveBudgetId; void budgetProposalLineId;
    after.push(recordState(await Appropriation.create({ ...values, amount, fiscalYear: request.fiscalYear, type: "reenacted", ordinanceNo: request.authorityReference, remarks: `${request.reason}\nPrior appropriation #${row.id}; approved budget request #${request.id}; eligibility ${selection.eligibility}.`, recordedById: request.requesterId }, { transaction })));
  }
  ensure(total <= cents(request.payload.recurringIncomeAmount), "The selected reenactment exceeds reviewed recurring income; obtain the authorized reductions first.");
  await request.update({ amount: total / 100 }, { transaction });
  return { before: { sourceAppropriations: source.map(recordState) }, after: { appropriations: after, recurringIncomeAmount: money(request.payload.recurringIncomeAmount) } };
};

// Closeout can release an unused ORS balance only when all procurement has
// ended and recorded supplier invoices are settled. Withholdings remain in the
// gross expenditure and therefore cannot become transferable funds.
const settleCloseoutObligations = async (source, request, transaction) => {
  const prs = await PrHeader.findAll({ where: { appEntryId: source.entry.id }, transaction, lock: transaction.LOCK.UPDATE });
  const rfqs = await Rfq.findAll({ where: { [Op.or]: [{ appEntryId: source.entry.id }, ...(prs.length ? [{ prHeaderId: prs.map(row => row.id) }] : [])] }, transaction, lock: transaction.LOCK.UPDATE });
  const awards = rfqs.length ? await Award.findAll({ where: { rfqId: rfqs.map(row => row.id) }, transaction }) : [];
  const contracts = awards.length ? await Contract.findAll({ where: { awardId: awards.map(row => row.id) }, transaction, lock: transaction.LOCK.UPDATE }) : [];
  ensure(contracts.every(row => ["completed", "cancelled", "rescinded"].includes(row.status)), "Complete or formally terminate every contract before financial closeout.");
  ensure(rfqs.every(row => row.status === "cancelled" || (row.status === "failed" && source.entry.status === "cancelled") || (row.status === "awarded" && awards.some(award => award.rfqId === row.id && contracts.some(contract => contract.awardId === award.id)))), "Resolve active procurement and rebidding before financial closeout.");
  ensure(prs.every(row => ["draft", "returned"].includes(row.status) || rfqs.some(rfq => rfq.prHeaderId === row.id) || source.entry.status === "cancelled"), "An approved or pending requisition still has unresolved procurement.");
  const invoices = contracts.length ? await Invoice.findAll({ where: { contractId: contracts.map(row => row.id) }, transaction }) : [];
  ensure(!invoices.some(row => ["submitted", "certified", "returned"].includes(row.status)), "Resolve pending, returned and unpaid supplier invoices before financial closeout.");
  for (const contract of contracts.filter(row => row.status === "completed")) {
    ensure(cents(sumMoney(invoices.filter(row => row.contractId === contract.id && row.status === "paid"), row => row.amount)) >= cents(contract.amount), "The completed contract's gross amount must be fully accounted for in settled invoices before recognizing its savings.");
  }
  const obligations = prs.length ? await Obligation.findAll({ where: { prHeaderId: prs.map(row => row.id), status: "obligated" }, order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE }) : [];
  const before = obligations.map(recordState);
  if (request.payload.cancelExcessObligations === true) {
    for (const pr of prs) {
      const rfqIds = rfqs.filter(row => row.prHeaderId === pr.id).map(row => row.id);
      const awardIds = awards.filter(row => rfqIds.includes(row.rfqId)).map(row => row.id);
      const contractIds = contracts.filter(row => awardIds.includes(row.awardId)).map(row => row.id);
      let remaining = cents(sumMoney(invoices.filter(row => contractIds.includes(row.contractId) && row.status === "paid"), row => row.amount));
      const rows = obligations.filter(row => row.prHeaderId === pr.id);
      ensure(remaining <= rows.reduce((sum, row) => sum + cents(row.amount), 0), "Recorded expenditure exceeds its ORS; correct the obligation before closeout.");
      for (const row of rows) {
        const retained = Math.min(remaining, cents(row.amount)); remaining -= retained;
        if (retained < cents(row.amount)) await row.update({ amount: retained / 100, ...(retained === 0 ? { status: "cancelled", cancelledAt: new Date() } : {}), cancellationReason: `Approved financial closeout #${request.id}: ${request.reason}` }, { transaction });
      }
    }
  }
  return { before, after: obligations.map(recordState), contracts };
};

export const executeBudgetControl = async (request, actor, transaction) => {
  if (["correction", "migration"].includes(request.kind)) return correctAppropriation(request, transaction);
  if (request.kind === "reenactment") return executeReenactment(request, transaction);
  const source = await approvedProject(request.sourceProjectId, transaction, { closed: request.kind !== "allocation" });
  ensure(request.fiscalYear === source.entry.fiscalYear, "The request fiscal year must match the project appropriation.");
  ensure(request.sourceAppropriationId === source.appropriation.id, "The project's funding authority changed after submission. Prepare a new request against the current appropriation.");
  await request.update({ sourceAppropriationId: source.appropriation.id, fund: source.appropriation.fund, expenseClass: source.appropriation.expenseClass, sector: source.sector }, { transaction });
  let allocation = await ProjectAllocation.findOne({ where: { appEntryId: source.entry.id }, transaction, lock: transaction.LOCK.UPDATE });
  let position = await projectFinancialPosition(source.entry.id, { transaction });
  if (request.kind === "allocation") {
    ensure(!allocation, "This project already has an approved allocation; use an authorized transfer to change it.");
    ensure(cents(request.amount) <= cents(source.entry.abc), "The allocation exceeds the approved procurement plan. Amend the plan through its approval process first.");
    const balance = await allocationBalanceFor(source.appropriation.id, { transaction });
    const reserved = Math.max(position.obligated, position.grossExpenses, position.certifiedGross);
    ensure(cents(request.amount) >= cents(reserved), "The approved allocation must cover the project's existing obligations and expenses.");
    ensure(cents(request.amount) <= cents(balance.unallocatedAvailable) + cents(reserved), "The appropriation does not have enough unallocated funds.");
    allocation = await ProjectAllocation.create({ appEntryId: source.entry.id, appropriationId: source.appropriation.id, fiscalYear: request.fiscalYear, amount: request.amount, approvedById: actor.id, approvedAt: new Date(), sourceRequestId: request.id }, { transaction });
    return { before: { project: position, appropriation: balance }, after: { project: await projectFinancialPosition(source.entry.id, { transaction }), allocation: recordState(allocation), appropriation: await allocationBalanceFor(source.appropriation.id, { transaction }) } };
  }
  ensure(allocation, "Record and approve the project allocation before its closeout or transfer.");
  if (request.kind === "closeout") {
    ensure(allocation.status === "active", "This project already has an approved financial closeout.");
    ensure(CLOSEOUT_CLASSIFICATIONS.includes(request.classification), "Select the proper closeout classification.", 400);
    ensure(request.payload.finalAccountsConfirmed === true && request.payload.liabilitiesReviewed === true, "Confirm final accounts and outstanding liabilities before closeout.");
    const originalPosition = position;
    const obligations = await settleCloseoutObligations(source, request, transaction);
    if (request.classification === "contractSavings") ensure(obligations.contracts.some(row => row.status === "completed"), "Contract savings require a completed contract and its final accounts; classify unused appropriation separately.");
    if (request.classification === "cancelledObligation") ensure(obligations.before.some((row, index) => cents(row.amount) > cents(obligations.after[index].amount)), "Cancelled-obligation classification requires an approved release of excess ORS amounts.");
    position = await projectFinancialPosition(source.entry.id, { transaction });
    const free = Math.max(0, difference(position.allocated, Math.max(position.obligated, position.grossExpenses)));
    if (request.classification === "outstandingRetention") {
      ensure(free === 0, "Classify the uncommitted balance separately; retention cannot hide unused funds.");
      ensure(cents(request.amount) === cents(position.outstandingRetention ?? position.retention), "Record the full outstanding retention balance.");
    }
    else ensure(money(request.amount) === free, `Classify the full uncommitted balance (${free.toFixed(2)}). Obligations, taxes and retention remain reserved.`);
    ensure(position.unpaid <= 0 || ["unusedAppropriation", "outstandingRetention", "other"].includes(request.classification), "Resolve or explicitly retain outstanding obligations before recognizing savings or reverted funds.");
    await allocation.update({ status: "closed" }, { transaction });
    // The controller persists the approval immediately after this calculation
    // in the same transaction. Capture the resulting approved position rather
    // than freezing the still-submitted request's savings and closeout flags.
    const approvedPosition = { ...position, financialCloseoutApproved: true,
      recognizedSavings: sumMoney([position.recognizedSavings, request.classification === "contractSavings" ? request.amount : 0], value => value) };
    return { before: { project: originalPosition, obligations: obligations.before, allocation: { ...recordState(allocation), status: "active" } }, after: { project: approvedPosition, obligations: obligations.after, allocation: recordState(allocation), classification: request.classification, classifiedAmount: Number(request.amount), transferable: transferable.includes(request.classification) && (request.classification !== "unusedAppropriation" || request.payload.reuseAuthorized === true), retainedLiabilities: { unpaid: position.unpaid, outstandingRetention: position.outstandingRetention ?? position.retention, taxesAwaitingRemittance: position.taxesAwaitingRemittance ?? position.taxesWithheld } } };
  }
  ensure(request.kind === "transfer", "Unknown budget action.", 400);
  ensure(request.payload.savingsAuthorityConfirmed === true, "Confirm that the attached ordinance authorizes savings augmentation for these specific items.");
  ensure(source.entry.id !== request.destinationProjectId, "A transfer requires different source and destination projects.");
  ensure(allocation.status === "closed", "Approve the source project's financial closeout before reusing its funds.");
  const destination = await approvedProject(request.destinationProjectId, transaction);
  ensure(request.destinationAppropriationId === destination.appropriation.id, "The destination funding authority changed after submission. Prepare a new request against the current appropriation.");
  const destAllocation = await ProjectAllocation.findOne({ where: { appEntryId: destination.entry.id }, transaction, lock: transaction.LOCK.UPDATE });
  ensure(destAllocation?.status === "active", "The destination needs an existing active approved allocation.");
  ensure(cents(destAllocation.amount) + cents(request.amount) <= cents(destination.entry.abc), "The destination allocation would exceed its approved procurement plan; amend the plan first.");
  for (const key of ["fiscalYear", "fund", "expenseClass", "departmentId"]) ensure(source.appropriation[key] === destination.appropriation[key], "This transfer is outside the permitted fiscal year, fund, expense class or office. Use the applicable formal budget ordinance process.");
  ensure(source.sector && source.sector === destination.sector, "Transfers require the same verified development sector; unrelated or unidentified sectors cannot exchange funds.");
  const approvedAvailable = await transferableProjectBalance(source.entry.id, { transaction });
  ensure(Number(request.amount) <= approvedAvailable, "The source does not have enough approved transferable funds.");
  const before = { source: position, destination: await projectFinancialPosition(destination.entry.id, { transaction }), sourceAppropriation: recordState(source.appropriation), destinationAppropriation: recordState(destination.appropriation), approvedAvailable };
  await allocation.update({ amount: money(Number(allocation.amount) - Number(request.amount)) }, { transaction });
  await destAllocation.update({ amount: money(Number(destAllocation.amount) + Number(request.amount)) }, { transaction });
  if (source.appropriation.id !== destination.appropriation.id) {
    await source.appropriation.update({ amount: money(Number(source.appropriation.amount) - Number(request.amount)) }, { transaction });
    await destination.appropriation.update({ amount: money(Number(destination.appropriation.amount) + Number(request.amount)) }, { transaction });
  }
  await request.update({ destinationAppropriationId: destination.appropriation.id }, { transaction });
  return { before, after: { source: await projectFinancialPosition(source.entry.id, { transaction }), destination: await projectFinancialPosition(destination.entry.id, { transaction }), sourceAppropriation: recordState(source.appropriation), destinationAppropriation: recordState(destination.appropriation), approvedAvailable: money(approvedAvailable - Number(request.amount)) } };
};
