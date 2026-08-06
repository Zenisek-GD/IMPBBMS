import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../../context/usePermissions'
import { fetchPrs } from '../../api/purchaseRequisitions'
import { fetchAppEntries } from '../../api/appEntries'
import { fetchBudgets } from '../../api/budgetPreparation'
import { fetchPrograms } from '../../api/planning'
import { fetchRfqs, fetchVendors } from '../../api/bidding'
import { fetchContracts } from '../../api/contracts'
import { fetchInvoices, fetchBudgetMonitor, fetchPendingItems } from '../../api/finance'
import { fetchAuditLog } from '../../api/insights'
import { fetchPublicOverview } from '../../api/publicProjects'
import * as queues from './queues'

// ── WHAT EACH DASHBOARD NEEDS, AND NOTHING MORE ──────────────────────────────
// Every source is gated on a permission the caller actually holds. That is not
// only politeness towards the API: the previous shared workspace fired requests
// a Treasurer had no right to make and swallowed the 403s, which meant the
// browser console filled with denials on every sign-in and a real failure was
// impossible to spot among them.
//
// A source that is not requested resolves to `undefined`, which the queue
// builders treat as "no rows" rather than "empty" — the difference matters,
// because a card should say "you have no access to this" rather than "nothing
// is waiting on you".

const SOURCES = {
  prs: { permission: 'pr.view', load: () => fetchPrs() },
  appEntries: { permission: 'app.view', load: () => fetchAppEntries() },
  budgets: { permission: 'budget.view', load: () => fetchBudgets() },
  programs: { permission: 'planning.view', load: () => fetchPrograms() },
  rfqs: { permission: 'bidding.view', load: () => fetchRfqs() },
  vendors: { anyOf: ['bidding.publish', 'bidders.createAccount'], load: () => fetchVendors() },
  contracts: { permission: 'contract.view', load: () => fetchContracts() },
  invoices: { permission: 'payment.view', load: () => fetchInvoices() },
  budgetMonitor: { permission: 'budget.view', load: () => fetchBudgetMonitor() },
  pendingItems: { anyOf: ['pr.view', 'budget.view'], load: () => fetchPendingItems() },
  // ── Recent system activity ────────────────────────────────────────────────
  // Deliberately NOT `audit.viewAll`, which ten roles hold. The activity feed
  // is oversight, and oversight belongs to the Administrator, the Mayor as Head
  // of the Procuring Entity, and the Internal Auditor — whose entire statutory
  // job is reading this trail. Every other role sees its own work instead.
  audit: { anyOf: ['audit.viewLogs', 'audit.export'], load: () => fetchAuditLog({ limit: 8 }) },
  // Public, so no gate — and it is the one figure every role can be shown.
  publicOverview: { load: () => fetchPublicOverview() },
}

const allowed = (permissions, source) => {
  if (source.permission) return permissions.has(source.permission)
  if (source.anyOf) return permissions.hasAny(...source.anyOf)
  return true
}

export function useDashboardData(needs) {
  const permissions = usePermissions()
  const [state, setState] = useState({ loading: true, data: {} })

  // `needs` is a fresh array on every render at the call site, so it is joined
  // into a stable string before being used as an effect dependency — otherwise
  // the fetch would re-run forever.
  const key = needs.join(',')

  useEffect(() => {
    let cancelled = false
    const wanted = key ? key.split(',') : []

    const jobs = wanted
      .filter((name) => SOURCES[name] && allowed(permissions, SOURCES[name]))
      .map((name) =>
        SOURCES[name]
          .load()
          .then((value) => [name, value])
          // A single failing source must not blank the whole dashboard.
          .catch(() => [name, undefined])
      )

    Promise.all(jobs).then((results) => {
      if (cancelled) return
      setState({ loading: false, data: Object.fromEntries(results) })
    })

    return () => {
      cancelled = true
    }
  }, [key, permissions])

  const data = state.data

  // Queues are derived from the loaded data and the caller's permissions, so
  // they stay correct without anything here knowing which role is signed in.
  const queue = useMemo(
    () =>
      [
        ...queues.requisitionQueue(data.prs, permissions),
        ...queues.appQueue(data.appEntries, permissions),
        ...queues.budgetQueue(data.budgets, permissions),
        ...queues.investmentProgramQueue(data.programs, permissions),
        ...queues.evaluationQueue(data.rfqs, permissions),
        ...queues.vendorQueue(data.vendors, permissions),
        ...queues.contractQueue(data.contracts, permissions),
        ...queues.invoiceQueue(data.invoices, permissions),
      ],
    [data, permissions]
  )

  return { loading: state.loading, data, queue }
}
