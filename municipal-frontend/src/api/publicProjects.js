import { apiClient } from './client'

// The citizen-facing API. Nothing here sends or needs a session — these are the
// only calls in the app a visitor with no account will ever make, and they are
// kept in their own module so that stays obvious.
const PUBLIC = '/public'

export const fetchPublicOverview = () =>
  apiClient.get(`${PUBLIC}/projects/overview`).then((res) => res.data)

export const fetchPublicFilters = () =>
  apiClient.get(`${PUBLIC}/projects/filters`).then((res) => res.data)

export const fetchPublicProjects = (params = {}) =>
  apiClient.get(`${PUBLIC}/projects`, { params }).then((res) => res.data)

export const fetchPublicProject = (id) =>
  apiClient.get(`${PUBLIC}/projects/${id}`).then((res) => res.data)

export const fetchProjectTimeline = (id) =>
  apiClient.get(`${PUBLIC}/projects/${id}/timeline`).then((res) => res.data)

export const fetchProjectDocuments = (id) =>
  apiClient.get(`${PUBLIC}/projects/${id}/documents`).then((res) => res.data)

export const fetchAnnouncements = () =>
  apiClient.get(`${PUBLIC}/announcements`).then((res) => res.data)

// Built rather than fetched: the browser follows this as a normal download, so
// the file never passes through axios.
export const projectDocumentUrl = (projectId, documentId) =>
  `${apiClient.defaults.baseURL}${PUBLIC}/projects/${projectId}/documents/${documentId}/download`
