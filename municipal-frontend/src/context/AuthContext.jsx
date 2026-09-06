import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { advanceAuthEpoch } from '../api/client'
import * as authApi from '../api/auth'
import { AuthContext } from './auth-context'

const EXPIRED_MESSAGE = 'Your session has expired after 30 minutes. Please log in again.'

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState('')
  const current = useRef(null)
  const generation = useRef(0)
  const logoutPending = useRef(null)
  const navigate = useNavigate()

  const setUser = useCallback((value) => {
    const next = typeof value === 'function' ? value(current.current) : value
    if (next?.sessionDeadline) {
      try { sessionStorage.setItem('auth.lastDeadline', String(next.sessionDeadline)) } catch { /* storage unavailable */ }
    }
    current.current = next
    setUserState(next)
  }, [])

  const clearSession = useCallback((message = '', broadcast = false) => {
    generation.current += 1
    advanceAuthEpoch()
    setUser(null)
    setAuthNotice(message)
    if (broadcast) {
      try { localStorage.setItem('auth.signedOut', JSON.stringify({ at: Date.now(), message })) } catch { /* storage unavailable */ }
    }
    navigate('/login', { replace: true })
  }, [navigate, setUser])

  const expireSession = useCallback(() => {
    if (!current.current) return
    clearSession(EXPIRED_MESSAGE, true)
    // Ask the server to observe expiration. Its fixed deadline is authoritative;
    // a client clock or countdown never controls server validity.
    authApi.fetchCurrentUser().catch(() => {})
  }, [clearSession])

  useEffect(() => {
    let cancelled = false
    const version = generation.current
    authApi.fetchCurrentUser()
      .then((result) => {
        if (!cancelled && version === generation.current) setUser(result)
      })
      .catch((error) => {
        if (cancelled || version !== generation.current || error.response?.status !== 401) return
        let lastDeadline = 0
        try { lastDeadline = Number(sessionStorage.getItem('auth.lastDeadline')) } catch { /* storage unavailable */ }
        if (lastDeadline && Date.now() >= lastDeadline) setAuthNotice(EXPIRED_MESSAGE)
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [setUser])

  useEffect(() => {
    const unauthorized = (event) => {
      if (!current.current && event.detail?.code !== 'SESSION_EXPIRED') return
      const expired = event.detail?.code === 'SESSION_EXPIRED' ||
        (current.current && Date.now() >= current.current.sessionDeadline)
      clearSession(expired ? EXPIRED_MESSAGE : (event.detail?.message || 'Please log in again.'))
    }
    const enrollmentRequired = () => {
      if (current.current) setUser((previous) => ({ ...previous, mfaEnrollmentRequired: true }))
      navigate('/account/two-factor', { replace: true })
    }
    const signedOut = (event) => {
      if (event.key !== 'auth.signedOut' || !current.current) return
      let message = ''
      try { message = JSON.parse(event.newValue)?.message || '' } catch { /* malformed local notice */ }
      clearSession(message)
    }
    window.addEventListener('auth:unauthorized', unauthorized)
    window.addEventListener('auth:enrollment-required', enrollmentRequired)
    window.addEventListener('storage', signedOut)
    return () => {
      window.removeEventListener('auth:unauthorized', unauthorized)
      window.removeEventListener('auth:enrollment-required', enrollmentRequired)
      window.removeEventListener('storage', signedOut)
    }
  }, [clearSession, navigate, setUser])

  useEffect(() => {
    if (!user) return
    let checking = false
    let cancelled = false
    const version = generation.current
    const checkDeadline = () => {
      const active = current.current
      if (active && (Date.now() >= active.sessionDeadline ||
        performance.now() >= active.sessionMonotonicDeadline)) expireSession()
    }
    const revalidate = async () => {
      checkDeadline()
      if (!current.current || checking) return
      checking = true
      try {
        const result = await authApi.fetchCurrentUser()
        if (!cancelled && version === generation.current && current.current) setUser(result)
      } catch { /* the interceptor handles invalid sessions; offline time still counts */ }
      finally { checking = false }
    }
    const wake = () => { if (document.visibilityState !== 'hidden') revalidate() }
    // Fast local redirect plus independent server checks, also on resume.
    const timer = setInterval(checkDeadline, 250)
    const heartbeat = setInterval(revalidate, 5_000)
    window.addEventListener('focus', wake)
    window.addEventListener('pageshow', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      cancelled = true
      clearInterval(timer)
      clearInterval(heartbeat)
      window.removeEventListener('focus', wake)
      window.removeEventListener('pageshow', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [user?.loginSessionExpiresAt, Boolean(user), expireSession, setUser]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Hide protected DOM before a back/forward-cache snapshot, then revalidate
    // before displaying it again after restoration.
    const hide = () => { if (current.current) document.documentElement.style.visibility = 'hidden' }
    const restore = async (event) => {
      if (event.persisted) {
        const version = generation.current
        try {
          const result = await authApi.fetchCurrentUser()
          if (version === generation.current) setUser(result)
        } catch { setUser(null) }
      }
      document.documentElement.style.visibility = ''
    }
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', restore)
    return () => {
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', restore)
      document.documentElement.style.visibility = ''
    }
  }, [setUser])

  const login = useCallback(async (email, password) => {
    await logoutPending.current?.catch(() => {})
    generation.current += 1
    advanceAuthEpoch()
    setAuthNotice('')
    setUser(null)
    const result = await authApi.login(email, password)
    if (!result?.mfaRequired) setUser(result)
    return result
  }, [setUser])

  const logout = useCallback(async () => {
    // Clear protected views immediately; server-side revocation is still required.
    try { sessionStorage.removeItem('auth.lastDeadline') } catch { /* storage unavailable */ }
    clearSession('', true)
    const request = authApi.logout()
    logoutPending.current = request
    try { await request; return true }
    catch {
      setAuthNotice('You were signed out of this browser, but the server could not be reached to end the session.')
      return false
    } finally { logoutPending.current = null }
  }, [clearSession])

  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, authNotice, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
