import { apiClient } from './client'

// These four are the only calls in the app that work without a session. They
// sit apart from api/insights.js precisely so that separation stays visible:
// everything else there needs a permission, and none of this does.
const PUBLIC = '/public/transparency'

export const fetchTransparencyOverview = () =>
  apiClient.get(`${PUBLIC}/overview`).then((res) => res.data)

export const fetchPublishedApp = () => apiClient.get(`${PUBLIC}/app`).then((res) => res.data)

export const fetchPublishedProcurements = () =>
  apiClient.get(`${PUBLIC}/procurements`).then((res) => res.data)

export const fetchPublishedAwards = () => apiClient.get(`${PUBLIC}/awards`).then((res) => res.data)
