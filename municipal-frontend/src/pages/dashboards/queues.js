import { PR_STATUS_LABELS, PR_TRANSITION_FOR_STATUS } from '../../api/purchaseRequisitions'
import { APP_STATUS_LABELS, TRANSITION_FOR_STATUS as APP_TRANSITION_FOR_STATUS } from '../../api/appEntries'
import { BUDGET_STAGES } from '../../api/budgetPreparation'
import { AIP_TRANSITION_FOR_STATUS } from '../../api/planning'
import { RFQ_STATUS_LABELS } from '../../api/bidding'

// ── WHAT IS WAITING ON THIS OFFICER ──────────────────────────────────────────
// The old shared workspace showed everyone the same "Your queue" panel, fed by
// the generic pending-items list. An Accountant signed in, saw nothing about
// the requisitions awaiting their obligation, and reasonably concluded the role
// could not do anything — which is what prompted this rewrite.
//
// Every queue below is *derived*, not hardcoded per role. Each workflow in this
// system already declares, per status, which permission may advance it:
//
//   PR_TRANSITION_FOR_STATUS.pendingAccountantObligation.permission === 'pr.obligate'
//
// So "what is waiting on me" is exactly "rows whose next transition needs a
// permission I hold". That means a queue cannot drift away from the workflow it
// describes: change the stage map and the dashboards follow. Nobody has to
// remember to update a second list.
//
// The one deliberate exception is requisition endorsement, which the workflow
// map marks `permission: null` because it is gated by department *headship* on
// the server rather than by a permission. It is offered to holders of
// `pr.endorse` and the API refuses anyone who is not the head of that office.

const ENDORSEMENT_PERMISSION = 'pr.endorse'

// A queue entry is deliberately flat: everything a card needs to draw a row and
// send the reader to the right screen, and nothing else.
//
// `action` is the plain-language verb for what the officer must do
// ("Confirm available budget"), distinct from `stage` (why it is waiting:
// "Pending Treasurer — availability of funds") and `actionLabel` (the short
// button text: "Open budget certification").
const humanize = (label) =>
  typeof label === 'string' && label.length > 0
    ? label.toLowerCase().replace(/^./, (char) => char.toUpperCase())
    : 'Open item'

const entry = ({ id, title, subtitle, stage, href, amount, dueAt = null, actionLabel = 'Open item', action = null }) => ({
  id,
  title,
  subtitle,
  stage,
  href,
  amount,
  dueAt,
  actionLabel,
  action: action ?? humanize(actionLabel),
})

const canAct = (permissions, permission) =>
  permission === null ? false : permissions.has(permission)

export const requisitionQueue = (prs, permissions) =>
  (prs ?? [])
    .filter((pr) => {
      const next = PR_TRANSITION_FOR_STATUS[pr.status]
      if (!next) return false
      // Endorsement: no permission on the map, so fall back to `pr.endorse`.
      if (next.permission === null) return permissions.has(ENDORSEMENT_PERMISSION)
      return canAct(permissions, next.permission)
    })
    .map((pr) => {
      const next = PR_TRANSITION_FOR_STATUS[pr.status]
      return entry({
        id: `pr-${pr.id}`,
        title: pr.prNumber,
        subtitle: pr.appEntryTitle ?? pr.purpose ?? 'Requisition',
        stage: PR_STATUS_LABELS[pr.status] ?? pr.status,
        href: '/purchase-requisitions',
        amount: pr.totalAmount,
        dueAt: pr.dateRequired ?? null,
        action: humanize(next?.label),
        actionLabel: pr.status === 'returned' ? 'Correct and resubmit' : 'Open requisition',
      })
    })

export const appQueue = (entries, permissions) =>
  (entries ?? [])
    .filter((row) => canAct(permissions, APP_TRANSITION_FOR_STATUS[row.status]?.permission))
    .map((row) =>
      entry({
        id: `app-${row.id}`,
        title: row.projectTitle,
        subtitle: row.implementingUnitCode ?? 'APP entry',
        stage: APP_STATUS_LABELS[row.status] ?? row.status,
        href: '/app-entries',
        amount: row.abc,
        action: humanize(APP_TRANSITION_FOR_STATUS[row.status]?.label),
        actionLabel: 'Open APP entry',
      })
    )

export const budgetQueue = (budgets, permissions) =>
  (budgets ?? [])
    .filter((budget) => {
      const stage = BUDGET_STAGES.find((s) => s.key === budget.status)
      return Boolean(stage?.action) && canAct(permissions, stage.permission)
    })
    .map((budget) => {
      const stage = BUDGET_STAGES.find((s) => s.key === budget.status)
      return entry({
        id: `budget-${budget.id}`,
        title: budget.title,
        subtitle: `${stage.body} — ${stage.label}`,
        stage: budget.statusLabel ?? stage.label,
        href: '/budget/preparation',
        action: humanize(stage.actionLabel),
        actionLabel: 'Open budget item',
      })
    })

export const investmentProgramQueue = (programs, permissions) =>
  (programs ?? [])
    .filter((program) => canAct(permissions, AIP_TRANSITION_FOR_STATUS[program.status]?.permission))
    .map((program) =>
      entry({
        id: `aip-${program.id}`,
        title: program.title,
        subtitle: 'Investment program',
        stage: program.statusLabel ?? program.status,
        href: '/planning',
        amount: program.totalEstimatedCost,
        action: humanize(AIP_TRANSITION_FOR_STATUS[program.status]?.label),
        actionLabel: 'Open program',
      })
    )

// Invoices and vendors have no status→permission map of their own, so these two
// spell the rule out. Kept beside the derived queues rather than inside the
// dashboards so every "waiting on you" rule in the system is in one file.
export const invoiceQueue = (invoices, permissions) =>
  (invoices ?? [])
    .filter((invoice) => {
      if (invoice.status === 'submitted') return permissions.has('payment.certify')
      // Certified but not yet released is the Treasurer's.
      if (invoice.status === 'certified') return permissions.has('payment.release')
      return false
    })
    .map((invoice) =>
      entry({
        id: `invoice-${invoice.id}`,
        title: invoice.invoiceNo,
        subtitle: `${invoice.vendorName ?? 'Supplier'} · ${invoice.contractNo ?? '—'}`,
        stage: invoice.status === 'submitted' ? 'Awaiting certification' : 'Awaiting release',
        href: '/invoices',
        amount: invoice.amount,
        action: invoice.status === 'submitted' ? 'Certify the voucher' : 'Release the payment',
        actionLabel: 'Open invoice',
      })
    )

export const vendorQueue = (vendors, permissions) =>
  (vendors ?? [])
    .filter((vendor) => {
      if (vendor.registrationStatus === 'submitted') return permissions.has('bidding.publish')
      // Approved by the Secretariat and waiting on Admin/IT to issue the login.
      if (vendor.canCreateAccount) return permissions.has('bidders.createAccount')
      return false
    })
    .map((vendor) => {
      const needsAccount = vendor.registrationStatus !== 'submitted'
      return entry({
        id: `vendor-${vendor.id}`,
        title: vendor.businessName,
        subtitle: vendor.contactEmail ?? 'No email on file',
        stage:
          vendor.registrationStatus === 'submitted'
            ? 'Awaiting review'
            : 'Approved — account not issued',
        href: permissions.has('bidding.publish') ? '/secretariat/vendors' : '/admin/bidder-accounts',
        action: needsAccount ? 'Issue the bidder account' : 'Review the registration',
        actionLabel: needsAccount ? 'Open account issuance' : 'Open review',
      })
    })

// Procurements sitting at a stage this officer works on. Unlike the queues
// above there is no single "next action" per RFQ — the Evaluation workspace
// holds several — so this reports the stage rather than the act.
export const evaluationQueue = (rfqs, permissions) => {
  const scores = permissions.hasAny('bidding.evaluate', 'bidding.technicalInput')
  const chairs = permissions.has('bidding.chairEvaluation')
  const awards = permissions.has('bidding.award')

  return (rfqs ?? [])
    .filter((rfq) => {
      if (rfq.status === 'opened') return scores || chairs
      if (rfq.status === 'evaluated') return chairs || awards
      return false
    })
    .map((rfq) =>
      entry({
        id: `rfq-${rfq.id}`,
        title: rfq.referenceNo,
        subtitle: rfq.title,
        stage: RFQ_STATUS_LABELS[rfq.status] ?? rfq.status,
        href: '/evaluation',
        amount: rfq.abc,
        dueAt: rfq.submissionDeadline ?? rfq.bidOpeningAt ?? null,
        actionLabel: rfq.status === 'opened' ? 'Open evaluation' : 'Open award review',
      })
    )
}

export const contractQueue = (contracts, permissions) =>
  (contracts ?? [])
    .filter((contract) => {
      if (contract.status === 'draft') return permissions.has('contract.draft')
      if (contract.status === 'pendingSignatures') {
        // The LGU's signature is the Mayor's; the supplier signs their own side.
        if (permissions.has('contract.sign') && !contract.signedByLguAt) return true
        if (permissions.has('delivery.submitInvoice') && !contract.signedByVendorAt) return true
      }
      return false
    })
    .map((contract) =>
      entry({
        id: `contract-${contract.id}`,
        title: contract.contractNo,
        subtitle: contract.projectTitle ?? contract.vendorName ?? 'Contract',
        stage: contract.status === 'draft' ? 'Draft — not issued' : 'Awaiting signature',
        href: '/contracts',
        amount: contract.amount,
        action: contract.status === 'draft' ? 'Finish the contract draft' : 'Sign the contract',
        actionLabel: 'Open contract',
      })
    )

// Documents waiting on this officer: drafts to keep preparing, drafts awaiting
// approval, and approved documents awaiting publication. Each step belongs to a
// different office, so most of what an officer sees here is exactly one action.
export const documentQueue = (documents, permissions) => {
  const canApprove = permissions.has('document.approve')
  const canPublish = permissions.has('document.publish')
  const canGenerate = permissions.has('document.generate')

  return (documents ?? [])
    .filter((doc) => {
      if (!doc || doc.status === 'void') return false
      if (doc.status === 'draft' && canApprove) return true
      if (doc.status === 'draft' && canGenerate) return true
      if (doc.status === 'approved' && doc.publishable && !doc.isPublic && canPublish) return true
      return false
    })
    .map((doc) => {
      const needsApproval = doc.status === 'draft' && canApprove
      const needsPublish = doc.status === 'approved'
      return entry({
        id: `doc-${doc.id}`,
        title: doc.documentNo ?? doc.title ?? 'Document',
        subtitle: doc.title && doc.documentNo ? doc.title : (doc.documentTypeLabel ?? 'Document'),
        stage: needsApproval ? 'Awaiting approval' : needsPublish ? 'Approved — ready to publish' : 'Draft — continue preparation',
        href: '/documents',
        action: needsApproval ? 'Review and approve' : needsPublish ? 'Publish the document' : 'Continue preparation',
        actionLabel: 'Open document',
      })
    })
}

// Failed or cancelled procurements that need a rebid. The rebid itself is
// initiated from the attempt history by the Secretariat or the BAC chair.
export const rebidQueue = (rfqs, permissions) => {
  const canRebid = permissions.hasAny('bidding.publish', 'bidding.chairEvaluation')

  return (rfqs ?? [])
    .filter((rfq) => ['failed', 'cancelled'].includes(rfq?.status) && canRebid)
    .map((rfq) =>
      entry({
        id: `rebid-${rfq.id}`,
        title: rfq.referenceNo ?? rfq.title ?? 'Procurement',
        subtitle: rfq.title ?? 'Procurement',
        stage: rfq.status === 'failed' ? 'Failed bidding — rebid needed' : 'Cancelled — rebid needed',
        href: '/secretariat/rfq',
        amount: rfq.abc,
        action: 'Create a rebid',
        actionLabel: 'Open rebid',
      })
    )
}

// ── RECENTLY COMPLETED BY YOU ────────────────────────────────────────────────
// Authorship is matched by the signed-in user's name against the stage actor
// names the APIs publish (PR signatures, document approval/publication). There
// is no separate "completed by" field, so anything unattributable is left out
// rather than guessed at.
const samePerson = (actorName, userName) =>
  typeof actorName === 'string' &&
  typeof userName === 'string' &&
  actorName.trim().localeCompare(userName.trim(), undefined, { sensitivity: 'base' }) === 0

export const recentlyCompleted = (data, user, limit = 5) => {
  const items = []
  const push = ({ id, title, subtitle, detail, completedAt, href }) => {
    const time = completedAt ? new Date(completedAt).getTime() : NaN
    if (Number.isNaN(time)) return
    items.push({ id, title, subtitle, detail, completedAt, href, time })
  }

  for (const pr of data?.prs ?? []) {
    const stages = [
      [pr.requesterName, pr.submittedAt, 'submitted'],
      [pr.cashCertifiedByName, pr.cashCertifiedAt, 'confirmed available budget for'],
      [pr.mayorApprovedByName, pr.mayorApprovedAt, 'approved'],
      [pr.appropriationCertifiedByName, pr.appropriationCertifiedAt, 'confirmed the appropriation for'],
      [pr.obligatedByName, pr.fundsReservedAt, 'recorded the obligation for'],
      [pr.modeDeterminedByName, pr.modeDeterminedAt, 'determined the procurement mode for'],
    ]
    let latest = null
    for (const [actor, at, verb] of stages) {
      if (!samePerson(actor, user?.name) || !at) continue
      if (!latest || new Date(at) > new Date(latest.at)) latest = { at, verb }
    }
    if (latest) {
      push({
        id: `done-pr-${pr.id}`,
        title: pr.prNumber ?? 'Requisition',
        subtitle: pr.appEntryTitle ?? pr.purpose ?? '',
        detail: `You ${latest.verb} this requisition`,
        completedAt: latest.at,
        href: '/purchase-requisitions',
      })
    }
  }

  for (const doc of data?.documents ?? []) {
    if (samePerson(doc.approvedByName, user?.name) && doc.approvedAt) {
      push({
        id: `done-doc-approve-${doc.id}`,
        title: doc.documentNo ?? doc.title ?? 'Document',
        subtitle: doc.title ?? '',
        detail: 'You approved this document',
        completedAt: doc.approvedAt,
        href: '/documents',
      })
    } else if (samePerson(doc.publishedByName, user?.name) && doc.publishedAt) {
      push({
        id: `done-doc-publish-${doc.id}`,
        title: doc.documentNo ?? doc.title ?? 'Document',
        subtitle: doc.title ?? '',
        detail: 'You published this document',
        completedAt: doc.publishedAt,
        href: '/documents',
      })
    } else if (samePerson(doc.generatedByName, user?.name) && doc.status !== 'draft' && doc.createdAt) {
      push({
        id: `done-doc-generate-${doc.id}`,
        title: doc.documentNo ?? doc.title ?? 'Document',
        subtitle: doc.title ?? '',
        detail: 'A document you prepared moved forward',
        completedAt: doc.createdAt,
        href: '/documents',
      })
    }
  }

  return items.sort((a, b) => b.time - a.time).slice(0, limit)
}
