import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { MoreVertical, LogIn, LayoutDashboard, LogOut, FileCheck2 } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { landingRouteForRole } from '../../config/roleLanding'
import ThemeToggle from '../ui/ThemeToggle'

// ── Header for the public portal ─────────────────────────────────────────────
// A glass bar over the page rather than the solid green slab this used to be.
// The masthead sits left, the sections float in a pill on the true centre, and
// everything else is behind one menu on the right.
//
// Green has not gone anywhere — it is still the LGU's colour on every primary
// action and every status below. What changed is that it is no longer a band
// across the top of a page that is otherwise white and quiet, which is what made
// the portal feel like two designs stacked on each other.
//
// Sign-in stays demoted to the three-dot menu. On a transparency site the
// visitor is the citizen, not the official: a login button at the top implies
// the content behind it is the real system and the public view is a lobby.
//
// The sections are real links driven by `?view=`, not props from the landing
// page. That is what makes them work from a project detail page too — a reader
// three clicks deep can still get back — and gives each a shareable URL and a
// working Back button.
const SECTIONS = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'projects', label: 'Projects', to: '/?view=projects' },
  { key: 'announcements', label: 'Announcements', to: '/?view=announcements' },
  { key: 'about', label: 'About', to: '/?view=about' },
  { key: 'contact', label: 'Contact', to: '/?view=contact' },
]

export default function PublicHeader({ lguName }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  // Only the landing page has sections to be "on". On a project detail page no
  // pill is active — the links are a way back, not a current position.
  const onLanding = ['/', '/public/transparency'].includes(location.pathname)
  const view = searchParams.get('view')
  const activeSection = onLanding ? (view ?? 'home') : null

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
    'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-sidebar hover:text-navy'

  return (
    <header className="glass sticky top-0 z-30 border-b border-border-muted/70">
      {/* Three columns, not `justify-between`. Space-between positions the nav by
          the content widths either side of it, and the masthead is much wider
          than the controls on the right — so the pill landed well right of
          centre. `1fr auto 1fr` gives the outer columns equal width whatever
          they hold, which puts the nav on the header's true midpoint.

          Each child is pinned to its own column. Below `md` the nav is hidden,
          which takes it out of grid flow, and auto-placement then slid the
          right-hand controls into column 2 — stranding them mid-header. Explicit
          placement leaves column 2 empty instead. */}
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 sm:px-8">
        <Link to="/" className="col-start-1 flex min-w-0 items-center">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold tracking-[-0.015em] text-navy">
              CivicBid
            </p>
            <p className="truncate text-[11.5px] text-text-faint">
              {lguName ?? 'Municipal Transparency Portal'}
            </p>
          </div>
        </Link>

        {/* ── The floating pill ──────────────────────────────────────────────
            Its own glass surface inside the glass bar, which is what makes it
            read as a control resting on the header rather than as four links
            printed on it. The active section is a filled green pill: on a light
            bar that is the clearest available "you are here", and it is the one
            place the LGU's colour appears up here. */}
        <nav
          className="glass col-start-2 hidden items-center gap-0.5 rounded-full border border-border-muted/80 p-1 shadow-sm md:flex"
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
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-text-secondary hover:bg-navy-tint hover:text-navy'
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
          <ThemeToggle />

          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="More options"
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-navy-tint hover:text-navy focus:ring-2 focus:ring-accent/40 focus:outline-none"
            >
              <MoreVertical size={19} />
            </button>

            {open && (
              <div
                ref={menuRef}
                role="menu"
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-border-muted bg-surface py-1 shadow-lg"
              >
                {user ? (
                  <>
                    <div className="border-b border-border-muted px-4 py-3">
                      <p className="truncate text-[13px] font-semibold text-navy">{user.name}</p>
                      <p className="truncate text-[11.5px] text-text-faint">{user.roleName}</p>
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
                    <p className="px-4 pt-1 pb-2 text-[11.5px] leading-relaxed text-text-faint">
                      For authorised officials, administrators and accredited bidders. Browsing these
                      records needs no account.
                    </p>

                    {/* Information, not a link. A prospective bidder needs to
                        know where to go — and that where is an office, not a
                        page. There is nothing to click because there is nothing
                        to submit online. */}
                    <div className="border-t border-border-muted px-4 pt-2.5 pb-3">
                      <p className="flex items-center gap-2 text-[12.5px] font-medium text-navy">
                        <FileCheck2 size={14} /> Want to become a bidder?
                      </p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-text-faint">
                        Submit your eligibility requirements in person at the BAC Secretariat office.
                        The BAC determines eligibility and Admin/IT issues your account — there is no
                        online submission or sign-up.
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
