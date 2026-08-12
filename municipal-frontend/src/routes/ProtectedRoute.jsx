import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />

  // ── Everyone enrols ────────────────────────────────────────────────────────
  // An account that has not set up a second factor is confined to the
  // enrolment screen. The server enforces this independently — see
  // middleware/mfaMiddleware.js — so this redirect is about giving the officer
  // somewhere to go rather than a wall of failed requests. Skipped on the
  // enrolment route itself, or it would redirect to itself forever.
  if (user.mfaEnrollmentRequired && location.pathname !== '/account/two-factor') {
    return <Navigate to="/account/two-factor" replace />
  }

  return <Outlet />
}
