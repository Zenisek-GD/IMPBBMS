// Sentence case rather than the previous wide-tracked uppercase: at this
// density all-caps labels are harder to scan and take more room than they earn.
const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:opacity-90 shadow-sm',
  secondary:
    'border border-border-muted bg-surface text-navy hover:border-border-strong shadow-sm',
  ghost: 'text-text-secondary hover:bg-navy-tint hover:text-navy',
  danger: 'border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15',
}

// Desktop record tables need a compact action size so each row stays focused,
// while ordinary page actions still have a comfortable target. `table` is a
// 32px dense-register control, `sm` is 36px for compact page actions, standard
// actions are 40px, and the large variant remains 44px for touch-first work.
const SIZES = {
  table: 'min-h-10 gap-1 px-2.5 text-[11.5px] md:min-h-8',
  sm: 'min-h-10 gap-1.5 px-3 text-[12px] md:min-h-9',
  md: 'min-h-11 gap-2 px-4 text-sm md:min-h-10',
  lg: 'min-h-11 gap-2 px-5 text-[14px]',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...props
}) {
  const iconSize = size === 'table' ? 13 : 14
  return (
    <button
      type="button"
      className={`inline-flex max-w-full items-center justify-center rounded-md font-medium text-center leading-tight whitespace-normal transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={iconSize} className="shrink-0" />}
      {children}
    </button>
  )
}
