import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { landingRouteForRole } from '../config/roleLanding'
import { canReadRecordPage } from '../config/recordAccess'

// Frontend half of the access control in design doc Section 2.2. This is a
// navigation guard, not a security boundary — the backend `requireRole`
// middleware is what actually protects data. Both must be kept in step.
export default function RoleRoute({ allow = [], permission }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const recordAccess = canReadRecordPage(pathname, user.permissions)
  const allowed = recordAccess ?? (allow.includes(user.role) || Boolean(permission && user.permissions?.includes(permission)))

  if (!allowed) {
    return <Navigate to={landingRouteForRole(user.role)} replace />
  }

  return <Outlet />
}
