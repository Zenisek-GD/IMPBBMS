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
        <header className="flex items-center justify-between gap-3 border-b border-border-muted px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-[14px] font-semibold text-navy">
            {Icon && <Icon size={15} className="shrink-0 text-text-faint" />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
