import { PencilLine, Eye, Clock, CheckCircle2, AlertTriangle, CalendarClock } from 'lucide-react'

// ── NEXT STEP ────────────────────────────────────────────────────────────────
// The same "what happens next" block on every record, whatever the module:
// current status, the action it waits for, who must take it, the due date
// where one exists, and what follows. Status is never colour alone — every
// tone pairs a dot with an icon, a text label and an accessible name.
//
// Two sizes: <NextStep> is the panel near the top of a detail view;
// <NextInline> is the one-line "Next: …" subline under a table status badge.

const CATEGORY = {
  neutral: { word: 'Draft', dot: 'bg-text-faint', text: 'text-text-secondary', Icon: PencilLine },
  info: { word: 'In review', dot: 'bg-info', text: 'text-info', Icon: Eye },
  warning: { word: 'Waiting for action', dot: 'bg-warning', text: 'text-warning', Icon: Clock },
  success: { word: 'Completed', dot: 'bg-success', text: 'text-success', Icon: CheckCircle2 },
  danger: { word: 'Needs attention', dot: 'bg-danger', text: 'text-danger', Icon: AlertTriangle },
}

const shortDate = (value) =>
  new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

export default function NextStep({ next, tone = 'warning', dueLabel = 'Due date' }) {
  if (!next || next.terminal) return null
  const category = CATEGORY[tone] ?? CATEGORY.warning
  const { Icon } = category
  const requirements =
    next.requirements ??
    'Check the official record for the evidence and approvals required by this workflow stage.'

  return (
    <section
      aria-label={`Next step: ${next.action}, ${next.owner}`}
      className="rounded-lg border border-border-strong bg-sidebar/60 p-4"
    >
      <h2 className="text-[14px] font-semibold text-navy">What happens next</h2>
      <p className="mt-2 flex items-center gap-2 text-[12px] font-medium">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${category.dot}`} />
        <span className={category.text}>{category.word}</span>
        <span aria-hidden="true" className="text-text-faint">·</span>
        <span className="font-normal text-text-secondary">Current status: {next.status}</span>
      </p>
      <p className="mt-2 flex items-start gap-2 text-[14px] leading-relaxed text-navy">
        <Icon size={15} className={`mt-0.5 shrink-0 ${category.text}`} aria-hidden="true" />
        <span>
          Next action: <strong className="font-semibold">{next.action}</strong>
          <span className="text-text-secondary"> — {next.owner}</span>
        </span>
      </p>
      {next.dueAt && (
        <p className="mt-1.5 flex items-center gap-1.5 pl-[23px] text-[12.5px] text-text-secondary">
          <CalendarClock size={13} className="shrink-0" aria-hidden="true" />
          {dueLabel}: {shortDate(next.dueAt)}
        </p>
      )}
      {next.after && (
        <p className="mt-1 pl-[23px] text-[12.5px] text-text-secondary">
          After that: {next.after}.
        </p>
      )}
      <p className="mt-2 border-t border-border-muted pt-2 text-[12.5px] leading-relaxed text-text-secondary">
        <span className="font-medium text-navy">Required before action:</span> {requirements}
      </p>
    </section>
  )
}

export function NextInline({ next }) {
  if (!next || next.terminal) return null
  return (
    <span className="mt-1 block text-[12px] leading-snug text-text-secondary">
      Next: {next.action} — {next.owner}
    </span>
  )
}
