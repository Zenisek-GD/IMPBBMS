// Compact KPI tile. Tightened from the original: the figure carries the weight,
// so the label and hint step back to secondary sizes rather than competing.
export default function StatCard({ label, value, hint, icon: Icon, tone = 'navy' }) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-navy'

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border-muted bg-surface p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-[10.5px] font-medium tracking-[0.04em] text-text-faint uppercase">{label}</p>
        <p className={`mt-1 truncate text-lg font-semibold tracking-[-0.01em] ${toneClass}`}>{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-text-faint">{hint}</p>}
      </div>
      {Icon && <Icon size={16} className="mt-0.5 shrink-0 text-text-faint" />}
    </div>
  )
}
