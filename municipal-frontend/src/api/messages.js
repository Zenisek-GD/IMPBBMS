import { apiClient } from './client'

// Mirrors MESSAGE_ROUTING in municipal_backend/models/publicMessageModel.js.
// The hint is shown to the sender so they know where their message is going
// before they send it — a form that silently routes correspondence somewhere is
// a form people stop trusting.
export const MESSAGE_CATEGORIES = [
  {
    key: 'projectEnquiry',
    label: 'A project or contract',
    hint: 'Goes to the BAC Secretariat, which keeps the procurement record.',
  },
  {
    key: 'dataCorrection',
    label: 'Something published here looks wrong',
    hint: 'Goes to the Internal Auditor.',
  },
  {
    key: 'bidderEnquiry',
    label: 'Becoming an accredited bidder',
    hint: 'Goes to the BAC Secretariat.',
  },
  {
    key: 'procurementComplaint',
    label: 'A complaint about a procurement',
    hint: 'Goes to the Municipal Mayor as Head of the Procuring Entity.',
  },
  {
    key: 'siteProblem',
    label: 'A problem with this website',
    hint: 'Goes to the system administrator.',
  },
  {
    key: 'other',
    label: 'Something else',
    hint: 'Goes to the administrator, who will pass it on.',
  },
]

export const MESSAGE_CATEGORY_LABELS = Object.fromEntries(
  MESSAGE_CATEGORIES.map((category) => [category.key, category.label])
)

export const MESSAGE_STATUS_TONES = {
  new: 'warning',
  acknowledged: 'info',
  closed: 'success',
}

// Public — no session.
export const sendPublicMessage = (payload) =>
  apiClient.post('/public/messages', payload).then((res) => res.data)

// Officers only, and scoped server-side to the messages routed to a permission
// the caller holds.
export const fetchMessages = () => apiClient.get('/messages').then((res) => res.data)

export const updateMessage = (id, payload) =>
  apiClient.patch(`/messages/${id}`, payload).then((res) => res.data)
