// Section container. Softer corners, a hairline border and a diffuse shadow —
// in the reference treatment depth comes from diffusion rather than a hard edge.
export default function Card({ title, icon: Icon, action, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-border-muted bg-surface shadow-sm ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-border-muted px-4 py-3">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy">
            {Icon && <Icon size={15} className="text-text-faint" />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
