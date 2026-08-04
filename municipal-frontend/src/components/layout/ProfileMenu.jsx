import { useEffect, useRef, useState } from 'react'
import { UserCircle, User, KeyRound, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/useAuth'

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

export default function ProfileMenu({ onOpenProfile, onOpenChangePassword, onLogout }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (action) => {
    setOpen(false)
    action()
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded text-white/80 hover:text-white"
      >
        <UserCircle size={22} />
        <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-border-muted bg-surface shadow-xl"
        >
          <div className="flex items-center gap-3 border-b border-border-muted bg-sidebar px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
              {initialsOf(user?.name) || <UserCircle size={18} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-navy">{user?.name}</p>
              <p className="truncate text-xs text-text-secondary">{user?.email}</p>
            </div>
          </div>

          <div className="border-b border-border-muted px-4 py-2">
            <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Role</p>
            <p className="text-[13px] text-navy">{user?.roleName}</p>
            {user?.departmentName && (
              <>
                <p className="mt-1 text-[11px] tracking-[0.03em] text-text-faint uppercase">Department</p>
                <p className="text-[13px] text-navy">{user.departmentName}</p>
              </>
            )}
          </div>

          <nav className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onOpenProfile)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-text-secondary hover:bg-sidebar hover:text-navy"
            >
              <User size={15} /> My Profile
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onOpenChangePassword)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-text-secondary hover:bg-sidebar hover:text-navy"
            >
              <KeyRound size={15} /> Change Password
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onLogout)}
              className="flex w-full items-center gap-3 border-t border-border-muted px-4 py-2 text-left text-[13px] text-danger hover:bg-danger/5"
            >
              <LogOut size={15} /> Log out
            </button>
          </nav>
        </div>
      )}
    </div>
  )
}
