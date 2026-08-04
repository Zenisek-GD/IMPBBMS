import { apiClient } from './client'

export const fetchContracts = (params = {}) =>
  apiClient.get('/contracts', { params }).then((res) => res.data)

export const createContract = (payload) =>
  apiClient.post('/contracts', payload).then((res) => res.data)

export const issueForSignature = (id) =>
  apiClient.post(`/contracts/${id}/issue`).then((res) => res.data)

export const signContract = (id) => apiClient.post(`/contracts/${id}/sign`).then((res) => res.data)

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
