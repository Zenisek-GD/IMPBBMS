import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { MoreVertical, Menu, X, ArrowLeft, LogIn, LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { landingRouteForRole } from '../../config/roleLanding'
import ThemeToggle from '../ui/ThemeToggle'
import BrandMark from '../brand/BrandMark'

// ── Header for the public portal ─────────────────────────────────────────────
// The landing page carries its navigation as one floating glass rail: masthead
// left, sections at the true centre (desktop), and theme + menu controls on the
// right. Project records retain the conventional full-width header because a
// reader needs the back path and record context to stay visually stable there.
//
// Mobile uses a burger that opens a sidebar drawer (sections + sign-in at the
// bottom). Desktop keeps the centred pill plus a three-dot menu for account
// items. Detail pages show a back button before the masthead on all sizes.
const SECTIONS = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'projects', label: 'Projects', to: '/?view=projects' },
  { key: 'announcements', label: 'Announcements', to: '/?view=announcements' },
  { key: 'officials', label: 'Officials', to: '/?view=officials' },
  { key: 'about', label: 'About', to: '/?view=about' },
]
const LANDING_DRAWER_SECTIONS = [
  ...SECTIONS,
  { key: 'faq', label: 'FAQs', to: '/?view=home#landing-faq' },
]
// Contact is no longer a section of its own: writing to the municipality is
// something a reader decides to do *after* reading what the portal is and who
// runs it, so the form now sits at the foot of About rather than competing with
// it in the nav. `?view=contact` still resolves — it redirects into About.

export default function PublicHeader({ systemName }) {
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
  const activeDrawerSection = location.hash === '#landing-faq' ? 'faq' : activeSection
  const drawerSections = onLanding ? LANDING_DRAWER_SECTIONS : SECTIONS
  const showBack = !onLanding
  const headerClassName = onLanding
    ? 'sticky top-3 z-30 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-4xl rounded-full bg-surface/75 shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[background-color,box-shadow] supports-[backdrop-filter]:bg-surface/65 dark:shadow-[0_14px_34px_rgba(0,0,0,0.28)] sm:w-[calc(100%-3rem)]'
    : 'sticky top-0 z-30 border-b border-border-muted bg-surface md:bg-surface/95 md:backdrop-blur-md md:supports-[backdrop-filter]:bg-surface/80'
  const headerInnerClass = onLanding
    ? 'mx-auto grid min-h-[50px] max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 md:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-4'
    : 'mx-auto grid min-h-[58px] max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 md:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-8'
  const desktopNavClass = onLanding
    ? 'col-start-2 hidden items-center gap-0.5 md:flex'
    : 'glass col-start-2 hidden items-center gap-0.5 rounded-full border border-border-muted/80 p-1 shadow-sm md:flex'

  // The drawer/dropdown closes via link onClick, overlay click and Escape —
  // no route-change effect, so no cascading render.

  // Desktop-only outside-close for the three-dot dropdown. The mobile drawer
  // has its own overlay click-to-close.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event) => {
      if (window.matchMedia('(max-width: 767px)').matches) return
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

  // One state controls two different menus. Close it whenever the breakpoint
  // changes so a portrait drawer cannot survive rotation as a hidden scroll
  // lock, and a desktop dropdown cannot turn into an unlocked mobile drawer.
  useEffect(() => {
    const breakpoint = window.matchMedia('(min-width: 768px)')
    const closeOnBreakpointChange = () => setOpen(false)
    breakpoint.addEventListener('change', closeOnBreakpointChange)
    return () => breakpoint.removeEventListener('change', closeOnBreakpointChange)
  }, [])

  // Lock body scroll only while the mobile drawer is actually showing — never
  // for the desktop dropdown.
  useEffect(() => {
    if (!open) return
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const handleSignOut = async () => {
    setOpen(false)
    await logout()
    navigate('/', { replace: true })
  }

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/', { replace: true })
  }

  // Query-string navigation keeps this route mounted, so browsers preserve the
  // previous scroll position by default. Reset it before closing the mobile
  // drawer so every section opens at its own beginning instead of at the
  // footer position the visitor left behind. Hash links still land on their
  // target once the new section has rendered.
  const handleDrawerNavigation = () => {
    setOpen(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  const itemClass =
    'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-navy transition-colors hover:bg-sidebar hover:text-navy'

  return (
    <>
    <header className={headerClassName}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-accent-fg"
      >
        Skip to content
      </a>
      {/* Three columns, not `justify-between`. Space-between positions the nav by
          the content widths either side of it, and the masthead is much wider
          than the controls on the right — so the pill landed well right of
          centre. `1fr auto 1fr` gives the outer columns equal width whatever
          they hold, which puts the nav on the header's true midpoint.

          Each child is pinned to its own column. Below `md` the nav is hidden,
          which takes it out of grid flow, and auto-placement then slid the
          right-hand controls into column 2 — stranding them mid-header. Explicit
          placement leaves column 2 empty instead. */}
      <div className={headerInnerClass}>
        <div className="col-start-1 flex min-w-0 items-center gap-1.5">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-navy transition-colors hover:bg-navy-tint hover:text-navy focus:ring-2 focus:ring-accent/40 focus:outline-none md:h-9 md:w-9"
            >
              <ArrowLeft size={19} />
            </button>
          )}
          <Link to="/" className="flex min-h-11 min-w-0 items-center md:min-h-0">
            <BrandMark
              priority
              className={`mr-2.5 -translate-y-px ${onLanding ? 'size-8 sm:size-9' : 'size-9 sm:size-10'}`}
              alt=""
            />
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold tracking-[-0.015em] text-navy">
                {systemName || 'ProcureNance'}
              </p>
            </div>
          </Link>
        </div>

        {/* ── Desktop section pill ───────────────────────────────────────────
            Centred on the header's true midpoint. Hidden on mobile — the burger
            drawer carries the sections there instead. */}
        <nav className={desktopNavClass} aria-label="Portal sections">
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
                    : 'text-navy hover:bg-navy-tint hover:text-navy'
                }`}
              >
                {section.label}
              </Link>
            )
          })}
        </nav>

        {/* A citizen reading at night is still a citizen. The toggle sits on the
            public page too, and their choice is remembered in this browser —
            there is no account to hang it on. Sign-in lives in the menu (desktop)
            / drawer (mobile) only. */}
        <div className="col-start-2 flex shrink-0 items-center justify-end gap-1 md:col-start-3">
          <ThemeToggle />

          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="flex h-11 w-11 items-center justify-center rounded-full text-navy transition-colors hover:bg-navy-tint hover:text-navy focus:ring-2 focus:ring-accent/40 focus:outline-none md:h-9 md:w-9"
            >
              <span className="md:hidden">{open ? <X size={20} /> : <Menu size={20} />}</span>
              <span className="hidden md:block">
                <MoreVertical size={19} />
              </span>
            </button>

            {/* Desktop dropdown — three-dot menu. Sections live in the pill, so
                this keeps account items + bidder info only. */}
            {open && (
              <div
                ref={menuRef}
                role="menu"
                className="absolute right-0 mt-2 hidden w-56 overflow-hidden rounded-2xl bg-surface/90 p-1.5 shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:shadow-[0_14px_34px_rgba(0,0,0,0.32)] md:block"
              >
                {user ? (
                  <>
                    <div className="border-b border-border-muted px-4 py-3">
                      <p className="truncate text-[13px] font-semibold text-navy">{user.name}</p>
                      <p className="truncate text-[11.5px] text-navy">{user.roleName}</p>
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
                      <LogIn size={15} /> Log in
                    </Link>
                    <p className="px-3 pt-1 pb-2 text-[11.5px] leading-relaxed text-navy">
                      For authorised officials, administrators and accredited bidders. Browsing these
                      records needs no account.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </header>

      {/* ── Mobile sidebar drawer ────────────────────────────────────────────
          Rendered OUTSIDE <header> on purpose: the header carries
          `backdrop-blur`, which creates a containing block for `fixed`
          descendants and clips the drawer to the bar. As a sibling the drawer
          covers the real viewport. */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Site menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/35 backdrop-blur-[2px]"
          />
          <aside className="absolute top-2 right-2 bottom-2 flex h-auto max-h-[calc(100dvh-1rem)] w-[min(20rem,calc(100vw-1rem))] max-w-none flex-col rounded-3xl bg-surface/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_18px_44px_rgba(15,23,42,0.24)] backdrop-blur-xl dark:shadow-[0_18px_44px_rgba(0,0,0,0.42)] [padding-top:env(safe-area-inset-top)]">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandMark className="size-7" alt="" />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-navy">{systemName || 'ProcureNance'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-full text-navy hover:bg-navy-tint hover:text-navy focus:ring-2 focus:ring-accent/40 focus:outline-none"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Portal sections">
              {drawerSections.map((section) => {
                const active = activeDrawerSection === section.key
                return (
                  <Link
                    key={section.key}
                    to={section.to}
                    aria-current={active ? 'page' : undefined}
                    onClick={handleDrawerNavigation}
                    className={`flex min-h-11 items-center rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                      active ? 'bg-accent text-accent-fg' : 'text-navy hover:bg-sidebar hover:text-navy'
                    }`}
                  >
                    {section.label}
                  </Link>
                )
              })}
            </nav>

            <div className="mx-3 border-t border-border-muted pt-3">
              {user ? (
                <>
                  <div className="px-2 pt-1 pb-2">
                    <p className="truncate text-[13px] font-semibold text-navy">{user.name}</p>
                    <p className="truncate text-[11.5px] text-navy">{user.roleName}</p>
                  </div>
                  <Link
                    to={landingRouteForRole(user.role)}
                    onClick={handleDrawerNavigation}
                    className="flex min-h-11 items-center gap-2.5 rounded-xl bg-accent px-3 py-2.5 text-[14px] font-medium text-accent-fg"
                  >
                    <LayoutDashboard size={16} /> Go to my dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-1.5 flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] text-navy hover:bg-sidebar hover:text-navy"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={handleDrawerNavigation}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-[14px] font-medium text-accent-fg"
                  >
                    <LogIn size={16} /> Log in
                  </Link>
                  <p className="px-1 pt-2 text-[11.5px] leading-relaxed text-navy">
                    For officials and accredited bidders. Records need no account.
                  </p>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
