import { useEffect, useState, useCallback } from 'react'
import * as authApi from '../api/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    authApi
      .fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const loggedInUser = await authApi.login(email, password)
    // A password-only response is NOT a session. The server has recorded a
    // short-lived pending state and nothing else, so the user must not be
    // stored — doing so would make the app behave as though the second factor
    // had already been given.
    if (loggedInUser?.mfaRequired) return loggedInUser
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  // ── SIGNING OUT MUST NOT DEPEND ON THE SERVER ─────────────────────────────
  // This used to be `await authApi.logout(); setUser(null)`. If the request
  // failed — backend restarting, database down, network blip — the await threw,
  // `setUser(null)` never ran, and the officer was left signed in with the
  // confirmation dialog open and nothing on screen explaining why. It read as
  // "log out doesn't work", because from the outside that is exactly what it is.
  //
  // The local session is cleared either way now. Ending the *server* session is
  // best-effort: it is the right thing to ask for, but a browser that cannot
  // reach the server must still be able to lock itself.
  //
  // Returns whether the server confirmed, so the caller can say so. Note the
  // honest limit: if the call failed, the session cookie is httpOnly and cannot
  // be cleared from JavaScript, so the server session may outlive this — which
  // is why the caller warns rather than pretending it is done.
  const logout = useCallback(async () => {
    let serverConfirmed = false
    try {
      await authApi.logout()
      serverConfirmed = true
    } catch {
      // Best effort — the local session is cleared below regardless.
    }
    setUser(null)
    return serverConfirmed
  }, [])

  // Exposed so a screen that changes something the shell displays — the display
  // name, via the profile modal — can update it without a full reload. Named
  // `setUser` rather than something like `refresh` because it takes the serialised
  // user the API already returned; there is no second round trip to make.
  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
