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

// The transparency timeline: who did what, when, and why.
//
// Two things are shown that a status list would not carry. The first is the
// actor — a status change with no name attached is not accountability. The
// second is the stated reason, verbatim, including reasons for returning or
// revising something, because the decisions that go sideways are the ones the
// public most needs to see.
//
// Events sourced from the audit log carry a hash. It is surfaced so a reader
// can tie an entry back to the tamper-evident chain rather than take the page's
// word for it.
//
// ── GROUPING ─────────────────────────────────────────────────────────────────
// The entries are drawn exactly as before; what is new is that they are
// collected under the same eight lifecycle stages the Overview's progress
// stepper uses, and each stage folds. A finished project records twenty-five
// steps, and as one flat run there was no way to tell the four planning steps
// from the moment the contract was awarded.
//
// Only the most recent stage is open on arrival. Nothing is hidden: a collapsed
// group still states its step count and date range, so a reader can see how
// much is folded away and when it happened before deciding to open it.

const dateTime = (value) =>
  new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const shortDay = (value) =>
  new Date(value).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })

const shortDayYear = (value) =>
  new Date(value).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })

// A group's date range, collapsed to a single date when every entry in it
// landed on the same day — "8 Jan – 8 Jan 2026" reads like a mistake.
const groupRange = (events) => {
  if (!events.length) return null
  const first = events[0].occurredAt
  const last = events[events.length - 1].occurredAt
  const sameDay = new Date(first).toDateString() === new Date(last).toDateString()
  return sameDay ? shortDayYear(first) : `${shortDay(first)} – ${shortDayYear(last)}`
}

// Events arrive in time order and stages advance monotonically, so walking the
// list in order yields the groups in lifecycle order without a second sort.
const buildGroups = (events, phases) => {
  const byKey = new Map((phases ?? []).map((phase) => [phase.key, phase]))
  const groups = []
  const seen = new Map()

  for (const event of events) {
    const key = event.stage ?? 'other'
    if (!seen.has(key)) {
      const group = {
        key,
        label: byKey.get(key)?.label ?? 'Other activity',
        phase: byKey.get(key) ?? null,
        events: [],
      }
      seen.set(key, group)
      groups.push(group)
    }
    seen.get(key).events.push(event)
  }

  return groups
}

export default function ProjectTimeline({ events, disclosure, phases }) {
  // Open the last stage that has entries: it is the most recent thing to have
  // happened, and it is what a reader checking on a project came for. Derived
  // during render rather than synced in an effect, so the first paint is
  // already correct.
  const [openKeys, setOpenKeys] = useState(null)

  if (!events?.length) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-text-faint">
        No recorded activity for this project yet.
      </p>
    )
  }

  const groups = buildGroups(events, phases)
  const open = new Set(openKeys ?? (groups.length ? [groups[groups.length - 1].key] : []))
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
                  <div className="mt-2 flex gap-2 rounded border-l-2 border-navy/25 bg-sidebar px-3 py-2">
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
          {events.length} recorded {events.length === 1 ? 'step' : 'steps'} across {groups.length}{' '}
          {groups.length === 1 ? 'stage' : 'stages'}
        </p>
        <button
          type="button"
          onClick={() => setOpenKeys(allOpen ? [] : groups.map((group) => group.key))}
          className="rounded-full border border-border-muted px-3 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-navy"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="flex flex-col divide-y divide-border-muted border-y border-border-muted">
        {groups.map((group, groupIndex) => {
          const isOpen = open.has(group.key)
          const reached = group.phase?.reached ?? true
          const current = group.phase?.current ?? false

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
                          Now
                        </span>
                      )}
                    </span>
                    {/* The count and range are what make a collapsed group
                        honest: the reader sees how much is folded away and when
                        it happened without having to open it. */}
                    <span className="mt-0.5 block text-[12px] text-text-secondary">
                      {group.events.length} {group.events.length === 1 ? 'step' : 'steps'} ·{' '}
                      {groupRange(group.events)}
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

              {isOpen && (
                <ol className="relative pt-1 pb-4 pl-9">
                  {group.events.map((event, index) =>
                    renderEntry(event, index === group.events.length - 1)
                  )}
                </ol>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
