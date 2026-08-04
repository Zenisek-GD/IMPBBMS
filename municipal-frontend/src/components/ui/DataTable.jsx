import Pagination from './Pagination'
import { usePagination } from './usePagination'

// Minimal presentational table. `columns` is [{ key, label, render? }];
// `render(row)` lets a cell return a Badge or other element.
//
// Denser than before — 12px rows instead of 16px, and a hairline header rule
// instead of a filled band, so a long table reads as one surface rather than as
// a stack of stripes.
//
// Paging is on by default and built in here rather than left to each caller:
// a table that silently renders four hundred rows is the one nobody remembers
// to fix. Pass `paginated={false}` for the handful of places where the row
// count is bounded by the domain — a project's own contracts, say.
export default function DataTable({
  columns,
  rows,
  emptyMessage = 'Nothing to show yet.',
  paginated = true,
  pageSize = 10,
  label = 'rows',
}) {
  const { pageRows, paginationProps } = usePagination(rows ?? [], pageSize)
  const visible = paginated ? pageRows : (rows ?? [])

  if (!rows?.length) {
    return <p className="px-4 py-8 text-center text-[12.5px] text-text-faint">{emptyMessage}</p>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-muted bg-sidebar/60">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-2 text-[10.5px] font-medium tracking-[0.04em] whitespace-nowrap text-text-faint uppercase"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={row.id ?? index}
                className="border-b border-border-muted/70 transition-colors last:border-0 hover:bg-sidebar/50"
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-2 text-[12.5px] text-text-secondary">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginated && <Pagination {...paginationProps} label={label} />}
    </>
  )
}
