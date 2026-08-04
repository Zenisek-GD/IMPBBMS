import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Landmark, MoreVertical, LogIn, LayoutDashboard, LogOut, FileCheck2 } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { landingRouteForRole } from '../../config/roleLanding'
import ThemeToggle from '../ui/ThemeToggle'

// Header for the public portal.
//
// Sign-in is deliberately demoted to a three-dot menu. On a transparency site
// the visitor is the citizen, not the official: putting a login button at the
// top of the page implies the content behind it is the real system and the
// public view is a lobby. Staff know where to find it; nobody else needs to.
export default function PublicHeader({ lguName }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  // A menu that only closes on its own trigger is a trap on touch devices.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleSignOut = async () => {
    setOpen(false)
    await logout()
    navigate('/', { replace: true })
  }

  const itemClass =
    'flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-sidebar hover:text-navy'

  return (
    <header className="sticky top-0 z-30 border-b border-black/20 bg-brand">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link to="/" className="flex items-center gap-3">
          <Landmark size={22} className="shrink-0 text-brand-fg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-brand-fg">
              {lguName ?? 'Municipal'} Transparency Portal
            </p>
            <p className="text-[11px] tracking-[0.03em] text-topnav-link uppercase">
              Public procurement records · No account required
            </p>
          </div>
        </Link>

        {/* A citizen reading at night is still a citizen. The toggle sits on the
            public page too, and their choice is remembered in this browser —
            there is no account to hang it on. */}
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle tone="brand" />

          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="More options"
              className="flex h-10 w-10 items-center justify-center rounded-full text-brand-fg transition-colors hover:bg-white/10 focus:ring-2 focus:ring-white/40 focus:outline-none"
            >
              <MoreVertical size={20} />
            </button>

            {open && (
              <div
                ref={menuRef}
                role="menu"
                className="absolute right-0 mt-2 w-60 overflow-hidden rounded-lg border border-border-muted bg-surface py-1 shadow-lg"
              >
                {user ? (
                  <>
                    <div className="border-b border-border-muted px-4 py-3">
                      <p className="truncate text-[13px] font-semibold text-navy">{user.name}</p>
                      <p className="truncate text-[11px] text-text-faint">{user.roleName}</p>
                    </div>
                    <Link
                      to={landingRouteForRole(user.role)}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={itemClass}
                    >
                      <LayoutDashboard size={15} /> Go to my dashboard
                    </Link>
                    <button type="button" role="menuitem" onClick={handleSignOut} className={itemClass}>
                      <LogOut size={15} /> Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
                      <LogIn size={15} /> Login
                    </Link>
                    <p className="px-4 pt-1 pb-2 text-[11px] leading-relaxed text-text-faint">
                      For authorised officials, administrators and accredited bidders. Browsing these
                      records needs no account.
                    </p>

                    {/* The way in for a business that does not have an account yet.
                        It leads to accreditation, not to a sign-up form — there is
                        no public registration, and the page says so. */}
                    <div className="border-t border-border-muted">
                      <Link
                        to="/bidder-registration"
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className={itemClass}
                      >
                        <FileCheck2 size={15} /> Bidder accreditation
                      </Link>
                      <p className="px-4 pt-1 pb-3 text-[11px] leading-relaxed text-text-faint">
                        Submit your eligibility requirements. Accounts are issued by the BAC after
                        review.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
