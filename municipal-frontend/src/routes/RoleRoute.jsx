import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { landingRouteForRole } from '../config/roleLanding'

// Frontend half of the access control in design doc Section 2.2. This is a
// navigation guard, not a security boundary — the backend `requireRole`
// middleware is what actually protects data. Both must be kept in step.
export default function RoleRoute({ allow }) {
  const { user } = useAuth()

  if (!allow.includes(user.role)) {
    return <Navigate to={landingRouteForRole(user.role)} replace />
  }

  return <Outlet />
}
