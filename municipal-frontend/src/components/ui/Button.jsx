// Sentence case rather than the previous wide-tracked uppercase: at this
// density all-caps labels are harder to scan and take more room than they earn.
const VARIANTS = {
  // One action grammar everywhere: brand actions commit work, success actions
  // approve it, information actions retrieve it, warning actions send it back
  // for correction, and danger actions reject or remove it. `secondary` is
  // deliberately neutral for editing, cancelling and other reversible work.
  primary: 'border-accent bg-accent text-accent-fg shadow-sm hover:bg-accent/90 hover:shadow-md',
  secondary: 'border-border-strong bg-surface text-navy shadow-sm hover:bg-sidebar hover:shadow-md',
  info: 'border-info/30 bg-info-soft text-info hover:border-info/45 hover:bg-info/15',
  success: 'border-success/30 bg-success/10 text-success hover:border-success/45 hover:bg-success/15',
  warning: 'border-warning/30 bg-warning/10 text-warning hover:border-warning/45 hover:bg-warning/15',
  danger: 'border-danger/30 bg-danger/10 text-danger hover:border-danger/45 hover:bg-danger/15',
  ghost: 'border-transparent text-text-secondary hover:bg-navy-tint hover:text-navy',
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
      className={`inline-flex max-w-full items-center justify-center rounded-md border font-medium text-center leading-tight whitespace-normal transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:translate-y-0 ${SIZES[size]} ${VARIANTS[variant] ?? VARIANTS.primary} ${className}`}
      {...props}
    >
      {Icon && <Icon size={iconSize} className="shrink-0" />}
      {children}
    </button>
  )
}
