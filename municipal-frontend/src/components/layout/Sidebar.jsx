import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, User, LogOut, UserCircle } from 'lucide-react'
import { useAuth } from '../../context/useAuth'

// Shared sidebar shell used by every role. Content (title, nav sections) is
// passed in per role from src/config/navigation.js so the chrome stays
// identical everywhere.
//
// Collapsing keeps the icons and drops the labels rather than hiding the rail
// entirely: navigation stays one click away and the muscle memory of item
// position survives. The collapsed state is stored on the account, so it
// follows the user rather than the browser.
//
// ── THE ACCOUNT FOOTER ──────────────────────────────────────────────────────
// Profile and sign-out used to live in a dropdown in the top bar, which made
// them the only two destinations in the application that were not in the rail.
// They are navigation like everything else, so they are here.
//
// It sits at the *bottom of the scroll flow*, not pinned below it: `mt-auto`
// drops it to the foot of the rail when the nav is short, and it scrolls up
// with the rest when the nav is long. It used to be a `shrink-0` block outside
// the scroll container, which held it fixed while only the links above it
// moved — the thing this layout deliberately no longer does.
//
const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

const itemClass = (collapsed, isActive) =>
  `flex items-center gap-3 rounded-md text-[13px] font-medium transition-colors ${
    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
  } ${isActive ? 'bg-navy-tint text-navy' : 'text-text-secondary hover:bg-navy-tint/60 hover:text-navy'}`

export default function Sidebar({ brandTitle, brandSubtitle, sections, collapsed, onToggle, onLogout }) {
  const { user } = useAuth()

  return (
    <aside
      // White, now that the page behind the content is faintly tinted — the rail
      // reads as its own panel rather than as a slightly different grey next to
      // another grey.
      className={`flex h-full shrink-0 flex-col border-r border-border-muted bg-surface transition-[width] duration-200 ${
        collapsed ? 'w-15' : 'w-60'
      }`}
    >
      <div
        className={`flex items-start gap-2 border-b border-border-muted px-3 py-3 ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold text-navy">{brandTitle}</h1>
            <p className="truncate text-[11.5px] text-text-faint">{brandSubtitle}</p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-navy-tint hover:text-navy"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto p-2">
        {sections.map((section, index) => (
          <div
            key={section.heading ?? index}
            className={index > 0 ? 'border-t border-border-muted pt-3' : undefined}
          >
            {section.heading && !collapsed && (
              <p className="px-2 pb-1.5 text-[10px] font-medium tracking-[0.05em] text-text-faint uppercase">
                {section.heading}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={`${item.href}:${item.label}`}
                  to={item.href}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => itemClass(collapsed, isActive)}
                >
                  <item.icon size={15} strokeWidth={2} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {/* The account block. `mt-auto` sits it at the foot of the rail when the
            nav is short, and lets it scroll up with the links when the nav is
            long — it is part of the scroll flow, not pinned beneath it. The
            negative margins bleed the top border to the rail's edges, since the
            surrounding `<nav>` carries its own padding. */}
        <div className="mt-auto -mx-2 border-t border-border-muted px-2 pt-2">
          {!collapsed && (
            <div className="mb-1.5 flex items-center gap-2.5 px-1.5 py-1.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">
                {initialsOf(user?.name) || <UserCircle size={16} />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-navy">{user?.name}</p>
                <p className="truncate text-[11px] text-text-faint">{user?.roleName}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            <NavLink
              to="/profile"
              title={collapsed ? 'My Profile' : undefined}
              className={({ isActive }) => itemClass(collapsed, isActive)}
            >
              <User size={15} strokeWidth={2} className="shrink-0" />
              {!collapsed && <span className="truncate">My Profile</span>}
            </NavLink>

            <button
              type="button"
              onClick={onLogout}
              title={collapsed ? 'Log out' : undefined}
              className={`flex items-center gap-2.5 rounded-md text-[12px] font-medium text-danger transition-colors hover:bg-danger/10 ${
                collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-2'
              }`}
            >
              <LogOut size={15} strokeWidth={2} className="shrink-0" />
              {!collapsed && <span className="truncate">Log out</span>}
            </button>
          </div>
        </div>
      </nav>
    </aside>
  )
}
