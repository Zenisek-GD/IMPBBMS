import Toolbar, { SearchInput, FilterSelect, ResetFilters } from './Toolbar'

// The control strip that sits above a table: one search field, one select per
// filter, and a reset. Driven entirely by `toolbarProps` from useTableControls,
// so a screen adds search-and-filter by rendering this and nothing else.
//
// It exists so the strip is identical on every table. The pieces it composes
// (SearchInput, FilterSelect, ResetFilters) were already in Toolbar.jsx and
// were used on almost nothing — the reason being that wiring them up by hand
// meant four pieces of state per screen, so nobody did it twice.
export default function TableToolbar({
  query,
  onQueryChange,
  filters = [],
  filterValues = {},
  onFilterChange,
  onReset,
  isDirty,
  searchPlaceholder = 'Search…',
  children,
  className = '',
}) {
  return (
    <Toolbar className={className}>
      <SearchInput value={query} onChange={onQueryChange} placeholder={searchPlaceholder} />

      {filters.map((filter) => (
        <FilterSelect
          key={filter.key}
          value={filterValues[filter.key] ?? ''}
          onChange={(value) => onFilterChange(filter.key, value)}
          options={filter.options ?? []}
          placeholder={filter.label}
          ariaLabel={filter.label}
        />
      ))}

      {children}

      <ResetFilters onReset={onReset} disabled={!isDirty} />
    </Toolbar>
  )
}
