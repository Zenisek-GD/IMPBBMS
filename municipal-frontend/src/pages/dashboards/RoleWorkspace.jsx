import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Inbox, ShieldCheck, Landmark, Gavel } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useAuth } from '../../context/useAuth'
import { usePermissions } from '../../context/usePermissions'
import { ROLE_NAV } from '../../config/navigation'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

// ── ONE REAL WORKSPACE, REPLACING TWELVE FAKE DASHBOARDS ─────────────────────
// Each role used to land on a bespoke dashboard built entirely from hardcoded
// data: invented CPU load figures, invented officials, invented PR numbers.
// They looked impressive and stated things that were not true — a reader who
// clicked one and saw a name that is not in the database would reasonably
// conclude the whole system was a mockup.
//
// This shows the same four things for every role, all of them real:
//   · what is actually in the system that this role can see
//   · what is waiting on this role specifically
//   · this role's recent activity, from the audit log
//   · where to go next, taken from the role's own navigation
//
// It is deliberately plainer than what it replaced. A smaller true dashboard is
// worth more than a large false one.

const peso = (value) =>
  `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const dateTime = (value) =>
  new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// Endpoints are only called when the role's permissions allow them, so a
// Treasurer does not trigger a 403 storm fetching bidding data.
const safeGet = (path, params) =>
  apiClient
    .get(path, { params })
    .then((res) => res.data)
    .catch(() => null)

export default function RoleWorkspace() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let cancelled = false

    const wanted = {
      budget: permissions.has('budget.view') ? safeGet('/finance/budget-monitor') : null,
      pending: permissions.has('pr.view') || permissions.has('budget.view')
        ? safeGet('/finance/pending-items')
        : null,
      audit: permissions.has('audit.viewAll') || permissions.has('audit.viewLogs')
        ? safeGet('/audit', { limit: 8 })
        : null,
      publicOverview: safeGet('/public/projects/overview'),
    }

    Promise.all(Object.values(wanted)).then((results) => {
      if (cancelled) return
      const keys = Object.keys(wanted)
      const next = { loading: false }
      keys.forEach((key, index) => {
        next[key] = results[index]
      })
      setState(next)
    })

    return () => {
      cancelled = true
    }
  }, [permissions])

  const nav = ROLE_NAV[user?.role]
  const quickLinks = nav?.sections?.flatMap((section) => section.items) ?? []
  const { budget, pending, audit, publicOverview } = state

  return (
    <DashboardPage>
      <PageHeader
        title={`${user?.roleName ?? 'Workspace'}`}
        subtitle={`Signed in as ${user?.name}${user?.departmentName ? ` · ${user.departmentName}` : ''}`}
      />

      <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-[13px] text-text-secondary">
          Every figure on this page is read from the database. Nothing here is sample data.
        </p>
      </div>

      {state.loading ? (
        <p className="text-[13px] text-text-faint">Loading your workspace…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border-muted bg-surface p-4">
              <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                Published Projects
              </p>
              <p className="mt-1 text-lg font-bold text-navy">{publicOverview?.totalProjects ?? '—'}</p>
              <p className="mt-1 text-xs text-text-faint">
                {publicOverview
                  ? `${publicOverview.ongoing} ongoing · ${publicOverview.completed} completed`
                  : 'Transparency portal'}
              </p>
            </div>

            {budget && (
              <>
                <div className="rounded-lg border border-border-muted bg-surface p-4">
                  <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                    Appropriated
                  </p>
                  <p className="mt-1 text-lg font-bold text-navy">{peso(budget.totals.appropriated)}</p>
                  <p className="mt-1 text-xs text-text-faint">FY{budget.fiscalYear} by ordinance</p>
                </div>
                <div className="rounded-lg border border-border-muted bg-surface p-4">
                  <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                    Obligated
                  </p>
                  <p className="mt-1 text-lg font-bold text-navy">{peso(budget.totals.obligated)}</p>
                  <p className="mt-1 text-xs text-text-faint">Committed by certified ORS</p>
                </div>
                <div className="rounded-lg border border-border-muted bg-surface p-4">
                  <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                    Unobligated
                  </p>
                  <p className="mt-1 text-lg font-bold text-warning">{peso(budget.totals.unobligated)}</p>
                  <p className="mt-1 text-xs text-text-faint">{budget.daysToYearEnd} days to year-end</p>
                </div>
              </>
            )}

            {!budget && publicOverview && (
              <>
                <div className="rounded-lg border border-border-muted bg-surface p-4">
                  <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                    Total Contracted
                  </p>
                  <p className="mt-1 text-lg font-bold text-navy">{peso(publicOverview.totalContracted)}</p>
                </div>
                <div className="rounded-lg border border-border-muted bg-surface p-4">
                  <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                    Total Disbursed
                  </p>
                  <p className="mt-1 text-lg font-bold text-success">{peso(publicOverview.totalDisbursed)}</p>
                </div>
                <div className="rounded-lg border border-border-muted bg-surface p-4">
                  <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                    Upcoming
                  </p>
                  <p className="mt-1 text-lg font-bold text-navy">{publicOverview.upcoming}</p>
                  <p className="mt-1 text-xs text-text-faint">Planned, not yet advertised</p>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Your queue" icon={Inbox} bodyClassName="">
              {!pending || pending.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                  Nothing is waiting on you.
                </p>
              ) : (
                <ul className="divide-y divide-border-muted">
                  {pending.slice(0, 6).map((item) => (
                    <li key={item.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-navy">{item.title ?? item.description}</p>
                        {item.priority && (
                          <Badge tone={item.priority === 'high' ? 'danger' : 'warning'}>{item.priority}</Badge>
                        )}
                      </div>
                      {item.notes && <p className="mt-1 text-[12px] text-text-secondary">{item.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Recent system activity" icon={Activity} bodyClassName="">
              {!audit || audit.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                  {permissions.has('audit.viewAll') || permissions.has('audit.viewLogs')
                    ? 'No recorded activity yet.'
                    : 'Your role does not have access to the audit trail.'}
                </p>
              ) : (
                <ul className="divide-y divide-border-muted">
                  {audit.slice(0, 6).map((entry) => (
                    <li key={entry.id} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[13px] text-navy">{entry.summary}</p>
                        <time className="font-mono text-[11px] text-text-faint">
                          {dateTime(entry.recordedAt)}
                        </time>
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-faint">
                        {entry.actorName ?? 'System'}
                        {entry.actorRole ? ` · ${entry.actorRole}` : ''} · {entry.actionType}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Where to go next" icon={Gavel} bodyClassName="">
            {quickLinks.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                No modules are configured for this role.
              </p>
            ) : (
              <div className="grid gap-px bg-border-muted sm:grid-cols-2 lg:grid-cols-3">
                {quickLinks.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="group flex items-center justify-between gap-3 bg-surface px-4 py-3 hover:bg-sidebar"
                  >
                    <span className="flex items-center gap-2.5 text-[13px] text-navy">
                      {item.icon ? <item.icon size={15} className="shrink-0 text-navy/50" /> : null}
                      {item.label}
                    </span>
                    <ArrowRight
                      size={15}
                      className="shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Link
            to="/"
            className="flex items-center gap-2 text-[12px] font-medium tracking-[0.02em] text-navy hover:underline"
          >
            <Landmark size={14} /> View the public transparency portal
          </Link>
        </>
      )}
    </DashboardPage>
  )
}
