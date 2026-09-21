import { ChevronLeft, ChevronRight } from 'lucide-react'
import ResponsiveSelect from './ResponsiveSelect'

// ── PAGINATION ───────────────────────────────────────────────────────────────
// Client-side, because every list in this system is already fully loaded by the
// time it renders. That is fine at municipal volumes — a few hundred rows — and
// it keeps filtering instant. If a table ever outgrows that, this component's
// props are the same shape a server-paged version would take, so only the data
// source changes.
//
// The window renders at most seven slots with ellipses, so the control never
// reflows as the page count grows.
const windowFor = (page, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (page >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', page - 1, page, page + 1, '…', total]
}

export default function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  // The first option doubles as the threshold for showing the selector at all —
  // offering "rows per page" on a list shorter than one page is clutter. Card
  // grids pass a smaller set than tables do.
  pageSizeOptions = [10, 25, 50, 100],
  label = 'items',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)

  // A single page of results needs no controls, but the count is still useful.
  const showControls = totalPages > 1

  const stepClass =
    'flex h-11 w-11 items-center justify-center rounded-md border border-border-muted bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-navy disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-muted'

  return (
    <div className="flex flex-col items-stretch justify-between gap-3 border-t border-border-muted px-4 py-3 sm:flex-row sm:items-center">
      <p className="text-center text-[12px] text-text-faint sm:text-left">
        {totalItems === 0 ? (
          `No ${label}`
        ) : (
          <>
            Showing <span className="font-medium text-text-secondary">{from}</span>–
            <span className="font-medium text-text-secondary">{to}</span> of{' '}
            <span className="font-medium text-text-secondary">{totalItems}</span> {label}
          </>
        )}
      </p>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {onPageSizeChange && totalItems > pageSizeOptions[0] && (
          <label className="flex items-center gap-1.5 text-[12px] text-text-faint">
            Rows
            <ResponsiveSelect
              value={pageSize}
              onChange={(value) => onPageSizeChange(Number(value))}
              title="Rows per page"
              options={pageSizeOptions.map((option) => ({ value: option, label: String(option) }))}
              mobileClassName="rounded-md border border-border-muted bg-surface px-3 text-text-secondary"
              desktopClassName="rounded-md border border-border-muted bg-surface px-1.5 py-1 text-[12px] text-text-secondary focus:border-accent focus:outline-none"
            />
          </label>
        )}

        {showControls && (
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              className={stepClass}
            >
              <ChevronLeft size={14} />
            </button>

            {windowFor(page, totalPages).map((slot, index) =>
              slot === '…' ? (
                <span key={`gap-${index}`} className="px-1 text-[12px] text-text-faint">
                  …
                </span>
              ) : (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onPageChange(slot)}
                  aria-current={slot === page ? 'page' : undefined}
                  className={`h-11 min-w-11 rounded-md px-1.5 text-xs font-medium transition-colors ${
                    slot === page
                      ? 'bg-accent text-accent-fg'
                      : 'border border-border-muted bg-surface text-text-secondary hover:border-border-strong hover:text-navy'
                  }`}
                >
                  {slot}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Next page"
              className={stepClass}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
