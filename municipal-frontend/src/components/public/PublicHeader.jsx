import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Landmark, MoreVertical, LogIn, LayoutDashboard, LogOut, FileCheck2 } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { landingRouteForRole } from '../../config/roleLanding'
import ThemeToggle from '../ui/ThemeToggle'

// Header for the public portal.
//
// Green, matching the page's primary buttons exactly — both read from
// `--color-header` / `--color-accent`, which hold the same value. It stays green
// in dark mode too (deepened), which is why it uses its own token rather than
// `accent`: accent flips to near-white on a dark surface.
//
// Sign-in is deliberately demoted to a three-dot menu. On a transparency site
// the visitor is the citizen, not the official: putting a login button at the
// top of the page implies the content behind it is the real system and the
// public view is a lobby. Staff know where to find it; nobody else needs to.
//
// The two sections live here as real links driven by `?view=`, not by props from
// the landing page. That is what makes them work from the project detail page as
// well — a reader three clicks deep can still get back to Announcements — and it
// gives each section a shareable URL and a working browser Back button.
const SECTIONS = [
  { key: 'projects', label: 'Projects', to: '/' },
  { key: 'announcements', label: 'Announcements', to: '/?view=announcements' },
]

export default function PublicHeader({ lguName }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  // Only the landing page has sections to be "on". On a project detail page
  // neither pill is active — the links are a way back, not a current position.
  const onLanding = ['/', '/public/transparency'].includes(location.pathname)
  const activeSection = onLanding
    ? searchParams.get('view') === 'announcements'
      ? 'announcements'
      : 'projects'
    : null

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
    <header className="sticky top-0 z-30 bg-header">
      {/* Same max-w-7xl and px-4 / sm:px-8 gutters as the page below it.

          Three columns, not `justify-between`. Space-between positions the nav
          by the *content widths* either side of it, and the masthead is much
          wider than the two controls on the right — so the pills landed well
          right of centre. `1fr auto 1fr` gives the outer columns equal width
          whatever they contain, which puts the nav on the header's true
          midpoint.

          Each child is pinned to its own column. That is not decoration: below
          `sm` the nav is `display:none`, which takes it out of grid flow
          entirely, and auto-placement then slid the right-hand controls into
          column 2 — leaving them stranded mid-header with an empty column
          beside them. Explicit placement keeps column 2 empty instead. */}
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3.5 sm:px-8">
        <Link to="/" className="col-start-1 flex min-w-0 items-center gap-3">
          <Landmark size={24} className="shrink-0 text-header-fg" />
          <div className="min-w-0">
            <p className="truncate text-[15.5px] font-semibold tracking-[-0.01em] text-header-fg">
              {lguName ?? 'Municipal'} Transparency Portal
            </p>
            <p className="truncate text-[11.5px] tracking-[0.03em] text-header-muted uppercase">
              Public procurement records · No account required
            </p>
          </div>
        </Link>

        {/* ── Sections ──────────────────────────────────────────────────────
            Pills, matching the landing page's controls. The active one inverts
            to a white pill with green text, which is the clearest available
            "you are here" on a saturated background — an underline reads as
            decoration at this contrast. Hidden below `sm`, where the nav under
            the masthead would wrap the whole header onto three lines; the hero
            buttons cover the same two destinations there. */}
        <nav
          className="col-start-2 hidden items-center justify-center gap-1 sm:flex"
          aria-label="Portal sections"
        >
          {SECTIONS.map((section) => {
            const active = activeSection === section.key
            return (
              <Link
                key={section.key}
                to={section.to}
                aria-current={active ? 'page' : undefined}
                className={`rounded-full px-4 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-header'
                    : 'text-header-muted hover:bg-white/15 hover:text-header-fg'
                }`}
              >
                {section.label}
              </Link>
            )
          })}
        </nav>

        {/* A citizen reading at night is still a citizen. The toggle sits on the
            public page too, and their choice is remembered in this browser —
            there is no account to hang it on. */}
        <div className="col-start-3 flex shrink-0 items-center justify-end gap-1">
          <ThemeToggle tone="header" />

          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="More options"
              className="flex h-9 w-9 items-center justify-center rounded-full text-header-fg transition-colors hover:bg-white/15 focus:ring-2 focus:ring-white/50 focus:outline-none"
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

                    {/* Information, not a link. A prospective bidder needs to
                        know where to go — and that where is an office, not a
                        page. There is nothing to click because there is nothing
                        to submit online. */}
                    <div className="border-t border-border-muted px-4 pt-2.5 pb-3">
                      <p className="flex items-center gap-2 text-[12px] font-medium text-navy">
                        <FileCheck2 size={14} /> Want to become a bidder?
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-text-faint">
                        Submit your eligibility requirements in person at the BAC Secretariat office.
                        The BAC verifies them and Admin/IT issues your account — there is no online
                        submission or sign-up.
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
