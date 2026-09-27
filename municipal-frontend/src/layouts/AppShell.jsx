import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { LogOut, ShieldCheck, FileText } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import TopNavBar from '../components/layout/TopNavBar'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { ROLE_NAV, applyShortcutOverrides } from '../config/navigation'
import { useAuth } from '../context/useAuth'
import { fetchSettings, fetchNavShortcuts } from '../api/settings'
import { updatePreferences } from '../api/auth'
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts'
import { fetchPendingCounts } from '../api/reports'

// Wraps every authenticated page whose role has a real nav config. Roles
// without one are routed to /coming-soon instead (see roleLanding.js), so
// `nav` should always resolve here — but fall back defensively just in case.
export default function AppShell() {
  const { user, logout, sessionWarning, continueSession, dismissSessionWarning } = useAuth()
  const location = useLocation()
  const [mobileNavLocation, setMobileNavLocation] = useState(null)
  const mobileNavOpen = mobileNavLocation === location.key
  const mobileNavigationRef = useRef(null)
  const nav = ROLE_NAV[user?.role] ?? ROLE_NAV.departmentRequester
  const canManageTwoFactor = user?.role === 'systemAdministrator' || user?.permissions?.includes('manage_two_factor_authentication')

  const [lguName, setLguName] = useState('')
  const [systemName, setSystemName] = useState('')
  const [shortcutOverrides, setShortcutOverrides] = useState(null)
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [checkingSession, setCheckingSession] = useState(false)
  const [pending, setPending] = useState({ userId: null, counts: {} })
  const canViewReports = user?.permissions?.some((permission) => ['app.view', 'app.viewPublished', 'bidding.view', 'bidding.evaluate', 'bidding.technicalInput', 'contract.view', 'contract.viewPublished', 'delivery.submitInvoice', 'audit.viewAll', 'audit.viewLogs'].includes(permission))

  // A mobile navigation drawer cannot stay open after its desktop rail becomes
  // visible: rotation would otherwise leave the desktop UI covered with no
  // mobile trigger available to dismiss it.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileNavLocation(null)
    }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  // Navigation is a drawer on a phone, but it still needs the protections of
  // a dialog: focus enters it, stays inside it, returns to the menu trigger on
  // close, Escape dismisses it, and the page does not scroll behind it.
  useEffect(() => {
    if (!mobileNavOpen) return undefined

    const drawer = mobileNavigationRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const closeNavigation = () => setMobileNavLocation(null)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeNavigation()
        return
      }
      if (event.key !== 'Tab') return

      const controls = [...(drawer?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])]
        .filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (!first) {
        event.preventDefault()
        return
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    drawer?.focus()
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [mobileNavOpen])

  // Merge admin-set shortcut overrides onto the static nav config for this role.
  // If no overrides have been fetched yet, the static defaults are used.
  const effectiveSections = useMemo(() => {
    const roleKey = user?.role ?? 'departmentRequester'
    const overrides = shortcutOverrides?.[roleKey]
    let sections = applyShortcutOverrides(nav.sections, overrides)
    if (canViewReports) sections = [...sections, { heading: 'Reports', items: [{ label: 'Reports', href: '/reports', icon: FileText }] }]
    // A failed or incomplete queue response must not take down every protected
    // screen. The request effect treats it as an empty count set as well.
    const counts = pending.userId === user?.id && pending.counts && typeof pending.counts === 'object'
      ? pending.counts : {}
    sections = sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, pendingCount: counts[item.href] || 0 })) }))
    if (!canManageTwoFactor || sections.some((section) => section.items.some((item) => item.href === '/admin/security-settings'))) return sections
    return [...sections, { heading: 'Security', items: [
      { label: 'Security Settings', href: '/admin/security-settings', icon: ShieldCheck },
    ] }]
  }, [nav.sections, shortcutOverrides, user?.role, user?.id, canManageTwoFactor, canViewReports, pending])

  // Successful writes refresh queues across all workflow screens. Polling and
  // focus refresh also pick up work completed by other municipal officers.
  useEffect(() => {
    let disposed = false
    let request
    let debounce
    const refresh = async () => {
      request?.abort()
      request = new AbortController()
      const active = request
      try {
        const result = await fetchPendingCounts(active.signal)
        if (!disposed && !active.signal.aborted) setPending({ userId: user?.id, counts: result.counts })
      } catch {
        if (!disposed && !active.signal.aborted) setPending({ userId: user?.id, counts: {} })
      }
    }
    const schedule = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 200) }
    const focus = () => { if (document.visibilityState === 'visible') schedule() }
    refresh()
    const timer = setInterval(focus, 30000)
    window.addEventListener('procurement:changed', schedule)
    window.addEventListener('focus', focus)
    return () => { disposed = true; request?.abort(); clearTimeout(debounce); clearInterval(timer); window.removeEventListener('procurement:changed', schedule); window.removeEventListener('focus', focus) }
  }, [user?.id, user?.role, location.pathname])

  // Bind Alt+<key> shortcuts for every sidebar destination in this role.
  useKeyboardShortcuts(effectiveSections)

  // `logout` clears the local session whether or not the server answers, so this
  // always ends with the shell unmounting — which is the behaviour that was
  // missing. If the server could not be reached the session cookie is httpOnly
  // and cannot be cleared here, so the sign-in screen is told to say so rather
  // than let the officer believe the session was ended everywhere.
  const signOut = useCallback(async () => {
    setSigningOut(true)
    const serverConfirmed = await logout()
    if (!serverConfirmed) {
      try {
        sessionStorage.setItem('logout.serverUnreachable', '1')
      } catch {
        // Private-mode browsers refuse sessionStorage; the sign-out itself has
        // already happened, so losing the notice is not worth failing over.
      }
    }
  }, [logout])

  const confirmActiveSession = useCallback(async () => {
    setCheckingSession(true)
    try { await continueSession() }
    finally { setCheckingSession(false) }
  }, [continueSession])

  // Seeded from the account, so the rail opens the way this user last left it
  // — on whatever machine they sign in from.
  //
  // Derived rather than synced: the override carries whose choice it was, so
  // signing in as someone else falls back to *their* saved state instead of
  // inheriting the previous session's. Copying the account value into state
  // from an effect would render the wrong width first and then correct it.
  const [override, setOverride] = useState(null)
  const collapsed = override?.userId === user?.id ? override.value : Boolean(user?.sidebarCollapsed)

  const toggleSidebar = useCallback(() => {
    const next = !collapsed
    setOverride({ userId: user?.id, value: next })
    // Fire-and-forget: the rail has already moved, and a failed write only
    // costs the preference at the next sign-in.
    updatePreferences({ sidebarCollapsed: next }).catch(() => {})
  }, [collapsed, user?.id])

  // The LGU's own name and system branding come from system settings so the
  // header identifies the deployment rather than hardcoding one municipality.
  useEffect(() => {
    let cancelled = false
    fetchSettings()
      .then((result) => {
        if (cancelled) return
        setLguName(result.lgu.name)
        if (result.branding) {
          setSystemName(result.branding.systemName)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch admin-customised keyboard shortcuts (separate from settings so the
  // shape is a clean role → overrides map).
  useEffect(() => {
    let cancelled = false
    fetchNavShortcuts()
      .then((result) => {
        if (!cancelled) setShortcutOverrides(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-[100svh] h-[100dvh] flex-col bg-canvas">
      <TopNavBar
        sections={effectiveSections}
        lguName={lguName}
        systemName={systemName}
        navigationOpen={mobileNavOpen}
        onOpenNavigation={() => setMobileNavLocation(location.key)}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden h-full md:block">
        <Sidebar
          brandTitle={nav.brandTitle}
          brandSubtitle={nav.brandSubtitle}
          sections={effectiveSections}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          onLogout={() => setConfirmingLogout(true)}
        />
        </div>
        <main className="min-w-0 flex-1 overflow-y-auto bg-canvas">
          <Outlet />
        </main>
      </div>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onMouseDown={() => setMobileNavLocation(null)}
          />
          <div
            ref={mobileNavigationRef}
            id="mobile-navigation-drawer"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex h-full w-[min(20rem,calc(100vw-3rem))] outline-none shadow-xl"
          >
            <Sidebar
              brandTitle={nav.brandTitle}
              brandSubtitle={nav.brandSubtitle}
              sections={effectiveSections}
              collapsed={false}
              navigationMode="mobile"
              onClose={() => setMobileNavLocation(null)}
              onNavigate={() => setMobileNavLocation(null)}
              onLogout={() => { setMobileNavLocation(null); setConfirmingLogout(true) }}
            />
          </div>
        </div>
      )}

      {/* Signing out used to happen on the first click, which in a system where
          half the screens hold half-finished work is a keystroke away from
          losing it. */}
      {confirmingLogout && (
        <Modal
          title="Sign out"
          size="sm"
          // Not dismissable mid-request: closing the dialog while the call is in
          // flight would leave the officer looking at a signed-in shell that is
          // about to sign itself out from under them.
          onClose={() => !signingOut && setConfirmingLogout(false)}
        >
          <div className="flex flex-col gap-4">
            <p className="text-[13px] leading-relaxed text-text-secondary">
              You will be signed out of this session. Anything you have typed but not saved will be
              lost.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={signingOut}
                onClick={() => setConfirmingLogout(false)}
              >
                Stay signed in
              </Button>
              <Button variant="danger" icon={LogOut} disabled={signingOut} onClick={signOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {sessionWarning && !confirmingLogout && (
        <Modal
          title="Session ending soon"
          size="sm"
          onClose={dismissSessionWarning}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-text-secondary">
              For your security, this session ends after {user?.sessionDurationMinutes ?? 30} minutes. Save any unfinished work now.
              Continuing checks the server session but cannot extend its issued deadline.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={checkingSession} onClick={() => setConfirmingLogout(true)}>
                Sign out now
              </Button>
              <Button disabled={checkingSession} onClick={confirmActiveSession}>
                {checkingSession ? 'Checking session…' : 'Continue working'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  )
}
