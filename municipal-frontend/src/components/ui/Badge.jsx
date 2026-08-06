// Tints rather than solid fills, so a row of badges does not out-shout the data
// around it. The /10 backgrounds resolve against whichever surface is behind
// them, which is what lets one definition serve both themes.
//
// `info` is the one place the second colour appears by default, and it is the
// right one: an informational badge is exactly the "detail" the accent exists
// for, and it is a small, bounded surface rather than a heading.
const TONES = {
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
  neutral: 'border-border-muted bg-sidebar text-text-secondary',
}

// A leading dot is the reference's signature for a status pill — it reads as
// state at a glance without needing the label to be loud. Off by default so the
// hundreds of existing plain badges are unchanged; opt in where a badge really
// is a *status* rather than a label.
export default function Badge({ tone = 'neutral', dot = false, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap capitalize ${TONES[tone] ?? TONES.neutral}`}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  )
}
