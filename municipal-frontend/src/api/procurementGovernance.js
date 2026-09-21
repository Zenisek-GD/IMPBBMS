import { apiClient } from './client'

const post = (id, action, payload = {}) => apiClient.post(`/bidding/rfqs/${id}/${action}`, payload).then((response) => response.data)
export const prepareFailure = (id, payload) => post(id, 'failure', payload)
export const submitFailure = (id) => post(id, 'failure/submit')
export const reviewFailure = (id, payload) => post(id, 'failure/review', payload)
export const voteFailure = (id, payload) => post(id, 'failure/vote', payload)
export const finalizeFailure = (id, payload) => post(id, 'failure/decision', payload)
export const reviewNegotiated = (id, payload) => post(id, 'negotiated-review/review', payload)
export const voteNegotiated = (id, payload) => post(id, 'negotiated-review/vote', payload)
