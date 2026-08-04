const BAR_TONES = {
  navy: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export default function ProgressRow({ label, value, percent, tone = 'navy' }) {
  return (
    <div className="flex flex-col gap-1">
      {(label || value) && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-text-secondary">{label}</span>
          <span className="font-semibold text-navy">{value}</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${BAR_TONES[tone] ?? BAR_TONES.navy}`}
          style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
        />
      </div>
    </div>
  )
}
