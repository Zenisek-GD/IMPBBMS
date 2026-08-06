import { apiClient } from './client'

export const fetchAppEntries = (params = {}) =>
  apiClient.get('/app-entries', { params }).then((res) => res.data)

export const createAppEntry = (payload) =>
  apiClient.post('/app-entries', payload).then((res) => res.data)

export const updateAppEntry = (id, payload) =>
  apiClient.patch(`/app-entries/${id}`, payload).then((res) => res.data)

export const transitionAppEntry = (id, action, remarks) =>
  apiClient.post(`/app-entries/${id}/transition`, { action, remarks }).then((res) => res.data)

export const fetchModeSuggestion = (abc) =>
  apiClient.get('/app-entries/mode-suggestion', { params: { abc } }).then((res) => res.data)

// Labels for the states in design doc Section 4.1.
export const APP_STATUS_LABELS = {
  draft: 'Draft',
  pendingConsolidation: 'Pending Consolidation',
  pendingBudgetCertification: 'Pending Budget Certification',
  pendingHopeApproval: 'Pending Mayor Approval',
  approved: 'Approved',
  returned: 'Returned',
  locked: 'Approved & Locked',
}

export const APP_STATUS_TONES = {
  draft: 'neutral',
  pendingConsolidation: 'info',
  pendingBudgetCertification: 'warning',
  pendingHopeApproval: 'warning',
  approved: 'success',
  returned: 'danger',
  locked: 'success',
}

// Which transition each permission unlocks, used to decide what to offer.
export const TRANSITION_FOR_STATUS = {
  draft: { action: 'submit', label: 'SUBMIT', permission: 'app.submit' },
  returned: { action: 'submit', label: 'RESUBMIT', permission: 'app.submit' },
  pendingConsolidation: { action: 'consolidate', label: 'CONSOLIDATE', permission: 'app.consolidate' },
  pendingBudgetCertification: { action: 'certify', label: 'CERTIFY FUNDING', permission: 'app.certify' },
  pendingHopeApproval: { action: 'approve', label: 'APPROVE', permission: 'app.approve' },
}

export const RETURN_PERMISSION_FOR_STATUS = {
  pendingConsolidation: 'app.consolidate',
  pendingBudgetCertification: 'app.certify',
  pendingHopeApproval: 'app.approve',
}

export const PROCUREMENT_MODES = [
  { key: 'competitiveBidding', label: 'Competitive Bidding' },
  { key: 'limitedSourceBidding', label: 'Limited Source Bidding' },
  { key: 'competitiveDialogue', label: 'Competitive Dialogue' },
  { key: 'unsolicitedOffer', label: 'Unsolicited Offer with Bid Matching' },
  { key: 'directContracting', label: 'Direct Contracting' },
  { key: 'directAcquisition', label: 'Direct Acquisition' },
  { key: 'smallValueProcurement', label: 'Small Value Procurement' },
  { key: 'repeatOrder', label: 'Repeat Order' },
  { key: 'negotiatedProcurement', label: 'Negotiated Procurement' },
  { key: 'directSales', label: 'Direct Sales' },
  { key: 'stiProcurement', label: 'Direct Procurement for Science, Technology, and Innovation' },
]

export const modeLabel = (key) => PROCUREMENT_MODES.find((mode) => mode.key === key)?.label ?? key

// ── IRR Sec. 7.7 — the two plan cycles ───────────────────────────────────────
// An indicative line supports the budget proposal and cites NO appropriation;
// a final line is charged against the enacted ordinance.
export const PLAN_CYCLE_LABELS = {
  indicative: 'Indicative — supports the budget proposal (Sec. 7.7.1–7.7.2)',
  final: 'Final — aligned to the enacted appropriation (Sec. 7.7.5)',
}

export const PLAN_STAGE_LABELS = {
  ppmp: 'PPMP',
  indicativeApp: 'Indicative APP',
  updatedIndicativeApp: 'Updated Indicative APP (EPA basis)',
  finalApp: 'Final APP',
}

// Sec. 7.7 — the 4% MOOE lump sum for foreseeable emergencies.
export const fetchContingencyStatus = (fiscalYear) =>
  apiClient.get('/app-entries/contingency', { params: { fiscalYear } }).then((res) => res.data)

// Sec. 7.7.5 — the approved final APP is submitted to the GPPB on or before the
// end of January of the budget year.
export const recordGppbSubmission = (payload) =>
  apiClient.post('/app-entries/gppb-submission', payload).then((res) => res.data)
