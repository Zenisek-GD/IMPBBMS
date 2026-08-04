import { apiClient } from './client'

export const fetchInvoices = (params = {}) =>
  apiClient.get('/finance/invoices', { params }).then((res) => res.data)

export const submitInvoice = (payload) =>
  apiClient.post('/finance/invoices', payload).then((res) => res.data)

export const certifyInvoice = (id, decision, remarks) =>
  apiClient.post(`/finance/invoices/${id}/certify`, { decision, remarks }).then((res) => res.data)

export const releasePayment = (paymentId, payload) =>
  apiClient.post(`/finance/payments/${paymentId}/release`, payload).then((res) => res.data)

export const fetchBudgetMonitor = (params = {}) =>
  apiClient.get('/finance/budget-monitor', { params }).then((res) => res.data)

export const dispatchAlerts = () =>
  apiClient.post('/finance/budget-monitor/alerts').then((res) => res.data)

// ── Appropriation register ──────────────────────────────────────────────────
// The ordinance lines everything else is charged against.
export const fetchAppropriations = (params = {}) =>
  apiClient.get('/finance/appropriations', { params }).then((res) => res.data)

export const fetchAppropriationOptions = () =>
  apiClient.get('/finance/appropriations/options').then((res) => res.data)

export const fetchAppropriationBalance = (id) =>
  apiClient.get(`/finance/appropriations/${id}/balance`).then((res) => res.data)

export const createAppropriation = (payload) =>
  apiClient.post('/finance/appropriations', payload).then((res) => res.data)

export const updateAppropriation = (id, payload) =>
  apiClient.patch(`/finance/appropriations/${id}`, payload).then((res) => res.data)

export const fetchObligations = (params = {}) =>
  apiClient.get('/finance/obligations', { params }).then((res) => res.data)

export const APPROPRIATION_STATUS_TONES = {
  draft: 'neutral',
  enacted: 'success',
  closed: 'info',
}

export const OBLIGATION_STATUS_TONES = {
  obligated: 'info',
  cancelled: 'neutral',
}

export const fetchPendingItems = (params = {}) =>
  apiClient.get('/finance/pending-items', { params }).then((res) => res.data)

export const flagPendingItem = (payload) =>
  apiClient.post('/finance/pending-items', payload).then((res) => res.data)

export const resolvePendingItem = (id, resolution, notes) =>
  apiClient.post(`/finance/pending-items/${id}/resolve`, { resolution, notes }).then((res) => res.data)

export const INVOICE_STATUS_TONES = {
  submitted: 'warning',
  certified: 'info',
  returned: 'danger',
  paid: 'success',
  cancelled: 'neutral',
}

export const PENDING_REASON_LABELS = {
  notAwarded: 'Not awarded',
  failedBidding: 'Failed bidding',
  cancelled: 'Cancelled',
  partiallyDelivered: 'Partially delivered',
  notDelivered: 'Not delivered',
}

export const PRIORITY_TONES = { low: 'neutral', medium: 'warning', high: 'danger' }
export const SEVERITY_TONES = { low: 'success', medium: 'warning', high: 'danger' }
