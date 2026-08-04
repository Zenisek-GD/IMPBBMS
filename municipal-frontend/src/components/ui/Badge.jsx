// Tints rather than solid fills, so a row of badges does not out-shout the data
// around it. The /10 backgrounds resolve against whichever surface is behind
// them, which is what lets one definition serve both themes.
const TONES = {
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-navy/10 bg-chip text-navy',
  neutral: 'border-border-muted bg-sidebar text-text-secondary',
}

export default function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium whitespace-nowrap capitalize ${TONES[tone] ?? TONES.neutral}`}
    >
      {children}
    </span>
  )
}
