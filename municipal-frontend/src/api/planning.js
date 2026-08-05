import { apiClient } from './client'

// Development planning: the Comprehensive Development Plan, the Mayor's
// priorities for the year, and the Annual Investment Program derived from them.

export const fetchPlanningOptions = () => apiClient.get('/planning/options').then((res) => res.data)

export const fetchPlans = (params = {}) =>
  apiClient.get('/planning/plans', { params }).then((res) => res.data)

export const createPlan = (payload) => apiClient.post('/planning/plans', payload).then((res) => res.data)

export const updatePlan = (id, payload) =>
  apiClient.patch(`/planning/plans/${id}`, payload).then((res) => res.data)

export const adoptPlan = (id, payload) =>
  apiClient.post(`/planning/plans/${id}/adopt`, payload).then((res) => res.data)

export const createGoal = (planId, payload) =>
  apiClient.post(`/planning/plans/${planId}/goals`, payload).then((res) => res.data)

export const updateGoal = (goalId, payload) =>
  apiClient.patch(`/planning/goals/${goalId}`, payload).then((res) => res.data)

export const setPriorities = (payload) =>
  apiClient.post('/planning/priorities', payload).then((res) => res.data)

export const fetchPrograms = (params = {}) =>
  apiClient.get('/planning/investment-programs', { params }).then((res) => res.data)

export const createProgram = (payload) =>
  apiClient.post('/planning/investment-programs', payload).then((res) => res.data)

export const createAipEntry = (programId, payload) =>
  apiClient.post(`/planning/investment-programs/${programId}/entries`, payload).then((res) => res.data)

export const updateAipEntry = (entryId, payload) =>
  apiClient.patch(`/planning/aip-entries/${entryId}`, payload).then((res) => res.data)

export const deleteAipEntry = (entryId) =>
  apiClient.delete(`/planning/aip-entries/${entryId}`).then((res) => res.data)

export const transitionProgram = (id, action, payload = {}) =>
  apiClient.post(`/planning/investment-programs/${id}/transition`, { action, ...payload }).then((res) => res.data)

// The flat list the budget-proposal and APP-entry forms read.
export const fetchAipEntries = (params = {}) =>
  apiClient.get('/planning/aip-entries', { params }).then((res) => res.data)

export const PLAN_STATUS_LABELS = {
  draft: 'Draft',
  adopted: 'Adopted',
  superseded: 'Superseded',
}

export const PLAN_STATUS_TONES = {
  draft: 'neutral',
  adopted: 'success',
  superseded: 'warning',
}

export const AIP_STATUS_LABELS = {
  draft: 'Draft',
  pendingMayorEndorsement: "Pending Mayor's endorsement",
  pendingSanggunianAdoption: 'Pending Sanggunian adoption',
  adopted: 'Adopted',
  returned: 'Returned',
}

export const AIP_STATUS_TONES = {
  draft: 'neutral',
  pendingMayorEndorsement: 'warning',
  pendingSanggunianAdoption: 'warning',
  adopted: 'success',
  returned: 'danger',
}

// Which act advances the programme from each state, and who may perform it.
export const AIP_TRANSITION_FOR_STATUS = {
  draft: { action: 'submit', label: 'SUBMIT FOR ENDORSEMENT', permission: 'planning.manageAip' },
  returned: { action: 'submit', label: 'RESUBMIT', permission: 'planning.manageAip' },
  pendingMayorEndorsement: { action: 'endorse', label: 'ENDORSE', permission: 'planning.setPriorities' },
  pendingSanggunianAdoption: {
    action: 'adopt',
    label: 'RECORD ADOPTION',
    permission: 'planning.adoptAip',
    // Needs the adopting resolution number, so it opens a form.
    opensForm: true,
  },
}

export const AIP_RETURN_PERMISSION_FOR_STATUS = {
  pendingMayorEndorsement: 'planning.setPriorities',
  pendingSanggunianAdoption: 'planning.adoptAip',
}
