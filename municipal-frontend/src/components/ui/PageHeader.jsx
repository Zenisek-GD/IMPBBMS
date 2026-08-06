// Page title block. The references lead with a clearly larger heading over a
// quieter one-line description — it is what tells you which screen you are on
// before you read anything else. This had been cut to 18px on the argument that
// the heading should not dominate a dense table, which left every page opening
// on something barely larger than its own body text.
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-navy">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
