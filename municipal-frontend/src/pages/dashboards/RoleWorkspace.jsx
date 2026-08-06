import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Inbox, Landmark, Compass } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { ROLE_NAV } from '../../config/navigation'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { dashboardFor } from './dashboardConfig'
import { useDashboardData } from './useDashboardData'

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

const TONE_TEXT = {
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
}

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
  const config = dashboardFor(user?.role)
  const { loading, data, queue } = useDashboardData(config.needs)

  const nav = ROLE_NAV[user?.role]
  const quickLinks = nav?.sections?.flatMap((section) => section.items) ?? []
  const stats = loading ? [] : (config.stats?.(data) ?? [])

  // Only the Administrator, the Mayor and the Internal Auditor. The feed used to
  // be gated on `audit.viewAll`, which ten roles hold — so a Treasurer's
  // dashboard led with the whole municipality's activity instead of their own
  // work. The Auditor keeps it because reading this trail is the job.
  const showActivity = config.showActivity && Array.isArray(data.audit)

  return (
    <DashboardPage>
      <PageHeader
        title={`${user?.roleName ?? 'Dashboard'}`}
        subtitle={`Signed in as ${user?.name}${user?.departmentName ? ` · ${user.departmentName}` : ''}`}
      />

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
          {stats.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>
          )}

          <div className={`grid gap-4 ${showActivity ? 'lg:grid-cols-2' : ''}`}>
            <Card
              title="Waiting on you"
              icon={Inbox}
              bodyClassName=""
              action={queue.length > 0 && <Badge tone="warning">{queue.length}</Badge>}
            >
              {queue.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                  Nothing is waiting on you right now.
                </p>
              ) : (
                <ul className="divide-y divide-border-muted">
                  {queue.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        className="group flex items-start justify-between gap-3 px-4 py-3 hover:bg-sidebar"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-navy">{item.title}</p>
                          <p className="truncate text-[12px] text-text-secondary">{item.subtitle}</p>
                          <p className="mt-0.5 text-[11px] text-warning">{item.stage}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {item.amount != null && (
                            <span className="text-[12px] whitespace-nowrap text-text-faint">
                              {peso(item.amount)}
                            </span>
                          )}
                          <ArrowRight
                            size={15}
                            className="text-text-faint transition-transform group-hover:translate-x-0.5"
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                  {queue.length > 8 && (
                    <li className="px-4 py-2 text-[11px] text-text-faint">
                      and {queue.length - 8} more
                    </li>
                  )}
                </ul>
              )}
            </Card>

            {showActivity && (
              <Card title="Recent system activity" icon={Activity} bodyClassName="">
                {data.audit.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                    No recorded activity yet.
                  </p>
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

          <Card title="Where to go next" icon={Compass} bodyClassName="">
            {quickLinks.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                No modules are configured for this role.
              </p>
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
