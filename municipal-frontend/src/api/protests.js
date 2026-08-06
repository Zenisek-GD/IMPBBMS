import { apiClient } from './client'

// ── Protest mechanism (RA 12009 Sec. 83–85) ──────────────────────────────────
// A losing bidder's remedy against a decision of the BAC, and under Sec. 85 a
// precondition to any court action — cases filed without exhausting it are
// dismissed for lack of jurisdiction.
//
// Two stages, and the first is a condition of the second: a request for
// reconsideration to the BAC, then — only if that is DENIED — a protest to the
// Head of the Procuring Entity.

export const fetchProtestOptions = (abc) =>
  apiClient.get('/protests/options', { params: abc ? { abc } : {} }).then((res) => res.data)

export const fetchProtests = (params = {}) =>
  apiClient.get('/protests', { params }).then((res) => res.data)

export const fileReconsideration = (rfqId, payload) =>
  apiClient.post(`/protests/rfqs/${rfqId}/reconsideration`, payload).then((res) => res.data)

export const fileProtest = (payload) => apiClient.post('/protests', payload).then((res) => res.data)

export const resolveProtest = (id, payload) =>
  apiClient.post(`/protests/${id}/resolve`, payload).then((res) => res.data)

export const PROTEST_STAGE_LABELS = {
  requestForReconsideration: 'Request for reconsideration — to the BAC',
  protest: 'Protest — to the Head of the Procuring Entity',
}

export const PROTEST_STATUS_LABELS = {
  filed: 'Awaiting decision',
  granted: 'Granted',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
  dismissed: 'Dismissed',
}

export const PROTEST_STATUS_TONES = {
  filed: 'warning',
  granted: 'success',
  denied: 'danger',
  withdrawn: 'neutral',
  dismissed: 'neutral',
}

// Sec. 83.1 and 83.2 — the periods, in calendar days.
export const RECONSIDERATION_FILING_DAYS = 3
export const RECONSIDERATION_DECISION_DAYS = 7
export const PROTEST_FILING_DAYS = 7
export const PROTEST_DECISION_DAYS = 7

// Sec. 83.2 — the non-refundable protest fee, mirrored here so the bidder is
// told the amount before they commit to filing rather than after. The server
// recomputes it; this is for display only.
export const protestFeeFor = (abc) => {
  const amount = Number(abc)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (amount <= 50_000_000) return Math.round(amount * 0.0075 * 100) / 100
  if (amount <= 100_000_000) return 500_000
  if (amount <= 500_000_000) return Math.round(amount * 0.005 * 100) / 100
  if (amount <= 1_000_000_000) return 2_500_000
  if (amount <= 2_000_000_000) return Math.round(amount * 0.0025 * 100) / 100
  return 5_000_000
}
