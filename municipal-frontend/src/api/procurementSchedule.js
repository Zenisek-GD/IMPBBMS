import { apiClient } from './client'
const base = (id) => `/bidding/rfqs/${id}/schedule`
export const fetchSchedule = (id) => apiClient.get(base(id)).then((res) => res.data)
export const approveSchedule = (id) => apiClient.post(`${base(id)}/approve`).then((res) => res.data)
export const requestAmendment = (id, payload) => apiClient.post(`${base(id)}/amendments`, payload).then((res) => res.data)
export const submitAmendment = (id, amendmentId) => apiClient.post(`${base(id)}/amendments/${amendmentId}/submit`).then((res) => res.data)
export const decideAmendment = (id, amendmentId, decision, remarks) => apiClient.post(`${base(id)}/amendments/${amendmentId}/decision`, { decision, remarks }).then((res) => res.data)
