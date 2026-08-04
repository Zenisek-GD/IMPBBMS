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
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
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
