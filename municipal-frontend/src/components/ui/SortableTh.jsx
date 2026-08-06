import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

// A sortable <th>, for dropping into the header row of a table that already
// exists. Spread `sortProps(key)` from useTableControls onto it:
//
//   <SortableTh {...table.sortProps('referenceNo')}>Reference</SortableTh>
//
// Not sortable? Use <Th> from the same file, so both header cells share one
// set of type and spacing rules and a table's head does not end up with two
// different-looking kinds of column.

const BASE =
  'px-4 py-2 text-left text-[10.5px] font-medium tracking-[0.04em] whitespace-nowrap text-text-faint uppercase'

export function Th({ children, className = '', ...props }) {
  return (
    <th scope="col" className={`${BASE} ${className}`} {...props}>
      {children}
    </th>
  )
}

export default function SortableTh({
  sortKey,
  activeKey,
  direction,
  onSort,
  children,
  className = '',
}) {
  const active = activeKey === sortKey
  const Icon = !active ? ChevronsUpDown : direction === 'desc' ? ChevronDown : ChevronUp

  return (
    <th
      scope="col"
      // Announced to assistive technology, which otherwise has no way to know
      // the column is sorted or which way.
      aria-sort={!active ? 'none' : direction === 'desc' ? 'descending' : 'ascending'}
      className={`${BASE} p-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${typeof children === 'string' ? children : sortKey}`}
        className={`flex w-full items-center gap-1.5 px-4 py-2 text-left uppercase transition-colors hover:text-navy ${
          active ? 'text-navy' : ''
        }`}
      >
        {children}
        <Icon
          size={12}
          className={`shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-35'}`}
        />
      </button>
    </th>
  )
}
