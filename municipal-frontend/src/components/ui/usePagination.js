import { useMemo, useState } from 'react'

// Pairs with <Pagination />. Takes the full row set and hands back the slice
// for the current page plus the props the control needs.
//
// The clamp is the point: filtering a 12-page list down to 2 pages while
// sitting on page 9 would otherwise show an empty table and look broken.
//
// It is *derived* rather than corrected in an effect. Correcting it after the
// fact means rendering the empty page once, then re-rendering — the user sees
// the flash, and React rightly complains about the cascade. Clamping at read
// time means the out-of-range page never reaches the screen at all.
export function usePagination(rows, initialPageSize = 10) {
  const [requestedPage, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const total = rows?.length ?? 0
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, lastPage)

  const pageRows = useMemo(
    () => (rows ?? []).slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize]
  )

  return {
    pageRows,
    paginationProps: {
      page,
      pageSize,
      totalItems: total,
      onPageChange: setPage,
      onPageSizeChange: (size) => {
        setPageSize(size)
        setPage(1)
      },
    },
    resetPage: () => setPage(1),
  }
}
