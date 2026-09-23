// Section container. The page carries a faint tint and the card stays white, so
// separation comes from that step plus a diffuse shadow — the treatment in every
// reference, and the reason a card reads as an object rather than a rectangle
// drawn on the same sheet.
//
// The header icon stays a plain muted glyph. An earlier pass gave every card
// header a tinted icon well; with forty screens built out of this component that
// turned one restrained accent into a colour on every heading in the system,
// which is not what the references do and not what was asked for.
export default function Card({ title, icon: Icon, action, children, className = '', bodyClassName = 'p-5' }) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-border-muted bg-surface shadow-sm ${className}`}
    >
      {title && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-muted px-5 py-4">
          <h2 className="ui-card-title flex min-w-0 flex-1 items-start gap-2.5 text-navy">
            {Icon && <Icon size={15} className="mt-px shrink-0 text-text-faint" />}
            <span className="min-w-0 break-words">{title}</span>
          </h2>
          {action && <div className="max-w-full shrink-0">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
