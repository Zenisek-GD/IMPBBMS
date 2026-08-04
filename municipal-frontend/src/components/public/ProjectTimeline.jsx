import { UserRound, ShieldCheck, MessageSquareQuote, EyeOff, Hash } from 'lucide-react'

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

const dateTime = (value) =>
  new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function ProjectTimeline({ events, disclosure }) {
  if (!events?.length) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-text-faint">
        No recorded activity for this project yet.
      </p>
    )
  }

  return (
    <div className="px-4 py-4">
      {disclosure && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-navy" />
          <p className="text-[13px] leading-relaxed text-text-secondary">{disclosure}</p>
        </div>
      )}

      <ol className="relative">
        {events.map((event, index) => {
          const isLast = index === events.length - 1

          return (
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
        })}
      </ol>
    </div>
  )
}
