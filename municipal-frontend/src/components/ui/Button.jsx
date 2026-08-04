// Sentence case rather than the previous wide-tracked uppercase: at this
// density all-caps labels are harder to scan and take more room than they earn.
const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:opacity-90 shadow-sm',
  secondary:
    'border border-border-muted bg-surface text-navy hover:border-border-strong shadow-sm',
  ghost: 'text-text-secondary hover:bg-navy-tint hover:text-navy',
  danger: 'border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15',
}

const SIZES = {
  sm: 'h-7 gap-1.5 px-2.5 text-[11px]',
  md: 'h-8 gap-2 px-3 text-[12px]',
  lg: 'h-9 gap-2 px-4 text-[13px]',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={14} className="shrink-0" />}
      {children}
    </button>
  )
}
