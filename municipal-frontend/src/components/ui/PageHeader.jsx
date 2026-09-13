// Page title block. The references lead with a clearly larger heading over a
// quieter one-line description — it is what tells you which screen you are on
// before you read anything else. This had been cut to 18px on the argument that
// the heading should not dominate a dense table, which left every page opening
// on something barely larger than its own body text.
export default function PageHeader({ title, subtitle, actions, meta = [] }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-muted pb-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-[1.12] font-semibold tracking-[-0.025em] text-navy">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-text-secondary">
            {subtitle}
          </p>
        )}
        {meta.length > 0 && (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {meta.map((item) => (
              <div key={item.label} className="flex items-baseline gap-1.5 text-[12px]">
                <dt className="text-text-faint">{item.label}</dt>
                <dd className="font-medium text-navy">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
