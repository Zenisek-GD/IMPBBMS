import { apiClient } from './client'

// Budget preparation and authorisation: departmental proposals through the
// Municipal Budget Council, the Planning Office, the Local Finance Committee's
// forum and hearings, the Mayor, the Sangguniang Bayan and the provincial
// review — ending in appropriations the rest of the system can charge against.

export const fetchBudgetOptions = () =>
  apiClient.get('/budget-preparation/options').then((res) => res.data)

export const fetchBudgets = (params = {}) =>
  apiClient.get('/budget-preparation/budgets', { params }).then((res) => res.data)

export const fetchBudget = (id) =>
  apiClient.get(`/budget-preparation/budgets/${id}`).then((res) => res.data)

export const createBudget = (payload) =>
  apiClient.post('/budget-preparation/budgets', payload).then((res) => res.data)

export const transitionBudget = (id, action, payload = {}) =>
  apiClient.post(`/budget-preparation/budgets/${id}/transition`, { action, ...payload }).then((res) => res.data)

export const recordProceeding = (budgetId, payload) =>
  apiClient.post(`/budget-preparation/budgets/${budgetId}/proceedings`, payload).then((res) => res.data)

export const fetchProposals = (params = {}) =>
  apiClient.get('/budget-preparation/proposals', { params }).then((res) => res.data)

export const createProposal = (payload) =>
  apiClient.post('/budget-preparation/proposals', payload).then((res) => res.data)

export const updateProposal = (id, payload) =>
  apiClient.patch(`/budget-preparation/proposals/${id}`, payload).then((res) => res.data)

export const submitProposal = (id) =>
  apiClient.post(`/budget-preparation/proposals/${id}/submit`).then((res) => res.data)

export const reviewProposal = (id, payload) =>
  apiClient.post(`/budget-preparation/proposals/${id}/review`, payload).then((res) => res.data)

export const finaliseProposal = (id, payload) =>
  apiClient.post(`/budget-preparation/proposals/${id}/finalise`, payload).then((res) => res.data)

export const returnProposal = (id, remarks) =>
  apiClient.post(`/budget-preparation/proposals/${id}/return`, { remarks }).then((res) => res.data)

// ── The budget calendar, in order ────────────────────────────────────────────
// The list is the sequence: each entry names the body that acts, what the act
// is called, and which permission it needs. The stepper on the page reads it
// straight through, so adding a stage to the server's state machine and to this
// list is all the UI needs.
export const BUDGET_STAGES = [
  { key: 'draft', label: 'Proposals', body: 'Departments', action: 'closeProposals', actionLabel: 'CLOSE PROPOSALS', permission: 'budget.prepareExecutive' },
  { key: 'pendingMbcReview', label: 'Budget Council review', body: 'Municipal Budget Council', action: 'reviewProposals', actionLabel: 'COMPLETE REVIEW', permission: 'budget.reviewProposal' },
  { key: 'pendingPlanningConsolidation', label: 'Consolidation', body: 'Planning Office', action: 'consolidate', actionLabel: 'CONSOLIDATE', permission: 'budget.consolidateProposals' },
  { key: 'pendingBudgetForum', label: 'Budget forum', body: 'Local Finance Committee', action: 'holdForum', actionLabel: 'CONCLUDE FORUM', permission: 'budget.conductForum', opensForm: true },
  { key: 'pendingBudgetHearing', label: 'Budget hearing', body: 'Local Finance Committee', action: 'concludeHearing', actionLabel: 'CONCLUDE HEARINGS', permission: 'budget.conductHearing' },
  { key: 'pendingFinalisation', label: 'Deliberation', body: 'Budget Office', action: 'finalise', actionLabel: 'FINALISE BUDGET', permission: 'budget.finaliseExecutive' },
  { key: 'pendingMayorApproval', label: 'Executive budget', body: 'Mayor', action: 'approveExecutive', actionLabel: 'APPROVE AND SUBMIT', permission: 'budget.approveExecutive' },
  { key: 'pendingSanggunianAction', label: 'Appropriation ordinance', body: 'Sangguniang Bayan', action: 'enactOrdinance', actionLabel: 'RECORD ORDINANCE', permission: 'budget.enactOrdinance', opensForm: true },
  { key: 'pendingProvincialReview', label: 'Provincial review', body: 'Sangguniang Panlalawigan', action: 'recordProvincialReview', actionLabel: 'RECORD REVIEW', permission: 'budget.recordProvincialReview', opensForm: true },
  { key: 'enacted', label: 'Enacted', body: 'Appropriations released', action: null },
]

export const BUDGET_STATUS_TONES = {
  draft: 'neutral',
  pendingMbcReview: 'warning',
  pendingPlanningConsolidation: 'warning',
  pendingBudgetForum: 'warning',
  pendingBudgetHearing: 'warning',
  pendingFinalisation: 'warning',
  pendingMayorApproval: 'warning',
  pendingSanggunianAction: 'info',
  pendingProvincialReview: 'info',
  enacted: 'success',
  returned: 'danger',
}

export const PROPOSAL_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  mbcReviewed: 'Reviewed by the Budget Council',
  consolidated: 'Consolidated',
  heard: 'Heard',
  finalised: 'Finalised',
  returned: 'Returned',
}

export const PROPOSAL_STATUS_TONES = {
  draft: 'neutral',
  submitted: 'info',
  mbcReviewed: 'info',
  consolidated: 'info',
  heard: 'info',
  finalised: 'success',
  returned: 'danger',
}
