import { apiClient } from './client'

export const fetchPrs = (params = {}) =>
  apiClient.get('/purchase-requisitions', { params }).then((res) => res.data)

export const fetchAppBalance = (appEntryId, excludePrId) =>
  apiClient
    .get(`/purchase-requisitions/app-balance/${appEntryId}`, {
      params: excludePrId ? { excludePrId } : {},
    })
    .then((res) => res.data)

export const createPr = (payload) =>
  apiClient.post('/purchase-requisitions', payload).then((res) => res.data)

export const updatePr = (id, payload) =>
  apiClient.patch(`/purchase-requisitions/${id}`, payload).then((res) => res.data)

export const transitionPr = (id, action, payload = {}) =>
  apiClient
    .post(`/purchase-requisitions/${id}/transition`, { action, ...payload })
    .then((res) => res.data)

// What the IRR ceilings indicate for this requisition, for the BAC's mode
// determination form.
export const fetchModeSuggestion = (id) =>
  apiClient.get(`/purchase-requisitions/${id}/mode-suggestion`).then((res) => res.data)

// ── The signature chain, in the order it is collected ────────────────────────
// This is the order the boxes appear on the municipality's Purchase Request
// form: the office requests, the Treasurer certifies the funds are available,
// the Mayor approves, the Budget Office certifies the appropriation, the
// Accountant obligates it, and the BAC determines how it will be procured.
//
// The Budget Office's certification and the Accountant's obligation are two
// stages, not one. LGC Sec. 344 names three officers on a disbursement — "the
// local budget officer certifies to the existence of appropriation..., the
// local accountant has obligated said appropriation, and the local treasurer
// certifies to the availability of funds" — and the system used to fold the
// obligation into the certification, leaving the Accountant out of the chain.
export const PR_STATUS_LABELS = {
  draft: 'Draft',
  pendingDepartmentHeadEndorsement: 'Pending Head of Office endorsement',
  pendingCashCertification: 'Pending Treasurer — availability of funds',
  pendingMayorApproval: "Pending Mayor's approval",
  pendingBudgetCertification: 'Pending Budget Office — appropriation',
  pendingAccountantObligation: 'Pending Accountant — obligation (ORS)',
  pendingModeDetermination: 'Pending BAC — mode of procurement',
  returned: 'Returned',
  approved: 'Cleared for procurement',
}

export const PR_STATUS_TONES = {
  draft: 'neutral',
  pendingDepartmentHeadEndorsement: 'info',
  pendingCashCertification: 'warning',
  pendingMayorApproval: 'warning',
  pendingBudgetCertification: 'warning',
  pendingAccountantObligation: 'warning',
  pendingModeDetermination: 'warning',
  returned: 'danger',
  approved: 'success',
}

// The stages in order, for the progress trail on the requisition drawer. Kept
// as a list rather than derived from the labels object, because object key
// order is not something a UI should depend on.
export const PR_STAGE_SEQUENCE = [
  'pendingDepartmentHeadEndorsement',
  'pendingCashCertification',
  'pendingMayorApproval',
  'pendingBudgetCertification',
  'pendingAccountantObligation',
  'pendingModeDetermination',
  'approved',
]

// Endorsement is intentionally absent a permission: it is gated by department
// headship rather than a permission, so the server decides. The UI offers it
// and lets the API reject when the caller is not the head.
export const PR_TRANSITION_FOR_STATUS = {
  draft: { action: 'submit', label: 'SUBMIT', permission: 'pr.create' },
  returned: { action: 'submit', label: 'RESUBMIT', permission: 'pr.create' },
  pendingDepartmentHeadEndorsement: { action: 'endorse', label: 'ENDORSE', permission: null },
  pendingCashCertification: {
    action: 'certifyCash',
    label: 'CERTIFY FUNDS AVAILABLE',
    permission: 'pr.certifyCash',
  },
  pendingMayorApproval: { action: 'approve', label: 'APPROVE REQUEST', permission: 'pr.approve' },
  pendingBudgetCertification: {
    action: 'certify',
    label: 'CERTIFY APPROPRIATION',
    permission: 'pr.certify',
  },
  pendingAccountantObligation: {
    action: 'obligate',
    label: 'OBLIGATE (ORS)',
    permission: 'pr.obligate',
  },
  // Opens the determination form rather than firing straight away — the
  // committee has to see what the thresholds indicate before it chooses.
  pendingModeDetermination: {
    action: 'determineMode',
    label: 'DETERMINE MODE',
    permission: 'pr.determineMode',
    opensForm: true,
  },
}

export const PR_RETURN_PERMISSION_FOR_STATUS = {
  pendingDepartmentHeadEndorsement: 'pr.endorse',
  pendingCashCertification: 'pr.certifyCash',
  pendingMayorApproval: 'pr.approve',
  pendingBudgetCertification: 'pr.certify',
  pendingAccountantObligation: 'pr.obligate',
  pendingModeDetermination: 'pr.determineMode',
}

export const ASSET_CLASS_LABELS = {
  expense: 'Expense',
  semiExpendable: 'Semi-expendable',
  capitalOutlay: 'Capital Outlay',
}

export const ASSET_CLASS_TONES = {
  expense: 'neutral',
  semiExpendable: 'info',
  capitalOutlay: 'warning',
}
