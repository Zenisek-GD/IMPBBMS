import { apiClient } from './client'

// Authoring side. Every call here needs a session holding `announcements.manage`
// — the public read path lives in publicProjects.js and is deliberately separate,
// because this one returns drafts.
const BASE = '/announcements'

export const fetchAnnouncements = (params = {}) =>
  apiClient.get(BASE, { params }).then((res) => res.data)

// The calls a counter submission can be recorded against. Needs `bidding.publish`
// — the caller is the officer receiving documents, not a member of the public.
export const fetchOpenCalls = () =>
  apiClient.get(`${BASE}/open-calls`).then((res) => res.data)

export const createAnnouncement = (payload) =>
  apiClient.post(BASE, payload).then((res) => res.data)

export const updateAnnouncement = (id, payload) =>
  apiClient.patch(`${BASE}/${id}`, payload).then((res) => res.data)

export const publishAnnouncement = (id) =>
  apiClient.post(`${BASE}/${id}/publish`).then((res) => res.data)

export const withdrawAnnouncement = (id, reason) =>
  apiClient.post(`${BASE}/${id}/withdraw`, { reason }).then((res) => res.data)

// ── Invitation to Bid support ────────────────────────────────────────────────

// Reads a published solicitation and returns the notice fields it would fill —
// reference number, ABC, mode, schedule — so an officer never retypes figures
// that are already on file. Returns values; the caller still saves them.
export const draftFromSolicitation = (rfqId) =>
  apiClient.get(`${BASE}/from-solicitation/${rfqId}`).then((res) => res.data)

// The public rendering of a draft, built by the same serialiser the portal uses.
export const previewAnnouncement = (id) =>
  apiClient.get(`${BASE}/${id}/preview`).then((res) => res.data)

export const fetchAnnouncementAttachments = (id) =>
  apiClient.get(`${BASE}/${id}/attachments`).then((res) => res.data)

// Reuse a previous notice's wording. Always lands as a draft, and deliberately
// drops every date, reference and link belonging to the procurement copied.
export const duplicateAnnouncement = (id) =>
  apiClient.post(`${BASE}/${id}/duplicate`).then((res) => res.data)

// Retire a notice whose procurement is over. Unlike withdrawal, an archived
// notice stays readable on the portal's archive view.
export const archiveAnnouncement = (id) =>
  apiClient.post(`${BASE}/${id}/archive`).then((res) => res.data)

export const releaseScheduledAnnouncements = () =>
  apiClient.post(`${BASE}/release-scheduled`).then((res) => res.data)

// Attachments go through the shared document store with entityRef=announcement,
// so they inherit its size limits, type allow-list, checksum and access log.
export const uploadAnnouncementAttachment = (announcementId, file, label) => {
  const form = new FormData()
  form.append('file', file)
  form.append('entityRef', 'announcement')
  form.append('entityId', String(announcementId))
  if (label) form.append('label', label)
  return apiClient
    .post('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((res) => res.data)
}

export const deleteAnnouncementAttachment = (documentId) =>
  apiClient.delete(`/documents/${documentId}`).then((res) => res.data)

export const ANNOUNCEMENT_STATUS_TONES = {
  draft: 'neutral',
  published: 'success',
  archived: 'warning',
}
