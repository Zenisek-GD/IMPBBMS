import { Op } from "sequelize";
import {
  ExecutiveBudget,
  BudgetProposal,
  BudgetProposalLine,
} from "../models/budgetPreparationModel.js";
import {
  Appropriation,
  FUNDS,
  FUND_LABELS,
  EXPENSE_CLASSES,
  EXPENSE_CLASS_LABELS,
} from "../models/appropriationModel.js";
import { AipEntry, InvestmentProgram } from "../models/investmentProgramModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { proposalsEditableIn, PROPOSAL_DECISION_STAGES, permissionForTransition } from "../services/budgetPreparationWorkflow.js";
import { withAuditTransaction, AUDIT_ACTIONS } from "../services/auditLog.js";
import { notifyByPermission, notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";

// Step 6 of the municipal process: each office prepares what it is asking for,
// built from its slice of the investment program. Steps 7 and 11 also live
// here, because reviewing and finalising a proposal is work done *on* the
// proposal — the executive budget's own state machine moves the whole set.

import { actorAudit, workflowError } from '../services/workflowSupport.js';
import { lockBudget, lockProposal, returnBudgetForRevision, snapshot } from '../services/budgetRecordSupport.js';

const num = (value) => (value === null || value === undefined ? 0 : Number(value));
const peso = (value) => `₱${num(value).toLocaleString()}`;

const proposalIncludes = {
  include: [
    { model: Department, as: "office" },
    { model: User, as: "preparedBy", attributes: ["id", "name"] },
    {
      model: BudgetProposalLine,
      as: "lines",
      include: [{ model: AipEntry, as: "aipEntry" }],
    },
    { model: ExecutiveBudget, as: "budget" },
  ],
};

const serializeLine = (line) => ({
  id: line.id,
  title: line.title,
  expenseClass: line.expenseClass,
  expenseClassLabel: EXPENSE_CLASS_LABELS[line.expenseClass],
  fund: line.fund,
  fundLabel: FUND_LABELS[line.fund],
  papCode: line.papCode,
  uacsCode: line.uacsCode,
  proposedAmount: num(line.proposedAmount),
  recommendedAmount: line.recommendedAmount === null ? null : num(line.recommendedAmount),
  finalAmount: line.finalAmount === null ? null : num(line.finalAmount),
  remarks: line.remarks,
  aipEntryId: line.aipEntryId,
  isDevelopmentFund: Boolean(line.isDevelopmentFund),
  isLdrrmf: Boolean(line.isLdrrmf),
  aipEntryTitle: line.aipEntry?.title ?? null,
  aipEstimatedCost: line.aipEntry ? num(line.aipEntry.estimatedCost) : null,
});

const serialize = (proposal) => {
  const lines = (proposal.lines ?? []).map(serializeLine);
  const pct = proposal.budget?.ceilingGrowthPct;
  const previous = proposal.previousYearAppropriation;
  const ceiling =
    previous !== null && previous !== undefined && pct !== null && pct !== undefined
      ? num(previous) * (1 + num(pct) / 100)
      : null;

  return {
    id: proposal.id,
    executiveBudgetId: proposal.executiveBudgetId,
    budgetTitle: proposal.budget?.title ?? null,
    budgetStatus: proposal.budget?.status ?? null,
    fiscalYear: proposal.fiscalYear,
    status: proposal.status,
    departmentId: proposal.departmentId,
    departmentCode: proposal.office?.code ?? null,
    departmentName: proposal.office?.name ?? null,
    proposedTotal: num(proposal.proposedTotal),
    recommendedTotal: num(proposal.recommendedTotal),
    finalTotal: num(proposal.finalTotal),
    previousYearAppropriation: previous === null || previous === undefined ? null : num(previous),
    growthCeiling: ceiling === null ? null : Number(ceiling.toFixed(2)),
    exceedsCeiling: ceiling !== null && num(proposal.proposedTotal) > ceiling,
    ceilingGrowthPct: pct === null || pct === undefined ? null : num(pct),
    justification: proposal.justification,
    reviewNotes: proposal.reviewNotes,
    returnRemarks: proposal.returnRemarks,
    submittedAt: proposal.submittedAt,
    preparedByName: proposal.preparedBy?.name ?? null,
    editable: proposal.status === "draft" && proposalsEditableIn(proposal.budget?.status),
    lines,
  };
};

// What this office was appropriated in the previous fiscal year. Looked up
// rather than typed, because the growth ceiling is only credible if the base
// figure comes from the register rather than from the office asking for more.
const previousAppropriationFor = async (departmentId, fiscalYear, transaction) => {
  const total = await Appropriation.sum("amount", {
    transaction,
    where: { departmentId, fiscalYear: fiscalYear - 1, status: { [Op.in]: ["enacted", "closed"] } },
  });
  return total === null || total === undefined ? null : Number(total);
};

const computeLines = async (rawLines, { fiscalYear, transaction }) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { error: "A proposal needs at least one line." };
  }

  const lines = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") return { error: "Every line must be a record." };
    if (!raw.title?.trim()) return { error: "Every line needs a title." };

    const amount = Number(raw.proposedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: `The amount for "${raw.title}" must be greater than 0.` };
    }
    if (raw.expenseClass && !EXPENSE_CLASSES.includes(raw.expenseClass)) {
      return { error: `Unknown expense class on "${raw.title}".` };
    }
    if (raw.fund && !FUNDS.includes(raw.fund)) return { error: `Unknown fund on "${raw.title}".` };

    let aipEntryId = null;
    if (raw.aipEntryId) {
      const entry = await AipEntry.findByPk(Number(raw.aipEntryId), {
        include: [{ model: InvestmentProgram, as: "program" }],
        transaction,
      });
      if (!entry) return { error: `The investment program entry cited by "${raw.title}" does not exist.` };
      if (entry.program?.fiscalYear !== fiscalYear) {
        return {
          error: `"${raw.title}" cites an investment program entry from ${entry.program?.fiscalYear}, not ${fiscalYear}.`,
        };
      }
      if (entry.program?.status !== "adopted") {
        return { error: `"${raw.title}" cites an entry from an investment program that has not been adopted.` };
      }
      if (entry.status !== "planned") {
        return { error: `"${raw.title}" cites an investment program entry that has been dropped.` };
      }
      aipEntryId = entry.id;
    }

    lines.push({
      ...(raw.id != null ? { id: Number(raw.id) } : {}),
      isDevelopmentFund: raw.isDevelopmentFund === true,
      isLdrrmf: raw.isLdrrmf === true,
      title: raw.title.trim(),
      expenseClass: raw.expenseClass ?? "mooe",
      fund: raw.fund ?? "generalFund",
      papCode: raw.papCode?.trim() || null,
      uacsCode: raw.uacsCode?.trim() || null,
      proposedAmount: amount,
      remarks: raw.remarks?.trim() || null,
      aipEntryId,
    });
  }

  return { lines, total: Number(lines.reduce((sum, line) => sum + line.proposedAmount, 0).toFixed(2)) };
};

export const listProposals = async (req, res) => {
  const where = {};
  if (Number.isFinite(Number(req.query.executiveBudgetId))) {
    where.executiveBudgetId = Number(req.query.executiveBudgetId);
  }
  if (Number.isFinite(Number(req.query.fiscalYear))) where.fiscalYear = Number(req.query.fiscalYear);
  if (req.query.status) where.status = req.query.status;

  // An office sees its own proposal; the bodies that act on the whole set see
  // all of them. Same shape as the requisition queue.
  const canSeeAll = [
    "budget.prepareExecutive",
    "budget.recordProvincialReview",
    "budget.reviewProposal",
    "budget.consolidateProposals",
    "budget.conductForum",
    "budget.conductHearing",
    "budget.finaliseExecutive",
    "budget.approveExecutive",
    "budget.enactOrdinance",
    "audit.viewAll",
  ].some((permission) => req.permissions.has(permission));

  if (!canSeeAll) {
    where.departmentId = req.currentUser.departmentId ?? -1;
  }

  const proposals = await BudgetProposal.findAll({
    where,
    ...proposalIncludes,
    order: [["fiscalYear", "DESC"], ["id", "ASC"]],
  });

  res.json(proposals.map(serialize));
};

const requireEditor = (req, proposal) => {
  if (!req.permissions.has('budget.prepareExecutive') &&
      (!req.permissions.has('budget.proposeBudget') || (proposal && proposal.departmentId !== req.currentUser.departmentId))) {
    throw workflowError("You may only prepare your own office's proposal.", 403);
  }
};
const requireEditable = (budget, proposal) => {
  if (!proposalsEditableIn(budget.status) || (proposal && proposal.status !== 'draft')) {
    throw workflowError('This proposal is no longer editable. Return the budget for revision first.');
  }
};
const auditProposal = (audit, req, proposal, actionType, beforeState, summary) => audit(actorAudit(req, {
  actionType, entityRef: 'budgetProposal', entityId: proposal.id,
  summary, beforeState, afterState: snapshot(proposal),
}));

export const createProposal = async (req, res) => {
  requireEditor(req);
  const created = await withAuditTransaction(async (transaction, audit) => {
    const budget = await lockBudget(Number(req.body.executiveBudgetId), transaction);
    requireEditable(budget);
    const departmentId = req.permissions.has('budget.prepareExecutive')
      ? Number(req.body.departmentId ?? req.currentUser.departmentId) : req.currentUser.departmentId;
    if (!departmentId) throw workflowError('An office is required for this proposal.', 400);
    const department = await Department.findByPk(departmentId, { transaction });
    if (!department) throw workflowError('That office does not exist.', 400);
    if (budget.proposals.some((p) => p.departmentId === departmentId)) {
      throw workflowError('This office already has a proposal for this budget. Edit the existing proposal.');
    }
    const computed = await computeLines(req.body.lines, { fiscalYear: budget.fiscalYear, transaction });
    if (computed.error) throw workflowError(computed.error, 400);
    if (computed.lines.some((line) => line.id != null)) throw workflowError('New proposal lines cannot supply existing IDs.', 400);
    const proposal = await BudgetProposal.create({
      executiveBudgetId: budget.id, departmentId, fiscalYear: budget.fiscalYear,
      status: 'draft', proposedTotal: computed.total,
      previousYearAppropriation: await previousAppropriationFor(departmentId, budget.fiscalYear, transaction),
      justification: req.body.justification?.trim() || null, preparedById: req.currentUser.id,
    }, { transaction });
    proposal.setDataValue('lines', await BudgetProposalLine.bulkCreate(computed.lines.map((line) => ({ ...line, budgetProposalId: proposal.id })), { transaction }));
    await auditProposal(audit, req, proposal, 'budget.proposal.created', null, `Proposal opened for FY ${budget.fiscalYear}`);
    return proposal;
  });
  res.status(201).json(serialize(await BudgetProposal.findByPk(created.id, proposalIncludes)));
};

export const updateProposal = async (req, res) => {
  const updated = await withAuditTransaction(async (transaction, audit) => {
    const { budget, proposal } = await lockProposal(req.params.id, transaction);
    requireEditor(req, proposal);
    requireEditable(budget, proposal);
    const before = snapshot(proposal);
    let computed;
    if (req.body.lines !== undefined) {
      computed = await computeLines(req.body.lines, { fiscalYear: budget.fiscalYear, transaction });
      if (computed.error) throw workflowError(computed.error, 400);
      const existing = new Map(proposal.lines.map((line) => [line.id, line]));
      const seen = new Set();
      for (const line of computed.lines) {
        if (line.id != null && (!existing.has(line.id) || seen.has(line.id))) {
          throw workflowError('Line IDs must be unique and belong to this proposal.', 400);
        }
        if (line.id != null) seen.add(line.id);
      }
      const removed = proposal.lines.filter((line) => !seen.has(line.id));
      if (removed.length && await Appropriation.count({ where: { budgetProposalLineId: removed.map((line) => line.id) }, transaction })) {
        throw workflowError('An appropriated proposal line cannot be removed.');
      }
      for (const line of removed) await line.destroy({ transaction });
      const saved = [];
      for (const values of computed.lines) {
        const line = values.id != null ? existing.get(values.id) : null;
        saved.push(line ? await line.update(values, { transaction }) : await BudgetProposalLine.create({ ...values, budgetProposalId: proposal.id }, { transaction }));
      }
      proposal.setDataValue('lines', saved);
      proposal.lines = saved;
    }
    await proposal.update({
      justification: req.body.justification?.trim() ?? proposal.justification,
      ...(computed ? { proposedTotal: computed.total } : {}),
    }, { transaction });
    await auditProposal(audit, req, proposal, 'budget.proposal.updated', before, `Draft proposal revised for FY ${proposal.fiscalYear}`);
    return proposal;
  });
  res.json(serialize(await BudgetProposal.findByPk(updated.id, proposalIncludes)));
};

export const submitProposal = async (req, res) => {
  const submitted = await withAuditTransaction(async (transaction, audit) => {
    const { budget, proposal } = await lockProposal(req.params.id, transaction);
    requireEditor(req, proposal);
    requireEditable(budget, proposal);
    if (!proposal.lines.length) throw workflowError('An empty proposal cannot be submitted.');
    const pct = budget.ceilingGrowthPct;
    if (pct != null && proposal.previousYearAppropriation != null) {
      const ceiling = num(proposal.previousYearAppropriation) * (1 + num(pct) / 100);
      if (num(proposal.proposedTotal) > ceiling && !proposal.justification?.trim()) {
        throw workflowError('This proposal exceeds the growth ceiling. Record a justification before submitting.', 409, { ceiling });
      }
    }
    const before = snapshot(proposal);
    await proposal.update({ status: 'submitted', submittedAt: new Date(), returnRemarks: null }, { transaction });
    await auditProposal(audit, req, proposal, AUDIT_ACTIONS.BUDGET_PROPOSAL_SUBMITTED, before, `Proposal submitted for FY ${proposal.fiscalYear}`);
    return proposal;
  });
  await notifyByPermission('budget.reviewProposal', {
    type: NOTIFICATION_EVENTS.BUDGET_STATUS, title: `Budget proposal received ? FY ${submitted.fiscalYear}`,
    body: `${peso(submitted.proposedTotal)} proposed.`, link: '/budget/preparation',
    refEntity: 'budgetProposal', refId: submitted.id, severity: 'info',
  });
  res.json(serialize(await BudgetProposal.findByPk(submitted.id, proposalIncludes)));
};

const applyAmounts = async (req, res, { action, field, totalField, actionLabel }) => {
  const updated = await withAuditTransaction(async (transaction, audit) => {
    const { budget, proposal } = await lockProposal(req.params.id, transaction);
    const stage = PROPOSAL_DECISION_STAGES[action];
    if (!req.permissions.has(stage.permission)) throw workflowError('You do not have permission to perform this action.', 403);
    if (budget.status !== stage.budget || proposal.status !== stage.proposal) {
      throw workflowError(`This decision is only allowed at the ${stage.budget} stage on a ${stage.proposal} proposal.`);
    }
    const amounts = req.body.amounts;
    if (!Array.isArray(amounts) || !amounts.length) throw workflowError('Provide an amount for each line.', 400);
    const byId = new Map(proposal.lines.map((line) => [line.id, line]));
    const seen = new Set();
    const updates = [];
    for (const entry of amounts) {
      const line = byId.get(Number(entry?.lineId));
      if (!line || seen.has(line.id)) throw workflowError('Every line must appear exactly once and belong to this proposal.', 400);
      seen.add(line.id);
      const amount = Number(entry.amount);
      if (entry.amount == null || String(entry.amount).trim() === '' || !Number.isFinite(amount) || amount < 0 || amount > num(line.proposedAmount)) {
        throw workflowError(`The amount for "${line.title}" must be explicitly zero or greater, and cannot exceed the proposed amount.`, 400);
      }
      updates.push({ line, amount: Number(amount.toFixed(2)), remarks: entry.remarks });
    }
    if (seen.size !== byId.size) throw workflowError('Provide an amount for every proposal line.', 400);
    const before = snapshot(proposal);
    for (const update of updates) {
      await update.line.update({ [field]: update.amount, ...(update.remarks !== undefined ? { remarks: update.remarks?.trim() || null } : {}) }, { transaction });
    }
    const total = Number(updates.reduce((sum, update) => sum + update.amount, 0).toFixed(2));
    await proposal.update({ [totalField]: total, ...(req.body.notes !== undefined ? { reviewNotes: req.body.notes?.trim() || null } : {}) }, { transaction });
    await auditProposal(audit, req, proposal, AUDIT_ACTIONS.BUDGET_PROPOSAL_REVIEWED, before, `${actionLabel}: ${peso(total)} for FY ${proposal.fiscalYear}`);
    return proposal;
  });
  if (updated.preparedById) await notifyUsers([updated.preparedById], {
    type: NOTIFICATION_EVENTS.BUDGET_STATUS, title: `${actionLabel} ? FY ${updated.fiscalYear}`,
    body: `${peso(updated.proposedTotal)} proposed, ${peso(updated[totalField])} carried forward.`,
    link: '/budget/preparation', refEntity: 'budgetProposal', refId: updated.id, severity: 'info',
  });
  res.json(serialize(await BudgetProposal.findByPk(updated.id, proposalIncludes)));
};

export const reviewProposal = (req, res) => applyAmounts(req, res, {
  action: 'review', field: 'recommendedAmount', totalField: 'recommendedTotal', actionLabel: 'Budget Council recommendation',
});
export const finaliseProposal = (req, res) => applyAmounts(req, res, {
  action: 'finalise', field: 'finalAmount', totalField: 'finalTotal', actionLabel: 'Final appropriation figure',
});

export const returnProposal = async (req, res) => {
  const returned = await withAuditTransaction(async (transaction, audit) => {
    const { budget, proposal } = await lockProposal(req.params.id, transaction);
    if (!['pendingMbcReview', 'pendingPlanningConsolidation'].includes(budget.status)) {
      throw workflowError('Proposals can only be returned during Budget Council review or planning consolidation.');
    }
    if (!req.permissions.has(permissionForTransition('return', budget.status))) {
      throw workflowError('Only the body currently reviewing this budget may return its proposals.', 403);
    }
    if (proposal.status === 'draft') throw workflowError('This proposal has not been submitted.');
    const remarks = req.body.remarks?.trim();
    if (!remarks) throw workflowError('Remarks are required when returning a proposal.', 400);
    const before = snapshot(budget), proposalBefore = snapshot(proposal);
    await returnBudgetForRevision(budget, remarks, transaction);
    await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.BUDGET_TRANSITION, entityRef: 'executiveBudget', entityId: budget.id,
      summary: 'Budget returned to reopen proposals and require renewed review', beforeState: before, afterState: snapshot(budget) }));
    await auditProposal(audit, req, proposal, 'budget.proposal.returned', proposalBefore, `Proposal returned: ${remarks}`);
    return proposal;
  });
  await notifyByPermission('budget.proposeBudget', {
    type: NOTIFICATION_EVENTS.BUDGET_STATUS, title: `FY ${returned.fiscalYear} budget reopened for revision`,
    body: `${req.body.remarks.trim()} Review and resubmit office proposals.`, link: '/budget/preparation',
    refEntity: 'executiveBudget', refId: returned.executiveBudgetId, severity: 'warning',
  });
  res.json(serialize(await BudgetProposal.findByPk(returned.id, proposalIncludes)));
};
