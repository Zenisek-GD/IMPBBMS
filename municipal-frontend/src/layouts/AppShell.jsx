import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import TopNavBar from '../components/layout/TopNavBar'
import { ProfileModal, ChangePasswordModal } from '../components/layout/ProfileModals'
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
  const [showProfile, setShowProfile] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

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
      <TopNavBar
        links={nav.topLinks}
        searchPlaceholder={nav.searchPlaceholder}
        onLogout={logout}
        onOpenProfile={() => setShowProfile(true)}
        onOpenChangePassword={() => setShowChangePassword(true)}
        lguName={lguName}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          brandTitle={nav.brandTitle}
          brandSubtitle={nav.brandSubtitle}
          sections={nav.sections}
          collapsed={collapsed}
          onToggle={toggleSidebar}
        />
        <main className="flex-1 overflow-y-auto bg-canvas">
          <Outlet />
        </main>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  )
}
