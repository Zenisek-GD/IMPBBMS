import { useState } from 'react'
import {
  UserRound,
  ShieldCheck,
  MessageSquareQuote,
  EyeOff,
  Hash,
  ChevronDown,
  Check,
} from 'lucide-react'

const timelineLabels = {
  planning: 'Planning & Budget',
  evaluation: 'Evaluation & Post-qualification',
  contract: 'Contract & Implementation',
  completion: 'Delivery & Financial Closeout',
}

const dateTime = (value) =>
  new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? {} : { hour: '2-digit', minute: '2-digit' }),
  })

const shortDay = (value) =>
  new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short' })

const shortDayYear = (value) =>
  new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' })

// A group's date range, collapsed to a single date when every entry in it
// landed on the same day — "8 Jan – 8 Jan 2026" reads like a mistake.
const groupRange = (events) => {
  if (!events.length) return null
  const first = events[0].occurredAt
  const last = events[events.length - 1].occurredAt
  const sameDay = shortDayYear(first) === shortDayYear(last)
  return sameDay ? shortDayYear(first) : `${shortDay(first)} – ${shortDayYear(last)}`
}

// Start with the lifecycle so stages without dates still appear in order.
const buildGroups = (events, phases) => {
  const groups = new Map(phases.map((phase) => [phase.key, {
    key: phase.key,
    label: timelineLabels[phase.key] ?? phase.label,
    phase,
    events: [],
  }]))

  for (const event of events) {
    const key = groups.has(event.stage) ? event.stage : 'other'
    if (!groups.has(key)) groups.set(key, { key, label: 'Other activity', events: [] })
    groups.get(key).events.push(event)
  }

  return [...groups.values()]
}

export default function ProjectTimeline({ events = [], disclosure, phases = [] }) {
  const [openKeys, setOpenKeys] = useState(null)
  const groups = buildGroups(events, phases)
  const hasReviewedEvidence = phases.some((phase) => phase.reportedDetails || phase.missingRecords)
  const lastWithEvents = groups.findLast((group) => group.events.length)
  const open = new Set(openKeys ?? (hasReviewedEvidence ? groups.map(({ key }) => key) : [lastWithEvents?.key]))

  if (!groups.length) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-text-faint">
        No recorded activity for this project yet.
      </p>
    )
  }

  const allOpen = groups.every((group) => open.has(group.key))

  const toggle = (key) =>
    setOpenKeys(() => {
      const next = new Set(open)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return [...next]
    })

  const renderEntry = (event, isLast) => (
            <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
              {/* Rail */}
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${
                    event.source === 'auditLog' ? 'bg-accent ring-navy/10' : 'bg-text-faint ring-text-faint/10'
                  }`}
                />
                {!isLast && <span className="mt-1 w-px flex-1 bg-border-muted" aria-hidden="true" />}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-[14px] font-semibold text-navy">{event.action}</p>
                  <time className="font-mono text-[11px] text-text-faint" dateTime={event.occurredAt}>
                    {dateTime(event.occurredAt)}
                  </time>
                </div>

                {event.summary && (
                  <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{event.summary}</p>
                )}

                {(event.statusFrom || event.statusTo) && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
                    {event.statusFrom && (
                      <span className="rounded-sm border border-border-muted bg-sidebar px-1.5 py-0.5">
                        {event.statusFrom}
                      </span>
                    )}
                    {event.statusFrom && event.statusTo && <span className="text-text-faint">→</span>}
                    {event.statusTo && (
                      <span className="rounded-sm border border-navy/15 bg-chip px-1.5 py-0.5 font-medium text-navy">
                        {event.statusTo}
                      </span>
                    )}
                  </p>
                )}

                {/* Actor. Withheld only where blind evaluation requires it, and
                    the withholding is stated rather than left as a blank. */}
                {(event.actorName || event.actorRole) && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
                    {event.actorWithheld ? (
                      <EyeOff size={13} className="shrink-0 text-text-faint" />
                    ) : (
                      <UserRound size={13} className="shrink-0 text-text-faint" />
                    )}
                    {event.actorWithheld ? (
                      <span>
                        <span className="font-medium text-navy">{event.actorRole}</span>
                        <span className="text-text-faint">
                          {' '}
                          — individual evaluator withheld under blind evaluation rules
                        </span>
                      </span>
                    ) : (
                      <span>
                        <span className="font-medium text-navy">{event.actorName}</span>
                        {event.actorRole && <span className="text-text-faint"> · {event.actorRole}</span>}
                      </span>
                    )}
                  </p>
                )}

                {event.note && (
                  <div className="mt-2 flex gap-2 rounded-md border border-border-muted bg-sidebar px-3 py-2">
                    <MessageSquareQuote size={13} className="mt-0.5 shrink-0 text-navy/50" />
                    <p className="text-[12px] leading-relaxed text-text-secondary italic">{event.note}</p>
                  </div>
                )}

                {event.recordHash && (
                  <p
                    className="mt-2 flex items-center gap-1 font-mono text-[10px] break-all text-text-faint"
                    title="Audit chain hash — identifies this entry in the tamper-evident log"
                  >
                    <Hash size={10} className="shrink-0" />
                    {event.recordHash.slice(0, 24)}…
                  </p>
                )}
              </div>
            </li>
  )

  return (
    <div className="px-4 py-4">
      {disclosure && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-navy" />
          <p className="text-[13px] leading-relaxed text-text-secondary">{disclosure}</p>
        </div>
      )}

      {/* An auditor reading the whole trail should not have to click eight
          times to get it. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-text-secondary">
          {phases.length || groups.length} {(phases.length || groups.length) === 1 ? 'stage' : 'stages'} · {events.length} dated {events.length === 1 ? 'event' : 'events'}
        </p>
        <button
          type="button"
          onClick={() => setOpenKeys(allOpen ? [] : groups.map((group) => group.key))}
          className="min-h-11 rounded-full border border-border-muted px-3 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-navy md:min-h-9"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="flex flex-col divide-y divide-border-muted border-y border-border-muted">
        {groups.map((group, groupIndex) => {
          const isOpen = open.has(group.key)
          const reached = group.phase?.reached ?? true
          const current = group.phase?.current ?? false
          const reportedDetails = group.phase?.reportedDetails ?? []
          const missingRecords = group.phase?.missingRecords ?? []
          const dateRange = groupRange(group.events)

          return (
            <section key={group.key}>
              <h3>
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-sidebar/60"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold ${
                      current
                        ? 'border-navy bg-accent text-accent-fg'
                        : reached
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border-muted bg-surface text-text-faint'
                    }`}
                  >
                    {reached && !current ? <Check size={12} /> : groupIndex + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="text-[14px] font-semibold text-navy">{group.label}</span>
                      {current && (
                        <span className="rounded-full bg-chip px-2 py-0.5 text-[10.5px] font-medium tracking-[0.03em] text-navy uppercase">
                          {group.phase?.evidence === 'clientReported' ? 'Last reported stage' : 'Current stage'}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-text-secondary">
                      {dateRange ?? (reportedDetails.length ? 'Event date unavailable' : missingRecords.length ? 'Supporting records unavailable' : 'No dated public events')}
                    </span>
                  </span>

                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-text-faint transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </h3>

              {isOpen && (reportedDetails.length > 0 || missingRecords.length > 0 || group.events.length > 0) && (
                <div className="space-y-4 pt-1 pb-4 pl-9">
                  {reportedDetails.length > 0 && <div>
                    <p className="text-[13px] font-semibold text-navy">Client-reported details</p>
                    <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                      {reportedDetails.map(({ label, value }) => <div key={label} className="min-w-0 break-words">
                        <dt className="text-xs text-text-secondary">{label}</dt>
                        <dd className="text-[13px] text-navy">{value}</dd>
                      </div>)}
                    </dl>
                  </div>}
                  {group.events.length > 0 && <ol>
                    {group.events.map((event, index) => renderEntry(event, index === group.events.length - 1))}
                  </ol>}
                  {missingRecords.length > 0 && <div className="rounded-md border border-border-muted bg-sidebar p-3 text-[13px] text-navy">
                    <p className="font-semibold">Records unavailable in the reviewed form</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-text-secondary">
                      {missingRecords.map((record) => <li key={record}>{record}</li>)}
                    </ul>
                  </div>}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
