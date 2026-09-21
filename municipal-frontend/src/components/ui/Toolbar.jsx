import { Search, XCircle, List, LayoutGrid } from 'lucide-react'
import ResponsiveSelect from './ResponsiveSelect'

// ── FILTER TOOLBAR ───────────────────────────────────────────────────────────
// The control strip from the reference: a search field with a leading icon,
// a row of selects, a reset affordance, and an optional list/grid switch, all
// sharing one height and one corner radius so the row reads as a single band.
//
// Composed from small exported pieces rather than one monolithic component,
// because every screen filters on something different — but they should all
// look identical while doing it.

// Matched to the medium Button height so a toolbar row lines up with the action
// beside it rather than sitting a pixel or two proud of it.
const CONTROL = 'h-11 rounded-md border border-border-muted bg-surface text-sm transition-colors md:h-10'

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative min-w-0 w-full sm:flex-1 ${className}`}>
      <Search
        size={15}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${CONTROL} w-full pr-3 pl-9 text-navy placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none`}
      />
    </div>
  )
}

export function FilterSelect({ value, onChange, options, placeholder, ariaLabel, className = '' }) {
  const normalizedOptions = [
    ...(placeholder ? [{ value: '', label: placeholder }] : []),
    ...options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option)),
  ]

  return (
    <ResponsiveSelect
      value={value}
      onChange={onChange}
      options={normalizedOptions}
      title={ariaLabel ?? placeholder ?? 'Filter'}
      mobileClassName={`rounded-md border border-border-muted bg-surface px-3 text-text-secondary hover:border-border-strong ${className}`}
      desktopClassName={`${CONTROL} min-w-36 px-2.5 text-text-secondary focus:border-accent focus:outline-none ${className}`}
    />
  )
}

export function ResetFilters({ onReset, disabled }) {
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md px-2.5 text-sm text-text-secondary transition-colors hover:text-navy disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto md:h-10"
    >
      <XCircle size={15} />
      Reset filters
    </button>
  )
}

// Segmented list/grid switch, styled as one control rather than two buttons.
export function ViewToggle({ view, onChange }) {
  const option = (key, Icon, label) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      aria-label={label}
      aria-pressed={view === key}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        view === key ? 'bg-surface text-navy shadow-sm' : 'text-text-faint hover:text-navy'
      }`}
    >
      <Icon size={15} />
    </button>
  )

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border-muted bg-sidebar p-0.5">
      {option('list', List, 'List view')}
      {option('grid', LayoutGrid, 'Grid view')}
    </div>
  )
}

export default function Toolbar({ children, className = '' }) {
  return <div className={`flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>{children}</div>
}
