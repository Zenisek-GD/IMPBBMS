import { useState } from 'react'
import WorkspaceFiscalYear from '../../components/ui/WorkspaceFiscalYear'
import { useActionQueue } from '../../context/useActionQueue'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Inbox, Landmark, Compass, Bell, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { ROLE_NAV } from '../../config/navigation'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'
import { dashboardFor } from './dashboardConfig'
import { useDashboardData } from './useDashboardData'
import { recentlyCompleted } from './queues'

// ── THE ROLE'S OWN DASHBOARD ─────────────────────────────────────────────────
// This file used to render one identical screen for thirteen routes. The four
// cards were the same for everybody and "Your queue" was fed by the generic
// pending-items list rather than by the stages actually waiting on the signed-in
// officer — so an Accountant, who cannot be bypassed under LGC Sec. 344, opened
// their dashboard and saw nothing to do.
//
// What differs per role now comes from dashboardConfig.js; what is *derived* —
// the queue — comes from the workflow stage maps in queues.js, so it cannot
// drift away from the process it describes.
//
// The shape stays the same everywhere on purpose: a line about the office, its
// own figures, its queue, and where to go next. Officers move between screens
// all day; the furniture should not move with them.

const peso = (value) =>
  `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const dateTime = (value) =>
  new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const dueState = (item) => {
  if (!item.dueAt) return null
  const date = new Date(item.dueAt)
  if (Number.isNaN(date.getTime())) return null
  return { label: `${item.urgency === 'overdue' ? 'Overdue since' : 'Due'} ${date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}`, tone: item.urgency === 'overdue' ? 'text-danger' : item.urgency === 'urgent' ? 'text-warning' : 'text-text-faint' }
}

const TONE_TEXT = {
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
}

const isQueueOverdue = (item) => item.urgency === 'overdue'
const isQueueDueSoon = (item) => item.urgency === 'urgent'

function StatCard({ label, value, hint, tone }) {
  return (
    <div className="rounded-lg border border-border-muted bg-surface p-4">
      <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold ${TONE_TEXT[tone] ?? 'text-navy'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
    </div>
  )
}

export default function RoleWorkspace() {
  const { user } = useAuth()
  const actions = useActionQueue()
  const [expandedActions, setExpandedActions] = useState(false)
  const config = dashboardFor(user?.role)
  const { loading, data, queue, failedSources, retry } = useDashboardData(config.needs)

  const nav = ROLE_NAV[user?.role]
  const quickLinks = nav?.sections?.flatMap((section) => section.items) ?? []
  const stats = loading ? [] : (config.stats?.(data) ?? [])
  const done = loading ? [] : recentlyCompleted(data, user)

  // Urgency grouping: overdue first, then due within three days, then the
  // rest. An item without a due date is never "overdue" — it simply waits.
  const overdue = queue.filter(isQueueOverdue)
  const dueSoon = queue.filter(isQueueDueSoon)
  const waiting = queue.filter((item) => !isQueueOverdue(item) && !isQueueDueSoon(item))

  // Only the Administrator, the Mayor and the Internal Auditor. The feed used to
  // be gated on `audit.viewAll`, which ten roles hold — so a Treasurer's
  // dashboard led with the whole municipality's activity instead of their own
  // work. The Auditor keeps it because reading this trail is the job.
  const showActivity = config.showActivity && Array.isArray(data.audit)
  const unreadNotifications = actions.notifications.filter((notice) => !notice.readAt)

  return (
    <DashboardPage>
      <PageHeader
        title={`${user?.roleName ?? 'Dashboard'}`}
        subtitle={`Signed in as ${user?.name}${user?.departmentName ? ` · ${user.departmentName}` : ''}`}
      />

      <WorkspaceFiscalYear />
      <p className="text-xs text-text-faint">Action counts on this screen, the notification bell and the sidebar use the same fiscal year. General tasks and recent updates are not year-specific.</p>

      {!loading && failedSources.length > 0 && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-text-secondary">
          <p>Some dashboard information could not be loaded. Totals and pending items may be incomplete.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>Retry dashboard</Button>
        </div>
      )}

      {/* What this office is for. Worth the four lines: several of these roles
          hold authority nobody can bypass, and the system never said so.

          A white card rather than a filled green panel. Filled, it was the
          largest block of colour on every dashboard in the system — which is
          not what a quiet explanatory note should be. The accent survives as
          the icon and nothing else. */}
      {config.intro && (
        <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-surface p-5 shadow-sm">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
            <Compass size={16} />
          </span>
          <p className="text-[13.5px] leading-relaxed text-text-secondary">{config.intro}</p>
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading your dashboard…</p>
      ) : (
        <>
          {stats.length > 0 && failedSources.length === 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>
          )}

          <div className={`grid gap-4 ${showActivity ? 'lg:grid-cols-2' : ''}`}>
            <Card
              title="Items Waiting for Your Action"
              icon={Inbox}
              bodyClassName=""
              action={actions.total > 0 && <Badge tone="warning">{actions.total}</Badge>}
            >
              {queue.length === 0 ? (
                <EmptyState
                  title={failedSources.length ? 'Your queue could not be fully checked' : 'Nothing is waiting on you'}
                  description={failedSources.length ? 'Retry the dashboard or open the relevant page to check your pending work.' : 'New work that needs your role will appear here.'}
                />
              ) : (
                <>
                  {[
                    { heading: 'Overdue', rows: overdue, tone: 'text-danger' },
                    { heading: 'Due soon', rows: dueSoon, tone: 'text-warning' },
                    { heading: overdue.length + dueSoon.length > 0 ? 'Needs your action' : null, rows: waiting, tone: 'text-text-faint' },
                  ].filter((group) => group.rows.length > 0).map((group) => (
                    <div key={group.heading ?? 'all'}>
                      {group.heading && (
                        <p className={`border-b border-border-muted bg-sidebar px-4 py-1.5 text-[11px] font-semibold tracking-[0.04em] uppercase ${group.tone}`}>
                          {group.heading} ({group.rows.length})
                        </p>
                      )}
                      <ul className="divide-y divide-border-muted">
                        {(expandedActions ? group.rows : group.rows.slice(0, group.heading ? 5 : 8)).map((item) => (
                          <li key={item.id}>
                            <Link
                              to={item.href}
                              className="group flex items-start justify-between gap-3 px-4 py-3 hover:bg-sidebar"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-navy">{item.title}</p>
                                <p className="truncate text-[12px] text-text-secondary">{item.subtitle}</p>
                                <p className="mt-0.5 text-[11px] text-warning">{item.stage}</p>
                                <p className="mt-0.5 text-[12px] text-navy">
                                  Your action: <span className="font-medium">{item.action}</span>
                                </p>
                                <p className="mt-1 text-[11px] text-text-faint">Responsible: {item.responsibleRole}{item.fiscalYear ? ` ? FY ${item.fiscalYear}` : ' ? General task'}</p>
                                {dueState(item) && (
                                  <p className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${dueState(item).tone}`}>
                                    <CalendarClock size={12} /> {dueState(item).label}
                                  </p>
                                )}
                                {isQueueOverdue(item) && (
                                  <p className="mt-0.5 text-[11px] text-danger">
                                    Overdue — downstream stages cannot proceed until this is done.
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                {item.amount != null && (
                                  <span className="text-[12px] whitespace-nowrap text-text-faint">
                                    {peso(item.amount)}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11.5px] font-medium whitespace-nowrap text-accent-fg">
                                  {item.actionLabel}
                                  <ArrowRight
                                    size={13}
                                    className="transition-transform group-hover:translate-x-0.5"
                                  />
                                </span>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {queue.length > overdue.slice(0, 5).length + dueSoon.slice(0, 5).length + waiting.slice(0, 8).length && (
                    <p className="px-4 py-2 text-[11px] text-text-faint">
                      <button type="button" onClick={() => setExpandedActions((value) => !value)} className="text-navy underline">{expandedActions ? 'Show fewer actions' : 'Show all loaded actions'}</button>
                    </p>
                  )}
                </>
              )}
            </Card>

            {showActivity && (
              <Card title="Recent system activity (all years)" icon={Activity} bodyClassName="">
                {data.audit.length === 0 ? (
                  <EmptyState title="No recorded activity yet" description="System activity will appear here as work is completed." />
                ) : (
                  <ul className="divide-y divide-border-muted">
                    {data.audit.slice(0, 8).map((row) => (
                      <li key={row.id} className="px-4 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[13px] text-navy">{row.summary}</p>
                          <time className="font-mono text-[11px] text-text-faint">
                            {dateTime(row.recordedAt)}
                          </time>
                        </div>
                        <p className="mt-0.5 text-[11px] text-text-faint">
                          {row.actorName ?? 'System'}
                          {row.actorRole ? ` · ${row.actorRole}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          {done.length > 0 && (
            <Card
              title="Recently completed by you"
              icon={CheckCircle2}
              bodyClassName=""
            >
              <ul className="divide-y divide-border-muted">
                {done.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="group flex items-start justify-between gap-3 px-4 py-3 hover:bg-sidebar"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-navy">{item.title}</p>
                        {item.subtitle && (
                          <p className="truncate text-[12px] text-text-secondary">{item.subtitle}</p>
                        )}
                        <p className="mt-0.5 text-[12px] text-success">{item.detail}</p>
                      </div>
                      <time className="shrink-0 font-mono text-[11px] whitespace-nowrap text-text-faint">
                        {new Date(item.completedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Messages and updates (all years)"
            icon={Bell}
            action={unreadNotifications.length > 0 && <Badge tone="warning">{unreadNotifications.length} unread</Badge>}
            bodyClassName=""
          >
            {unreadNotifications.length === 0 ? (
              <EmptyState title="No unread messages" description="Updates that need your attention will appear here." />
            ) : (
              <ul className="divide-y divide-border-muted">
                {unreadNotifications.slice(0, 5).map((notice) => (
                  <li key={notice.id}>
                    <Link to={notice.link || '/profile'} className="group flex items-start justify-between gap-3 px-4 py-3 hover:bg-sidebar">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-navy">{notice.title}</p>
                        {notice.body && <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">{notice.body}</p>}
                      </div>
                      {notice.severity === 'high' || notice.severity === 'critical' ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" /> : <ArrowRight size={15} className="mt-0.5 shrink-0 text-text-faint group-hover:translate-x-0.5" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Where to go next" icon={Compass} bodyClassName="">
            {quickLinks.length === 0 ? (
              <EmptyState title="No modules are configured" description="Ask an administrator to review this role's workspace access." />
            ) : (
              <div className="grid gap-px bg-border-muted sm:grid-cols-2 lg:grid-cols-3">
                {quickLinks.map((item) => (
                  <Link
                    key={`${item.href}:${item.label}`}
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

          {/* Every figure above is read from the database, and the public portal
              is where anyone — including the officer looking at it — can check
              that against what the municipality has published. */}
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
