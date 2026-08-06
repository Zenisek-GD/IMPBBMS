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
const entry = ({ id, title, subtitle, stage, href, amount }) => ({
  id,
  title,
  subtitle,
  stage,
  href,
  amount,
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
    .map((pr) =>
      entry({
        id: `pr-${pr.id}`,
        title: pr.prNumber,
        subtitle: pr.appEntryTitle ?? pr.purpose ?? 'Requisition',
        stage: PR_STATUS_LABELS[pr.status] ?? pr.status,
        href: '/purchase-requisitions',
        amount: pr.totalAmount,
      })
    )

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
    .map((vendor) =>
      entry({
        id: `vendor-${vendor.id}`,
        title: vendor.businessName,
        subtitle: vendor.contactEmail ?? 'No email on file',
        stage:
          vendor.registrationStatus === 'submitted'
            ? 'Awaiting review'
            : 'Approved — account not issued',
        href: permissions.has('bidding.publish') ? '/secretariat/vendors' : '/admin/bidder-accounts',
      })
    )

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
      })
    )
