import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Menu } from 'lucide-react'
import NotificationBell from './NotificationBell'
import ThemeToggle from '../ui/ThemeToggle'

// Shared top bar. Uses the `brand` tokens rather than `accent`, because this
// strip stays dark in both themes — inverting it would leave the app with no
// anchor at the top of the page.
//
// ── NO NAVIGATION LIVES HERE ────────────────────────────────────────────────
// Every role used to declare a `topLinks` array that was rendered next to the
// wordmark. Each of those links already existed in that role's sidebar, so the
// header was a second, shorter, differently-worded copy of the rail below it —
// two places to look for the same destination, and two labels for one page.
// The header now carries identity and account-level controls only; everything
// you can navigate to is in the sidebar, once.
//
// ── ONE ICON SIZE ───────────────────────────────────────────────────────────
// The three controls on the right were 15px, 20px and 22px, in that order, which
// made the theme toggle read as a lesser control than the bell beside it. They
// are one size in one box now, and the box is what gives them their hit area.
//
// ── DYNAMIC SYSTEM NAME ─────────────────────────────────────────────────────
// The wordmark is configurable by the system administrator through System
// Settings → Branding. It falls back to "ProcureNance" when no override is set.
export default function TopNavBar({ sections = [], lguName, systemName, onOpenNavigation }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [noMatch, setNoMatch] = useState(false)
  const destinations = sections.flatMap((section) => section.items)
  const findPage = (event) => {
    event.preventDefault()
    const query = search.trim().toLowerCase()
    const match = query && (destinations.find((item) => item.label.toLowerCase() === query)
      ?? destinations.find((item) => item.label.toLowerCase().includes(query)))
    if (match) { setSearch(''); setNoMatch(false); navigate(match.href) }
    else setNoMatch(true)
  }
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-black/20 bg-brand px-5">
      <div className="flex min-w-0 items-center gap-5">
        <button type="button" aria-label="Open navigation" onClick={onOpenNavigation} className="flex h-9 w-9 shrink-0 items-center justify-center text-brand-fg md:hidden"><Menu size={20} /></button>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-brand-fg">{systemName || 'ProcureNance'}</span>
          {lguName && (
            <span className="truncate text-[11px] tracking-[0.02em] text-topnav-link">{lguName}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <form onSubmit={findPage} className="relative hidden lg:block">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-topnav-link"
          />
          <input
            type="search"
            placeholder="Find a page…"
            aria-label="Find a workspace page"
            list="workspace-pages"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setNoMatch(false) }}
            className="h-9 w-64 rounded-md border border-white/10 bg-white/10 pr-3 pl-9 text-[13px] text-brand-fg placeholder:text-topnav-link focus:border-white/25 focus:outline-none"
          />
          <datalist id="workspace-pages">{destinations.map((item) => <option key={`${item.href}:${item.label}`} value={item.label} />)}</datalist>
          {noMatch && <p role="status" className="absolute right-0 mt-1 rounded border border-border-muted bg-surface p-2 text-xs text-navy">No matching page. Choose a page from the suggestions.</p>}
        </form>
        <ThemeToggle tone="brand" />
        <NotificationBell />
      </div>
    </header>
  )
}
