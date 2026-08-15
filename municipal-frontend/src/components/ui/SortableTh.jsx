import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

// A sortable <th>, for dropping into the header row of a table that already
// exists. Spread `sortProps(key)` from useTableControls onto it:
//
//   <SortableTh {...table.sortProps('referenceNo')}>Reference</SortableTh>
//
// Not sortable? Use <Th> from the same file, so both header cells share one
// set of type and spacing rules and a table's head does not end up with two
// different-looking kinds of column.

// Type and colour only — no padding. A sortable header puts its padding on the
// inner button (so the whole cell is the click target), a plain one puts it on
// the <th>. Keeping the spacing out of BASE is what stops the two from being
// applied twice.
//
// This previously read `px-4 py-2 …` and SortableTh appended `p-0` to cancel
// it. That cancel silently lost: `p-0` and `px-4` carry equal specificity, so
// the winner is whichever Tailwind emits last, and it emits the shorthand
// before the axis utilities — leaving `px-4` on the <th> *and* `px-4` on the
// button. Every sortable column in the app drew its label 32px from the cell
// edge while the data beneath it sat at 16px.
// `text-navy`, not the muted `text-text-faint` this used to carry. A sortable
// header also set `hover:text-navy`, so a column label only became readable
// while the cursor happened to be resting on it — the heading that tells you
// what a column *is* was the faintest thing in the table until you touched it.
//
// This also clears a real accessibility failure rather than just a preference:
// at 10.5px, `text-text-faint` measures about 3.4:1 on the white surface, under
// the WCAG AA minimum of 4.5:1 for body text.
const BASE =
  'text-left text-[10.5px] font-medium tracking-[0.04em] whitespace-nowrap text-navy uppercase'

const PADDING = 'px-4 py-2'

export function Th({ children, className = '', ...props }) {
  return (
    <th scope="col" className={`${BASE} ${PADDING} ${className}`} {...props}>
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
      className={`${BASE} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${typeof children === 'string' ? children : sortKey}`}
        // No hover or active colour switch: the label is already at full
        // strength, so both used to resolve to the colour it now always has.
        // Sort state is carried by the chevron below — which direction it
        // points, and whether it is at full opacity — and by aria-sort.
        className={`flex w-full items-center gap-1.5 ${PADDING} text-left uppercase`}
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
