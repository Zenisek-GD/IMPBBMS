// Sentence case rather than the previous wide-tracked uppercase: at this
// density all-caps labels are harder to scan and take more room than they earn.
const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:opacity-90 shadow-sm',
  secondary:
    'border border-border-muted bg-surface text-navy hover:border-border-strong shadow-sm',
  ghost: 'text-text-secondary hover:bg-navy-tint hover:text-navy',
  danger: 'border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15',
}

// One notch up across the board. At h-8/12px a primary action was smaller than
// the text beside it, and on touch it was under the 44px comfortable target by
// a long way.
const SIZES = {
  sm: 'h-8 gap-1.5 px-3 text-[12px]',
  md: 'h-9.5 gap-2 px-4 text-[13px]',
  lg: 'h-11 gap-2 px-5 text-[14px]',
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
