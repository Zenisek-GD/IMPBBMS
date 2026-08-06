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

// ── READABLE ACTION NAMES ────────────────────────────────────────────────────
// The audit table used to print the raw action key — "auth.login.success",
// "budget.executive.transition" — which is the right shape for grepping a log
// file and the wrong shape for a screen an auditor or a COA reviewer reads.
// The key is still there, in the detail dialog and in the CSV export, so
// nothing that scripts against it breaks.
//
// Every key mirrors AUDIT_ACTIONS in municipal_backend/services/auditLog.js.
// A key with no entry here falls through to `actionLabel`, which prettifies it
// rather than showing nothing — a new action added on the server appears as
// readable text on the day it ships, not as a blank cell.
export const ACTION_LABELS = {
  'auth.login.success': 'Signed in',
  'auth.login.failed': 'Sign-in failed',
  'auth.logout': 'Signed out',

  'bidder.requirements.submitted': 'Bidder requirements received',
  'bidder.requirements.reviewed': 'Bidder registration reviewed',
  'bidder.requirements.late': 'Bidder submission refused as late',
  'bidder.document.reviewed': 'Accreditation document reviewed',
  'bidder.account.created': 'Bidder account created',
  'bidder.invitation.sent': 'Bidder invitation sent',
  'bidder.invitation.failed': 'Bidder invitation failed',
  'bidder.activation.accessed': 'Activation link opened',
  'bidder.activation.rejected': 'Activation rejected',
  'bidder.activation.setup': 'Activation started',
  'bidder.account.activated': 'Bidder account activated',

  'otp.issued': 'Verification code issued',
  'otp.verified': 'Verification code accepted',
  'otp.failed': 'Verification code rejected',

  'auth.password.reset.requested': 'Password reset requested',
  'auth.password.reset': 'Password reset',
  'auth.password.change.requested': 'Password change requested',
  'auth.password.changed': 'Password changed',

  'user.profile.updated': 'Profile updated',
  'user.created': 'User account created',
  'user.updated': 'User account updated',
  'user.password.reset': 'User password reset by administrator',
  'settings.changed': 'System settings changed',

  'announcement.published': 'Announcement published',
  'announcement.updated': 'Announcement updated',
  'announcement.withdrawn': 'Announcement withdrawn',

  'planning.cdp.recorded': 'Development plan recorded',
  'planning.cdp.adopted': 'Development plan adopted',
  'planning.priorities.set': "Mayor's priorities set",
  'planning.aip.transition': 'Investment program advanced',

  'budget.proposal.submitted': 'Budget proposal submitted',
  'budget.proposal.reviewed': 'Budget proposal reviewed',
  'budget.executive.transition': 'Executive budget advanced',
  'budget.proceeding.recorded': 'Budget proceeding recorded',
  'budget.appropriations.released': 'Appropriations released',

  'app.transition': 'APP entry advanced',
  'pr.transition': 'Requisition advanced',
  'pr.mode.determined': 'Mode of procurement determined',

  'rfq.published': 'Invitation to bid published',
  'bid.submitted': 'Bid submitted',
  'bids.opened': 'Bids opened',
  'evaluation.submitted': 'Bid evaluation submitted',
  'evaluation.closed': 'Evaluation closed',
  'award.recommended': 'Award recommended',
  'award.approved': 'Award approved',
  'bidding.failed': 'Failure of bidding declared',

  'observers.invited': 'Observers invited',
  'observers.report.filed': 'Observation report filed',

  'protest.filed': 'Protest filed',
  'protest.resolved': 'Protest resolved',

  'vendor.blacklisted': 'Supplier blacklisted',
  'vendor.blacklist.lifted': 'Blacklisting lifted',

  'contract.variation.approved': 'Variation order approved',
  'contract.terminated': 'Contract terminated',
  'contract.signed': 'Contract signed',
  'contract.ntp.issued': 'Notice to Proceed issued',

  'security.posted': 'Security posted',
  'delivery.inspected': 'Delivery inspected',
  'invoice.certified': 'Invoice certified',
  'payment.released': 'Payment released',

  'access.denied': 'Access denied',
}

// "budget.executive.transition" → "Budget executive transition". Not elegant,
// but it is readable, and it means an unmapped action never renders as a dotted
// identifier in front of an auditor.
export const actionLabel = (actionType) => {
  if (!actionType) return '—'
  if (ACTION_LABELS[actionType]) return ACTION_LABELS[actionType]
  const words = String(actionType).split('.').join(' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// The record an entry is about, e.g. "Contract #41". Folded into the Action
// cell rather than given a column of its own: an auditor needs to know which
// record was touched, but the reference is short and repeating a column header
// for it cost more width than it was worth.
export const entityLabel = (entry) => {
  if (!entry?.entityRef) return null
  const name = String(entry.entityRef).replace(/([a-z])([A-Z])/g, '$1 $2')
  const titled = name.charAt(0).toUpperCase() + name.slice(1)
  return entry.entityId ? `${titled} #${entry.entityId}` : titled
}

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
