import { useMemo, useState } from 'react'
import { usePagination } from './usePagination'

// ── ONE SET OF TABLE CONTROLS, FOR EVERY TABLE ───────────────────────────────
// Search, filter, sort and paging over an in-memory row set. Headless on
// purpose: it returns data and prop bundles, and renders nothing. Every screen
// in this system draws its own cells — a requisition row carries stage badges
// and action buttons, an appropriation row carries running balances — and a
// component that owned the markup would force all of them into the same shape.
// So this owns the *behaviour* and leaves the <table> where it is.
//
// Pair it with <TableToolbar /> above the table and <SortableTh /> in the head.
//
// Everything is client-side, which is the right call here: these endpoints
// already return the whole working set (the widest is the audit log, capped
// server-side), so filtering locally is instant and costs no round trip.

// Nulls sort last in both directions — an empty cell is not "smallest", it is
// absent, and burying it under real values is what a reader expects.
//
// `numeric: true` is what makes "PR-2" come before "PR-10" instead of after it,
// which matters because almost every reference number in this system is a
// prefix followed by a counter. ISO dates sort correctly as plain strings, so
// they need no special case.
const compareValues = (a, b) => {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1
  if (b == null || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

// Flattens a row to the text a free-text search should look through. Used when
// a caller does not name `searchKeys`, so a table gets working search by
// default rather than none.
const defaultHaystack = (row) =>
  Object.values(row ?? {})
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ')

const readValue = (row, key, accessor) => {
  if (typeof accessor === 'function') return accessor(row)
  return row?.[key]
}

/**
 * @param rows      the full row set
 * @param options.searchKeys  (row) => string, or an array whose entries are
 *                            field names and/or (row) => value functions. Omit
 *                            to search every string/number field on the row.
 * @param options.filters     [{ key, label, options?, accessor? }]. `options`
 *                            omitted means "derive the distinct values present".
 * @param options.accessors    { [columnKey]: (row) => sortableValue } for
 *                            columns whose sort value is not row[key].
 * @param options.initialSort { key, direction: 'asc' | 'desc' }
 * @param options.pageSize
 */
export function useTableControls(rows, options = {}) {
  const {
    searchKeys,
    filters: filterDefs = [],
    accessors = {},
    initialSort = null,
    pageSize = 10,
  } = options

  const [query, setQuery] = useState('')
  const [filterValues, setFilterValues] = useState({})
  const [sort, setSort] = useState(initialSort)

  const all = useMemo(() => rows ?? [], [rows])

  // Filter option lists are derived from the rows actually present unless the
  // caller supplied them, so a status that never occurs is never offered.
  const filters = useMemo(
    () =>
      filterDefs.map((definition) => {
        if (definition.options) return definition
        const seen = new Map()
        all.forEach((row) => {
          const value = readValue(row, definition.key, definition.accessor)
          if (value == null || value === '') return
          if (!seen.has(String(value))) seen.set(String(value), value)
        })
        return {
          ...definition,
          options: [...seen.keys()].sort((a, b) => compareValues(a, b)),
        }
      }),
    [filterDefs, all]
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return all.filter((row) => {
      for (const definition of filterDefs) {
        const selected = filterValues[definition.key]
        if (!selected) continue
        if (String(readValue(row, definition.key, definition.accessor) ?? '') !== selected) {
          return false
        }
      }

      if (!needle) return true

      // `searchKeys` may be a function over the whole row, or an array whose
      // entries are either field names or functions — a nested value like
      // `invoice.payment.disbursementNo` has no plain key to name.
      const haystack =
        typeof searchKeys === 'function'
          ? searchKeys(row)
          : Array.isArray(searchKeys)
            ? searchKeys
                .map((key) => (typeof key === 'function' ? key(row) : readValue(row, key, accessors[key])))
                .filter((value) => value != null)
                .join(' ')
            : defaultHaystack(row)

      return String(haystack ?? '').toLowerCase().includes(needle)
    })
  }, [all, query, filterValues, filterDefs, searchKeys, accessors])

  const sorted = useMemo(() => {
    if (!sort?.key) return filtered
    const direction = sort.direction === 'desc' ? -1 : 1
    // toSorted would be tidier but copying explicitly keeps this working on the
    // older runtimes the LGU's machines are likely to be on.
    return [...filtered].sort(
      (left, right) =>
        direction *
        compareValues(
          readValue(left, sort.key, accessors[sort.key]),
          readValue(right, sort.key, accessors[sort.key])
        )
    )
  }, [filtered, sort, accessors])

  const { pageRows, paginationProps } = usePagination(sorted, pageSize)

  // asc → desc → unsorted. The third state matters: it is how a reader gets
  // back to the order the office actually works in, which for most of these
  // tables is the order the records were filed.
  const toggleSort = (key) =>
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' }
      if (current.direction === 'asc') return { key, direction: 'desc' }
      return null
    })

  const isDirty = Boolean(query) || Object.values(filterValues).some(Boolean) || Boolean(sort)

  const reset = () => {
    setQuery('')
    setFilterValues({})
    setSort(initialSort)
  }

  return {
    rows: sorted,
    pageRows,
    paginationProps,
    // Spread straight onto <TableToolbar />.
    toolbarProps: {
      query,
      onQueryChange: setQuery,
      filters,
      filterValues,
      onFilterChange: (key, value) =>
        setFilterValues((current) => ({ ...current, [key]: value })),
      onReset: reset,
      isDirty,
    },
    // Spread onto <SortableTh />.
    sortProps: (key) => ({
      sortKey: key,
      activeKey: sort?.key ?? null,
      direction: sort?.direction ?? null,
      onSort: toggleSort,
    }),
    sort,
    toggleSort,
    reset,
    isDirty,
    // How many rows the filters are hiding, for an empty-state message that can
    // tell "no records exist" apart from "your filters excluded them all".
    totalBeforeFilters: all.length,
  }
}
