import { NavLink } from 'react-router-dom'
import { Search } from 'lucide-react'
import ProfileMenu from './ProfileMenu'
import NotificationBell from './NotificationBell'
import ThemeToggle from '../ui/ThemeToggle'

// Shared top bar. Uses the `brand` tokens rather than `accent`, because this
// strip stays dark in both themes — inverting it would leave the app with no
// anchor at the top of the page.
export default function TopNavBar({
  links,
  searchPlaceholder,
  onLogout,
  onOpenProfile,
  onOpenChangePassword,
  lguName,
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-black/20 bg-brand px-4">
      <div className="flex min-w-0 items-center gap-5">
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-brand-fg">CivicBid</span>
          {lguName && (
            <span className="truncate text-[9.5px] tracking-[0.02em] text-topnav-link">{lguName}</span>
          )}
        </div>
        <nav className="hidden items-center gap-2 md:flex">
          {links.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              className={({ isActive }) =>
                `rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-brand-fg'
                    : 'text-topnav-link hover:bg-white/5 hover:text-topnav-link-alt'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative hidden lg:block">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-topnav-link"
          />
          <input
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8 w-56 rounded-md border border-white/10 bg-white/10 pr-3 pl-8 text-[12px] text-brand-fg placeholder:text-topnav-link focus:border-white/25 focus:outline-none"
          />
        </div>
        <ThemeToggle tone="brand" />
        <NotificationBell />
        <ProfileMenu
          onOpenProfile={onOpenProfile}
          onOpenChangePassword={onOpenChangePassword}
          onLogout={onLogout}
        />
      </div>
    </header>
  )
}
