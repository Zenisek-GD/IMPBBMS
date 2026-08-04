// Page title block. Dropped from 28px to 20px — at the old size the heading
// dominated screens whose actual content is a dense table.
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-[-0.015em] text-navy">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
