import { apiClient } from './client'

// ── Observers (RA 12009 Sec. 43) ─────────────────────────────────────────────
// The BAC must invite, in addition to the COA representative, at least two
// observers — one from a duly recognised private group relevant to the
// procurement, one from a CSO or PO — to six stages of the process. Their
// absence does not nullify the proceedings *provided they were duly invited*,
// which is why the invitation is a record rather than a courtesy.

export const fetchObserverOptions = () =>
  apiClient.get('/observers/options').then((res) => res.data)

export const fetchObserverOrganizations = (params = {}) =>
  apiClient.get('/observers/organizations', { params }).then((res) => res.data)

export const createObserverOrganization = (payload) =>
  apiClient.post('/observers/organizations', payload).then((res) => res.data)

export const fetchObserverInvitations = (params = {}) =>
  apiClient.get('/observers/invitations', { params }).then((res) => res.data)

export const inviteObservers = (rfqId, payload) =>
  apiClient.post(`/observers/rfqs/${rfqId}/invitations`, payload).then((res) => res.data)

export const fetchObserverCoverage = (rfqId) =>
  apiClient.get(`/observers/rfqs/${rfqId}/coverage`).then((res) => res.data)

export const fetchObservationSummary = (rfqId) =>
  apiClient.get(`/observers/rfqs/${rfqId}/summary`).then((res) => res.data)

export const recordObserverAttendance = (invitationId, payload) =>
  apiClient.post(`/observers/invitations/${invitationId}/attendance`, payload).then((res) => res.data)

export const submitObservationReport = (invitationId, payload) =>
  apiClient.post(`/observers/invitations/${invitationId}/report`, payload).then((res) => res.data)

// The six stages Sec. 43.1 opens to observation, in the order they occur.
export const OBSERVABLE_STAGE_LABELS = {
  eligibilityChecking: 'Eligibility checking',
  shortListing: 'Short-listing',
  prebidConference: 'Pre-bid conference',
  preliminaryExamination: 'Preliminary examination of bids',
  bidEvaluation: 'Bid evaluation',
  postQualification: 'Post-qualification',
}

// Sec. 43.1 — COA, plus one private group and one CSO/PO.
export const OBSERVER_SECTOR_LABELS = {
  coa: 'Commission on Audit',
  privateGroup: 'Private group (relevant sector)',
  csoOrPo: 'CSO / people’s organisation',
}

export const OBSERVER_SECTOR_TONES = {
  coa: 'info',
  privateGroup: 'neutral',
  csoOrPo: 'success',
}

export const ATTENDANCE_LABELS = {
  invited: 'Invited',
  attended: 'Attended',
  absent: 'Absent',
  inhibited: 'Inhibited',
}

export const ATTENDANCE_TONES = {
  invited: 'neutral',
  attended: 'success',
  absent: 'warning',
  inhibited: 'danger',
}

// Sec. 43.2 and 43.4(b).
export const OBSERVER_NOTICE_DAYS = 5
export const OBSERVATION_REPORT_DAYS = 7
