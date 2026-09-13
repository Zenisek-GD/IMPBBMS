import { useCallback, useEffect, useState } from 'react'

// ── SERVER-SIDE TABLE CONTROLS ───────────────────────────────────────────────
// The same toolbar / sort / pagination UX as useTableControls, but the
// searching, filtering, sorting and paging happen in the database: every
// control change issues one request shaped like
//
//   ?search=award&outcome=failed&sort=recordedAt:desc&page=2&pageSize=25
//
// and the server answers { rows, total, page, pageSize, totalPages }.
//
// `fetcher` must be referentially stable (a module-level api function) and
// accept a single params object. Sort uses one "key:direction" pair; passing a
// column to sortProps opts it into server sorting, anything else renders as a
// plain Th.
//
// Filter state survives reloads and shares via `urlKey`: page, search, sort
// and each filter are mirrored to the URL with replaceState (no navigation).
// Search typing is debounced so every keystroke does not hit the server.

const readUrlState = (urlKey) => {
  if (!urlKey || typeof window === 'undefined') return {}
  try {
    const params = new URLSearchParams(window.location.search)
    const prefix = `${urlKey}_f_`
    const filters = {}
    for (const [key, value] of params.entries()) {
      if (key.startsWith(prefix) && value) filters[key.slice(prefix.length)] = value
    }
    const sortRaw = params.get(`${urlKey}_sort`)
    const [sortKey, sortDirection] = (sortRaw ?? '').split(':')
    return {
      query: params.get(`${urlKey}_q`) ?? undefined,
      page: params.get(`${urlKey}_page`) ?? undefined,
      pageSize: params.get(`${urlKey}_ps`) ?? undefined,
      sort:
        sortKey && (sortDirection === 'asc' || sortDirection === 'desc')
          ? { key: sortKey, direction: sortDirection }
          : undefined,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    }
  } catch {
    return {}
  }
}

export function useServerTable(fetcher, options = {}) {
  const {
    filters: filterDefs = [],
    defaultPageSize = 25,
    pageSizeOptions = [10, 25, 50, 100],
    urlKey = null,
    debounceMs = 400,
  } = options

  const [urlInitial] = useState(() => readUrlState(urlKey))
  const [query, setQuery] = useState(urlInitial.query ?? '')
  const [debounced, setDebounced] = useState(urlInitial.query ?? '')
  const [filterValues, setFilterValues] = useState(urlInitial.filters ?? {})
  const [sort, setSort] = useState(urlInitial.sort ?? null)
  const [page, setPage] = useState(Number(urlInitial.page) > 0 ? Number(urlInitial.page) : 1)
  const [pageSize, setPageSize] = useState(
    Number(urlInitial.pageSize) > 0 ? Number(urlInitial.pageSize) : defaultPageSize
  )
  const [result, setResult] = useState({ key: null, rows: [], total: 0, meta: null, failed: false })
  const [refreshToken, setRefreshToken] = useState(0)

  // Debounced search also returns to the first page: the page the reader was
  // on belongs to the previous query.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim())
      setPage(1)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  const requestKey = JSON.stringify({
    q: debounced,
    f: filterValues,
    s: sort,
    p: page,
    ps: pageSize,
    r: refreshToken,
  })

  useEffect(() => {
    let cancelled = false
    const asked = JSON.parse(requestKey)
    fetcher({
      ...(asked.q ? { search: asked.q } : {}),
      ...asked.f,
      ...(asked.s ? { sort: `${asked.s.key}:${asked.s.direction}` } : {}),
      page: asked.p,
      pageSize: asked.ps,
    })
      .then((data) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          rows: Array.isArray(data?.rows) ? data.rows : [],
          total: Number(data?.total ?? 0),
          // Endpoints may include small server-computed queue totals (for
          // example, submitted registrations) alongside the page. Keeping
          // them separate prevents a header from accidentally reporting only
          // the rows visible on this page.
          meta: data?.summary ?? null,
          failed: false,
        })
      })
      .catch(() => {
        if (cancelled) return
        setResult({ key: requestKey, rows: [], total: 0, meta: null, failed: true })
      })
    return () => {
      cancelled = true
    }
    // `fetcher` is a stable module function by contract; requestKey carries
    // every varying input by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  // Mirror state to the URL without navigating, so a filtered view is
  // shareable and survives a reload. replaceState touches no React state.
  useEffect(() => {
    if (!urlKey || typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(window.location.search)
      for (const key of [...params.keys()]) {
        if (key === `${urlKey}_q` || key === `${urlKey}_page` || key === `${urlKey}_ps` || key === `${urlKey}_sort` || key.startsWith(`${urlKey}_f_`)) {
          params.delete(key)
        }
      }
      if (debounced) params.set(`${urlKey}_q`, debounced)
      if (page !== 1) params.set(`${urlKey}_page`, String(page))
      if (pageSize !== defaultPageSize) params.set(`${urlKey}_ps`, String(pageSize))
      if (sort) params.set(`${urlKey}_sort`, `${sort.key}:${sort.direction}`)
      for (const [key, value] of Object.entries(filterValues)) {
        if (value) params.set(`${urlKey}_f_${key}`, value)
      }
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', next)
    } catch {
      // URL sync is progressive enhancement; a filtered table works without it.
    }
  }, [urlKey, debounced, page, pageSize, sort, filterValues, defaultPageSize])

  // asc → desc → server default. The third state matters: it returns to the
  // endpoint's own order (usually newest first) without reloading the page.
  const toggleSort = (key) =>
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' }
      if (current.direction === 'asc') return { key, direction: 'desc' }
      return null
    })

  const isDirty = Boolean(debounced) || Object.values(filterValues).some(Boolean) || Boolean(sort)

  const reset = () => {
    setQuery('')
    setDebounced('')
    setFilterValues({})
    setSort(null)
    setPage(1)
  }

  const loading = result.key !== requestKey
  const refresh = useCallback(() => {
    setRefreshToken((current) => current + 1)
  }, [])

  return {
    rows: result.rows,
    pageRows: result.rows,
    total: result.total,
    meta: result.meta,
    totalBeforeFilters: result.total,
    loading,
    failed: result.failed,
    refresh,
    toolbarProps: {
      query,
      onQueryChange: (value) => setQuery(value),
      filters: filterDefs,
      filterValues,
      onFilterChange: (key, value) => {
        setFilterValues((current) => ({ ...current, [key]: value }))
        setPage(1)
      },
      onReset: reset,
      isDirty,
    },
    sortProps: (key) => ({
      sortKey: key,
      activeKey: sort?.key ?? null,
      direction: sort?.direction ?? null,
      onSort: toggleSort,
    }),
    paginationProps: {
      page,
      pageSize,
      totalItems: result.total,
      onPageChange: setPage,
      onPageSizeChange: (size) => {
        setPageSize(size)
        setPage(1)
      },
      pageSizeOptions,
    },
    sort,
    toggleSort,
    reset,
    isDirty,
  }
}
