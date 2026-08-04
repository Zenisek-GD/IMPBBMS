import { apiClient } from './client'

export const fetchAuditLog = (params = {}) =>
  apiClient.get('/audit', { params }).then((res) => res.data)

export const verifyAuditChain = () => apiClient.get('/audit/verify').then((res) => res.data)

export const fetchEntityTimeline = (entityRef, entityId) =>
  apiClient.get(`/audit/timeline/${entityRef}/${entityId}`).then((res) => res.data)

// The export is a CSV download, so it bypasses the JSON client.
export const auditExportUrl = `${apiClient.defaults.baseURL}/audit/export`

export const fetchDss = (params = {}) => apiClient.get('/dss', { params }).then((res) => res.data)

// Transparency reads live in api/transparency.js — they are public and need no
// session, unlike everything in this module.

export const OUTCOME_TONES = { success: 'success', denied: 'danger', failed: 'warning' }

export const FLAG_TONES = {
  onTrack: 'success',
  underUtilised: 'warning',
  overCommitted: 'danger',
}

export const FLAG_LABELS = {
  onTrack: 'On track',
  underUtilised: 'Under-utilised',
  overCommitted: 'Over-committed',
}
