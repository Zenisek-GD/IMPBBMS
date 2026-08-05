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
