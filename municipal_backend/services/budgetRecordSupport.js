import { ExecutiveBudget, BudgetProposal, BudgetProposalLine, BudgetProceeding } from '../models/budgetPreparationModel.js';
import { Department } from '../models/departmentModel.js';
import { workflowError } from './workflowSupport.js';

export const snapshot = (record) => record ? JSON.parse(JSON.stringify(record.get({ plain: true }))) : null;

// Every budget writer takes the same parent lock before reading children.
// Explicit locking reads also see the latest committed state under MySQL RR.
export const lockBudget = async (id, transaction) => {
  const options = { transaction, lock: transaction.LOCK.UPDATE };
  const budget = await ExecutiveBudget.findByPk(id, options);
  if (!budget) throw workflowError('Budget not found.', 404);
  const proposals = await BudgetProposal.findAll({ ...options, where: { executiveBudgetId: budget.id }, order: [['id', 'ASC']] });
  for (const proposal of proposals) {
    proposal.lines = await BudgetProposalLine.findAll({ ...options, where: { budgetProposalId: proposal.id }, order: [['id', 'ASC']] });
    proposal.office = await Department.findByPk(proposal.departmentId, { transaction });
    proposal.setDataValue('lines', proposal.lines);
    proposal.setDataValue('office', proposal.office);
  }
  budget.setDataValue('proposals', proposals);
  budget.proposals = proposals;
  budget.proceedings = await BudgetProceeding.findAll({ ...options, where: { executiveBudgetId: budget.id }, order: [['id', 'ASC']] });
  budget.setDataValue('proceedings', budget.proceedings);
  return budget;
};

export const lockProposal = async (id, transaction) => {
  // Only the immutable parent identity is used from this discovery read.
  const identity = await BudgetProposal.findByPk(id, { attributes: ['executiveBudgetId'], transaction });
  if (!identity) throw workflowError('Proposal not found.', 404);
  const budget = await lockBudget(identity.executiveBudgetId, transaction);
  const proposal = budget.proposals.find((row) => row.id === Number(id));
  if (!proposal) throw workflowError('Proposal not found.', 404);
  return { budget, proposal };
};

// A return starts a fresh review cycle; historical decisions remain in the
// transaction's before snapshot and cannot approve subsequently edited lines.
export const returnBudgetForRevision = async (budget, remarks, transaction) => {
  await budget.update({
    status: 'returned', returnRemarks: remarks,
    mbcReviewedAt: null, consolidatedAt: null, forumHeldAt: null,
    hearingConcludedAt: null, finalisedAt: null, mayorApprovedAt: null,
    approvedById: null, ordinanceNo: null, ordinanceDate: null,
    sanggunianActedAt: null, provincialReviewOutcome: null,
    provincialReviewedAt: null, provincialRemarks: null, enactedAt: null,
    limitationFindings: null,
  }, { transaction });
  for (const proposal of budget.proposals) {
    await proposal.update({ status: 'draft', submittedAt: null, returnRemarks: remarks, recommendedTotal: 0, finalTotal: 0, reviewNotes: null }, { transaction });
    for (const line of proposal.lines) await line.update({ recommendedAmount: null, finalAmount: null }, { transaction });
  }
};
