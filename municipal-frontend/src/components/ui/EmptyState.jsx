import { Inbox } from 'lucide-react'

// A single calm fallback keeps empty, filtered, and unavailable states from
// looking like a failed layout. Pages may replace the icon or provide one clear
// recovery action without inventing another visual treatment.
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center px-5 py-10 text-center ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar text-text-faint">
        <Icon size={19} aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-navy">{title}</h3>
      {description && <p className="mt-1 max-w-md text-[13px] leading-relaxed text-text-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
