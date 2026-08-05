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

export const transitionPr = (id, action, remarks) =>
  apiClient.post(`/purchase-requisitions/${id}/transition`, { action, remarks }).then((res) => res.data)

// Section 5.1 states.
export const PR_STATUS_LABELS = {
  draft: 'Draft',
  pendingDepartmentHeadEndorsement: 'Pending Dept. Head Endorsement',
  pendingBudgetCertification: 'Pending Budget Certification',
  pendingTreasuryCertification: 'Pending Treasury Certification',
  pendingSecretariatReview: 'Pending Secretariat Review',
  pendingHopeApproval: 'Pending Mayor Approval',
  returned: 'Returned',
  approved: 'Approved / Ready for Procurement',
}

export const PR_STATUS_TONES = {
  draft: 'neutral',
  pendingDepartmentHeadEndorsement: 'info',
  pendingBudgetCertification: 'warning',
  pendingTreasuryCertification: 'warning',
  pendingSecretariatReview: 'warning',
  pendingHopeApproval: 'warning',
  returned: 'danger',
  approved: 'success',
}

// Endorsement is intentionally absent: it is gated by department headship
// rather than a permission, so the server decides. The UI offers it and lets
// the API reject when the caller is not the head.
export const PR_TRANSITION_FOR_STATUS = {
  draft: { action: 'submit', label: 'SUBMIT', permission: 'pr.create' },
  returned: { action: 'submit', label: 'RESUBMIT', permission: 'pr.create' },
  pendingDepartmentHeadEndorsement: { action: 'endorse', label: 'ENDORSE', permission: null },
  // The two certifications LGC Sec. 344 requires, by two different officers:
  // the Budget Officer on the appropriation, the Treasurer on the cash.
  pendingBudgetCertification: {
    action: 'certify',
    label: 'CERTIFY APPROPRIATION',
    permission: 'pr.certify',
  },
  pendingTreasuryCertification: {
    action: 'certifyCash',
    label: 'CERTIFY CASH AVAILABLE',
    permission: 'pr.certifyCash',
  },
  pendingSecretariatReview: { action: 'review', label: 'REVIEW', permission: 'pr.review' },
  pendingHopeApproval: { action: 'approve', label: 'APPROVE', permission: 'pr.approve' },
}

export const PR_RETURN_PERMISSION_FOR_STATUS = {
  pendingDepartmentHeadEndorsement: 'pr.create',
  pendingBudgetCertification: 'pr.certify',
  pendingTreasuryCertification: 'pr.certifyCash',
  pendingSecretariatReview: 'pr.review',
  pendingHopeApproval: 'pr.approve',
}
