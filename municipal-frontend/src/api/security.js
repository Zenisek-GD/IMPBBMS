import { apiClient } from './client'

export const fetchSecurityOverview = () =>
  apiClient.get('/security/overview').then((res) => res.data)

export const fetchAlerts = (params = {}) =>
  apiClient.get('/security/alerts', { params }).then((res) => res.data)

export const runScan = () => apiClient.post('/security/scan').then((res) => res.data)

export const updateAlert = (id, payload) =>
  apiClient.patch(`/security/alerts/${id}`, payload).then((res) => res.data)

export const rebaseline = (reason) =>
  apiClient.post('/security/rebaseline', { reason }).then((res) => res.data)

export const SEVERITY_TONES = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

export const STATUS_TONES = {
  open: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
  dismissed: 'neutral',
}

export const STATUS_LABELS = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

// What each alert type actually means, in the words an officer would use. The
// console shows this beside the finding, because "recordInsertedOutsideSystem"
// tells a reader what the code called it, not what happened or what to do.
export const ALERT_EXPLANATIONS = {
  recordModifiedOutsideSystem:
    'This record was changed without going through the system. Every legitimate change is fingerprinted as it is saved; this row no longer matches its fingerprint, so the change was made directly in the database.',
  recordInsertedOutsideSystem:
    'This record exists but the system never created it. It was inserted directly into the database.',
  recordDeletedOutsideSystem:
    'A record the system knew about has gone. Nothing in this system deletes these rows, so it was removed directly in the database.',
  auditChainBroken:
    'The audit log is hash-chained — each entry seals the one before it. A break means an entry was altered or removed after it was written.',
  repeatedLoginFailures:
    'An unusual number of failed sign-ins. Repeated failures against one account suggest a password is being guessed; failures spread across many accounts from one address suggest a scan.',
  repeatedMfaFailures:
    'Repeated second-factor failures. If the password was accepted but the code was not, somebody already has the password.',
  privilegeChanged:
    'What a role is permitted to do has changed. This is the change that makes every other control meaningless, so it is always reported.',
  credentialReset:
    'An administrator cleared a user’s second factor. Legitimate when somebody loses their phone, and the reason given is recorded — but it is also the route to taking over an account, so each one is surfaced.',
  offHoursAccess:
    'A consequential action performed outside office hours. Not wrong on its own — deadlines produce late nights — but worth seeing next to the rest.',
  bulkDocumentAccess:
    'An unusual volume of document downloads in a short period, which is what bulk extraction of records looks like.',
  duplicateBidDocument:
    'Two bidders submitted byte-identical documents. Independent bidders do not produce identical files; this is evidence of collusion.',
  bidIpClustering:
    'Bids for the same opportunity were submitted from the same address, which suggests one party is behind more than one bidder.',
  amountChangedAfterApproval:
    'An amount changed after the approval that authorised it, meaning what was approved is not what stands.',
}
