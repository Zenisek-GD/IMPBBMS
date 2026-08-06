import { apiClient } from './client'

export const fetchContracts = (params = {}) =>
  apiClient.get('/contracts', { params }).then((res) => res.data)

export const createContract = (payload) =>
  apiClient.post('/contracts', payload).then((res) => res.data)

export const issueForSignature = (id) =>
  apiClient.post(`/contracts/${id}/issue`).then((res) => res.data)

export const signContract = (id) => apiClient.post(`/contracts/${id}/sign`).then((res) => res.data)

// ── RA 12009 Sec. 68 — performance security before the contract is signed ────
// "To guarantee the faithful performance by the winning bidder of its
// obligations under the contract... it shall post a performance security prior
// to the signing of the contract." The server refuses the signature without one.
export const postPerformanceSecurity = (id, payload) =>
  apiClient.post(`/contracts/${id}/performance-security`, payload).then((res) => res.data)

// The Notice to Proceed is a separate instrument from the signature: it is the
// day contract time starts, and therefore the day delay and liquidated damages
// are measured from.
export const issueNoticeToProceed = (id, payload = {}) =>
  apiClient.post(`/contracts/${id}/notice-to-proceed`, payload).then((res) => res.data)

// ── Sec. 71 — contract implementation ────────────────────────────────────────
// Variation orders are capped at 10% of the original contract price, cumulative,
// and require the performance security to be updated first.
export const issueVariationOrder = (id, payload) =>
  apiClient.post(`/contracts/${id}/variation-order`, payload).then((res) => res.data)

// Termination for default, breach or unlawful acts forfeits the performance
// security; termination for the LGU's convenience releases it.
export const terminateContract = (id, payload) =>
  apiClient.post(`/contracts/${id}/terminate`, payload).then((res) => res.data)

// Posted on final acceptance, covering defects during the warranty period.
export const postWarrantySecurity = (id, payload) =>
  apiClient.post(`/contracts/${id}/warranty-security`, payload).then((res) => res.data)

export const SECURITY_FORM_LABELS = {
  cash: "Cash or cashier's / manager's check",
  managersCheck: "Manager's check",
  bankDraftGuarantee: 'Bank draft / guarantee',
  suretyBond: 'Surety bond',
  securingDeclaration: 'Securing Declaration (RA 12009)',
}

export const TERMINATION_GROUND_LABELS = {
  default: 'Default — the supplier failed to perform',
  breach: 'Breach of contract',
  convenience: "The LGU's convenience (security is returned)",
  unlawfulActs: 'Unlawful acts by the supplier',
}

export const reportDelivery = (contractId, payload) =>
  apiClient.post(`/contracts/${contractId}/deliveries`, payload).then((res) => res.data)

export const fetchDeliveries = () =>
  apiClient.get('/contracts/deliveries/all').then((res) => res.data)

export const inspectDelivery = (deliveryId, payload) =>
  apiClient.post(`/contracts/deliveries/${deliveryId}/inspect`, payload).then((res) => res.data)

// Live Conference (Section 7.3)
export const fetchConferences = () => apiClient.get('/conferences').then((res) => res.data)

export const scheduleConference = (payload) =>
  apiClient.post('/conferences', payload).then((res) => res.data)

export const updateConference = (id, payload) =>
  apiClient.patch(`/conferences/${id}`, payload).then((res) => res.data)

export const recordAttendance = (id, payload = {}) =>
  apiClient.post(`/conferences/${id}/attendance`, payload).then((res) => res.data)

export const CONTRACT_STATUS_LABELS = {
  draft: 'Draft',
  pendingSignatures: 'Awaiting Signatures',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const CONTRACT_STATUS_TONES = {
  draft: 'neutral',
  pendingSignatures: 'warning',
  active: 'success',
  completed: 'info',
  cancelled: 'neutral',
}

export const DELIVERY_STATUS_TONES = {
  reported: 'warning',
  underInspection: 'info',
  accepted: 'success',
  rejected: 'danger',
}

export const CONFERENCE_STATUS_TONES = {
  scheduled: 'info',
  inProgress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}
