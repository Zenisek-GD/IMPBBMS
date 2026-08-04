import { apiClient } from './client'

export const fetchRfqs = (params = {}) =>
  apiClient.get('/bidding/rfqs', { params }).then((res) => res.data)

export const createRfq = (payload) =>
  apiClient.post('/bidding/rfqs', payload).then((res) => res.data)

export const publishRfq = (id) => apiClient.post(`/bidding/rfqs/${id}/publish`).then((res) => res.data)
export const closeRfq = (id) => apiClient.post(`/bidding/rfqs/${id}/close`).then((res) => res.data)
export const cancelRfq = (id, reason) =>
  apiClient.post(`/bidding/rfqs/${id}/cancel`, { reason }).then((res) => res.data)

export const openBids = (id, payload) =>
  apiClient.post(`/bidding/rfqs/${id}/open`, payload).then((res) => res.data)

// A bid is confirmed by a code emailed to the bidder before it is accepted — it is
// an irrevocable financial commitment, so a session left open is not enough to
// make one. Request → verify → submit, all scoped to this RFQ.
export const requestBidCode = (id) =>
  apiClient.post(`/bidding/rfqs/${id}/bids/request-code`).then((res) => res.data)

export const verifyBidCode = (id, reference, code) =>
  apiClient.post(`/bidding/rfqs/${id}/bids/verify-code`, { reference, code }).then((res) => res.data)

export const submitBid = (id, payload) =>
  apiClient.post(`/bidding/rfqs/${id}/bids`, payload).then((res) => res.data)

export const fetchBids = (rfqId) =>
  apiClient.get(`/bidding/rfqs/${rfqId}/bids`).then((res) => res.data)

export const submitEvaluation = (bidId, criteriaBreakdown, remarks) =>
  apiClient.post(`/bidding/bids/${bidId}/evaluations`, { criteriaBreakdown, remarks }).then((res) => res.data)

export const closeEvaluation = (rfqId) =>
  apiClient.post(`/bidding/rfqs/${rfqId}/close-evaluation`).then((res) => res.data)

export const submitPostQualification = (bidId, payload) =>
  apiClient.post(`/bidding/bids/${bidId}/post-qualification`, payload).then((res) => res.data)

export const recommendAward = (bidId) =>
  apiClient.post(`/bidding/bids/${bidId}/recommend-award`).then((res) => res.data)

export const approveAward = (id) => apiClient.post(`/bidding/awards/${id}/approve`).then((res) => res.data)
export const fetchAwards = () => apiClient.get('/bidding/awards').then((res) => res.data)

// Vendor registration
export const fetchMyVendorProfile = () => apiClient.get('/vendors/me').then((res) => res.data)
export const saveMyVendorProfile = (payload) => apiClient.put('/vendors/me', payload).then((res) => res.data)
export const submitMyVendorProfile = () => apiClient.post('/vendors/me/submit').then((res) => res.data)
export const fetchVendors = (params = {}) => apiClient.get('/vendors', { params }).then((res) => res.data)
export const reviewVendor = (id, decision, remarks) =>
  apiClient.post(`/vendors/${id}/review`, { decision, remarks }).then((res) => res.data)

// Creates the bidder's account against the email address on their approved
// registration and emails the activation invitation. There is deliberately no
// email parameter — the address comes from the accreditation, not from the form.
export const createBidderAccount = (id, displayName) =>
  apiClient.post(`/vendors/${id}/account`, { displayName }).then((res) => res.data)

export const resendBidderInvitation = (id) =>
  apiClient.post(`/vendors/${id}/account/resend-invitation`).then((res) => res.data)

export const RFQ_STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed for Submission',
  opened: 'Bids Opened — Under Evaluation',
  evaluated: 'Evaluated',
  awarded: 'Awarded',
  cancelled: 'Cancelled',
  failed: 'Failed Bidding',
}

export const RFQ_STATUS_TONES = {
  draft: 'neutral',
  published: 'success',
  closed: 'warning',
  opened: 'info',
  evaluated: 'info',
  awarded: 'success',
  cancelled: 'neutral',
  failed: 'danger',
}

// Standard rubric. Section 7.9 requires it to be system-enforced, so the
// criteria are fixed here rather than typed in per evaluation.
export const EVALUATION_RUBRIC = [
  { key: 'technicalCompliance', label: 'Technical compliance with specifications' },
  { key: 'deliveryCapability', label: 'Delivery capability and schedule' },
  { key: 'trackRecord', label: 'Track record and completed contracts' },
]
