import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import TopNavBar from '../components/layout/TopNavBar'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { ROLE_NAV } from '../config/navigation'
import { useAuth } from '../context/useAuth'
import { fetchSettings } from '../api/settings'
import { updatePreferences } from '../api/auth'

// Wraps every authenticated page whose role has a real nav config. Roles
// without one are routed to /coming-soon instead (see roleLanding.js), so
// `nav` should always resolve here — but fall back defensively just in case.
export default function AppShell() {
  const { user, logout } = useAuth()
  const nav = ROLE_NAV[user?.role] ?? ROLE_NAV.departmentRequester

  const [lguName, setLguName] = useState('')
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

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

  // The LGU's own name comes from system settings so the header identifies the
  // deployment rather than hardcoding one municipality.
  useEffect(() => {
    let cancelled = false
    fetchSettings()
      .then((result) => {
        if (!cancelled) setLguName(result.lgu.name)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <TopNavBar searchPlaceholder={nav.searchPlaceholder} lguName={lguName} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          brandTitle={nav.brandTitle}
          brandSubtitle={nav.brandSubtitle}
          sections={nav.sections}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          onLogout={() => setConfirmingLogout(true)}
        />
        <main className="flex-1 overflow-y-auto bg-canvas">
          <Outlet />
        </main>
      </div>

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
    </div>
  )
}
