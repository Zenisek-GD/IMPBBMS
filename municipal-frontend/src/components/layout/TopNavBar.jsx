import { Search } from 'lucide-react'
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
export default function TopNavBar({ searchPlaceholder, lguName }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-black/20 bg-brand px-5">
      <div className="flex min-w-0 items-center gap-5">
        <div className="flex flex-col leading-tight">
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-brand-fg">CivicBid</span>
          {lguName && (
            <span className="truncate text-[11px] tracking-[0.02em] text-topnav-link">{lguName}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden lg:block">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-topnav-link"
          />
          <input
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-64 rounded-md border border-white/10 bg-white/10 pr-3 pl-9 text-[13px] text-brand-fg placeholder:text-topnav-link focus:border-white/25 focus:outline-none"
          />
        </div>
        <ThemeToggle tone="brand" />
        <NotificationBell />
      </div>
    </header>
  )
}
