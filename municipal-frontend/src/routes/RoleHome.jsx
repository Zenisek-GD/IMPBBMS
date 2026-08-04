import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { landingRouteForRole } from '../config/roleLanding'

// Sits behind ProtectedRoute, so `user` is always set here.
export default function RoleHome() {
  const { user } = useAuth()
  return <Navigate to={landingRouteForRole(user.role)} replace />
}
