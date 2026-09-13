import { PR_STATUS_LABELS, PR_TRANSITION_FOR_STATUS, PR_STAGE_SEQUENCE } from '../api/purchaseRequisitions'
import { APP_STATUS_LABELS, TRANSITION_FOR_STATUS as APP_TRANSITION_FOR_STATUS } from '../api/appEntries'
import { AIP_STATUS_LABELS, AIP_TRANSITION_FOR_STATUS } from '../api/planning'
import { BUDGET_STAGES } from '../api/budgetPreparation'
import { RFQ_STATUS_LABELS } from '../api/bidding'
import { CONTRACT_STATUS_LABELS } from '../api/contracts'

// ── NEXT REQUIRED ACTION ─────────────────────────────────────────────────────
// Every active record shows what happens next: the current status, the action
// it is waiting for, the office or role that must take it, the due date where
// one exists, and what follows once it is done.
//
// Everything here derives from the same transition maps the action queues use
// (queues.js), so the dashboard and the record can never disagree about whose
// turn it is. Terminal states resolve to null — a finished record shows its
// outcome, not a next step.

// Which office or role holds each workflow permission, in plain words.
export const OWNER_BY_PERMISSION = {
  'pr.create': 'Requesting office',
  'pr.endorse': 'Head of Office',
  'pr.certifyCash': 'Municipal Treasurer',
  'pr.approve': 'Mayor (Head of the Procuring Entity)',
  'pr.certify': 'Budget Officer',
  'pr.obligate': 'Municipal Accountant',
  'pr.determineMode': 'Bids and Awards Committee (BAC)',
  'pr.review': 'BAC Secretariat',
  'app.submit': 'Requesting office',
  'app.consolidate': 'BAC Secretariat',
  'app.certify': 'Budget Officer',
  'app.approve': 'Mayor (Head of the Procuring Entity)',
  'planning.manageCdp': 'Planning Office',
  'planning.manageAip': 'Planning Office',
  'planning.setPriorities': 'Mayor (Head of the Procuring Entity)',
  'planning.adoptAip': 'Sangguniang Bayan',
  'budget.prepareExecutive': 'Budget Office',
  'budget.reviewProposal': 'Municipal Budget Council',
  'budget.consolidateProposals': 'Planning Office',
  'budget.conductForum': 'Local Finance Committee',
  'budget.conductHearing': 'Local Finance Committee',
  'budget.finaliseExecutive': 'Budget Office',
  'budget.approveExecutive': 'Mayor (Head of the Procuring Entity)',
  'budget.enactOrdinance': 'Sangguniang Bayan',
  'budget.recordProvincialReview': 'Sangguniang Panlalawigan',
  'bidding.publish': 'BAC Secretariat',
  'bidding.evaluate': 'Bids and Awards Committee (BAC)',
  'bidding.technicalInput': 'Technical Working Group (TWG)',
  'bidding.chairEvaluation': 'BAC Chairperson',
  'bidding.award': 'Mayor (Head of the Procuring Entity)',
  'bidders.createAccount': 'System Administrator (Admin/IT)',
  'contract.draft': 'BAC Secretariat',
  'contract.sign': 'Mayor (Head of the Procuring Entity)',
  'delivery.submitInvoice': 'Supplier',
  'delivery.report': 'Implementing office',
  'payment.certify': 'Municipal Accountant',
  'payment.release': 'Municipal Treasurer',
  'document.generate': 'Preparing office',
  'document.approve': 'Approving officer',
  'document.publish': 'Publishing office',
}

const humanize = (label) =>
  typeof label === 'string' && label.length > 0
    ? label.toLowerCase().replace(/^./, (char) => char.toUpperCase())
    : 'Open item'

const ownerOf = (permission, fallback = 'Responsible office') =>
  OWNER_BY_PERMISSION[permission] ?? fallback

// ── Purchase requisitions ────────────────────────────────────────────────────
// "After" comes from the stage order: the step following the one this action
// completes. Drafts and returned records re-enter at endorsement.
export const prNext = (pr) => {
  if (!pr) return null
  const next = PR_TRANSITION_FOR_STATUS[pr.status]
  if (!next) return { terminal: true, status: PR_STATUS_LABELS[pr.status] ?? pr.status }
  const position = PR_STAGE_SEQUENCE.indexOf(pr.status)
  const afterKey = PR_STAGE_SEQUENCE[position + 1]
  return {
    status: PR_STATUS_LABELS[pr.status] ?? pr.status,
    action: humanize(next.label),
    owner: next.permission === null ? 'Head of Office' : ownerOf(next.permission),
    dueAt: pr.dateRequired ?? null,
    after: afterKey ? PR_STATUS_LABELS[afterKey] ?? null : null,
  }
}

// ── Annual Procurement Plan ──────────────────────────────────────────────────
const APP_ORDER = ['draft', 'pendingConsolidation', 'pendingBudgetCertification', 'pendingHopeApproval', 'approved', 'locked']

export const appNext = (entry) => {
  if (!entry) return null
  const next = APP_TRANSITION_FOR_STATUS[entry.status]
  if (!next) return { terminal: true, status: APP_STATUS_LABELS[entry.status] ?? entry.status }
  const afterKey = APP_ORDER[APP_ORDER.indexOf(entry.status) + 1]
  return {
    status: APP_STATUS_LABELS[entry.status] ?? entry.status,
    action: humanize(next.label),
    owner: ownerOf(next.permission),
    dueAt: null,
    after: afterKey ? (APP_STATUS_LABELS[afterKey] ?? null) : null,
  }
}

// ── Annual Investment Program ────────────────────────────────────────────────
const AIP_ORDER = ['draft', 'pendingMayorEndorsement', 'pendingSanggunianAdoption', 'adopted']

export const aipNext = (program) => {
  if (!program) return null
  const next = AIP_TRANSITION_FOR_STATUS[program.status]
  if (!next) return { terminal: true, status: AIP_STATUS_LABELS[program.status] ?? program.status }
  const afterKey = AIP_ORDER[AIP_ORDER.indexOf(program.status) + 1]
  return {
    status: AIP_STATUS_LABELS[program.status] ?? program.status,
    action: humanize(next.label),
    owner: ownerOf(next.permission),
    dueAt: null,
    after: afterKey ? (AIP_STATUS_LABELS[afterKey] ?? null) : null,
  }
}

// ── Budget preparation ───────────────────────────────────────────────────────
// The stage itself names its owner (stage.body), so no permission lookup.
export const budgetNext = (budget) => {
  if (!budget) return null
  const index = BUDGET_STAGES.findIndex((stage) => stage.key === budget.status)
  const stage = BUDGET_STAGES[index]
  if (!stage?.action) return { terminal: true, status: budget.statusLabel ?? stage?.label ?? budget.status }
  const after = BUDGET_STAGES[index + 1]
  return {
    status: budget.statusLabel ?? stage.label,
    action: humanize(stage.actionLabel ?? stage.action),
    owner: stage.body ?? 'Responsible office',
    dueAt: null,
    after: after ? after.label : null,
  }
}

// ── Solicitations ────────────────────────────────────────────────────────────
const RFQ_NEXT = {
  draft: { action: 'Complete the schedule and publish', owner: 'BAC Secretariat', after: 'Published — open for submission' },
  published: { action: 'Close submission when the deadline passes', owner: 'BAC Secretariat', after: 'Bid opening and evaluation' },
  closed: { action: 'Open the bids', owner: 'BAC Secretariat', after: 'Evaluation' },
  opened: { action: 'Evaluate the bids', owner: 'Bids and Awards Committee (BAC)', after: 'Award recommendation' },
  evaluated: { action: 'Approve the award', owner: 'Mayor (Head of the Procuring Entity)', after: 'Contract drafting' },
  awarded: { action: 'Draft the contract', owner: 'BAC Secretariat', after: 'Signatures' },
  failed: { action: 'Create a rebid', owner: 'BAC Secretariat', after: 'New solicitation' },
  cancelled: { action: 'Create a rebid', owner: 'BAC Secretariat', after: 'New solicitation' },
}

export const rfqNext = (rfq) => {
  if (!rfq) return null
  const preset = RFQ_NEXT[rfq.status]
  if (!preset) return { terminal: true, status: RFQ_STATUS_LABELS[rfq.status] ?? rfq.status }
  return {
    status: RFQ_STATUS_LABELS[rfq.status] ?? rfq.status,
    ...preset,
    dueAt: rfq.closingDate ?? rfq.bidOpeningAt ?? null,
  }
}

// ── Awards ───────────────────────────────────────────────────────────────────
export const awardNext = (award) => {
  if (!award) return null
  if (award.status === 'pendingHopeApproval') {
    return {
      status: 'Pending approval',
      action: 'Approve and issue the Notice of Award',
      owner: 'Mayor (Head of the Procuring Entity)',
      dueAt: null,
      after: 'Contract drafting',
    }
  }
  return { terminal: true, status: award.statusLabel ?? award.status }
}

// ── Contracts ────────────────────────────────────────────────────────────────
export const contractNext = (contract) => {
  if (!contract) return null
  const status = CONTRACT_STATUS_LABELS[contract.status] ?? contract.status
  if (contract.status === 'draft') {
    return { status, action: 'Finish and issue the draft', owner: 'BAC Secretariat', dueAt: contract.deliveryDeadline ?? null, after: 'Signatures (Mayor for the LGU, supplier for their side)' }
  }
  if (contract.status === 'pendingSignatures') {
    const missing = !contract.signedByLguAt ? 'Mayor (Head of the Procuring Entity)' : 'Supplier'
    return { status, action: 'Sign the contract', owner: missing, dueAt: contract.deliveryDeadline ?? null, after: 'Active contract — delivery and acceptance' }
  }
  if (contract.status === 'active') {
    return { status, action: 'Complete delivery and acceptance', owner: 'Implementing office and supplier', dueAt: contract.deliveryDeadline ?? null, after: 'Completion and payment' }
  }
  return { terminal: true, status }
}

// ── Invoices ─────────────────────────────────────────────────────────────────
const INVOICE_STATUS_LABELS = {
  submitted: 'Submitted',
  certified: 'Certified',
  returned: 'Returned',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export const invoiceNext = (invoice) => {
  if (!invoice) return null
  const status = INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status
  if (invoice.status === 'submitted') {
    return { status, action: 'Certify the voucher', owner: 'Municipal Accountant', dueAt: null, after: 'Treasury release' }
  }
  if (invoice.status === 'certified') {
    return { status, action: 'Release the payment', owner: 'Municipal Treasurer', dueAt: null, after: 'Paid' }
  }
  if (invoice.status === 'returned') {
    return { status, action: 'Correct and resubmit', owner: 'Supplier', dueAt: null, after: 'Certification' }
  }
  return { terminal: true, status }
}

// ── Generated documents ──────────────────────────────────────────────────────
export const documentNext = (doc) => {
  if (!doc) return null
  const status = doc.statusLabel ?? doc.status
  if (doc.status === 'draft') {
    return { status, action: 'Review and approve', owner: 'Approving officer', dueAt: null, after: doc.publishable ? 'Publish' : 'Issue' }
  }
  if (doc.status === 'approved' && doc.publishable && !doc.isPublic) {
    return { status, action: 'Publish the document', owner: 'Publishing office', dueAt: null, after: 'Public on the transparency portal' }
  }
  return { terminal: true, status }
}

// ── Development plan ─────────────────────────────────────────────────────────
export const planNext = (plan) => {
  if (!plan) return null
  if (plan.status === 'draft') {
    const goals = plan.goals?.length ?? 0
    return {
      status: 'Draft',
      action: goals === 0 ? 'Add the first goal, then record adoption' : 'Record adoption',
      owner: goals === 0 ? 'Planning Office' : 'Sangguniang Bayan',
      dueAt: null,
      after: 'Mayor\u2019s priorities and the Annual Investment Program',
    }
  }
  return { terminal: true, status: plan.status === 'adopted' ? 'Adopted' : (plan.status ?? '') }
}
