import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

// Shared sidebar shell used by every role. Content (title, nav sections) is
// passed in per role from src/config/navigation.js so the chrome stays
// identical everywhere.
//
// Collapsing keeps the icons and drops the labels rather than hiding the rail
// entirely: navigation stays one click away and the muscle memory of item
// position survives. The collapsed state is stored on the account, so it
// follows the user rather than the browser.
export default function Sidebar({ brandTitle, brandSubtitle, sections, collapsed, onToggle }) {
  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border-muted bg-sidebar transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <div
        className={`flex items-start gap-2 border-b border-border-muted px-3 py-3 ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-[13px] font-semibold text-navy">{brandTitle}</h1>
            <p className="truncate text-[11px] text-text-faint">{brandSubtitle}</p>
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
                  // The native tooltip carries the label when it is not on
                  // screen — without it a collapsed rail is a column of
                  // unlabelled icons.
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md text-[12px] font-medium transition-colors ${
                      collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-2'
                    } ${
                      isActive
                        ? 'bg-navy-tint text-navy'
                        : 'text-text-secondary hover:bg-navy-tint/60 hover:text-navy'
                    }`
                  }
                >
                  <item.icon size={15} strokeWidth={2} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
