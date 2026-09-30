import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import { ActionQueueContext } from './action-queue-context'
import { apiClient } from '../api/client'
import * as notificationsApi from '../api/notifications'

const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date()))
const initialYear = (userId) => {
  try {
    const saved = sessionStorage.getItem(`workspace.fiscalYear.${userId}`)
    if (saved === 'all') return saved
    if (/^\d{4}$/.test(saved ?? '') && Number(saved) >= 1900) return Number(saved)
  } catch { /* Browser storage is optional. */ }
  return currentYear()
}
const EMPTY = { items: [], total: 0, counts: {}, queues: {}, overdue: 0, urgent: 0 }

export function ActionQueueProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const permissionKey = `${user?.role ?? ''}:${(user?.permissions ?? []).join(',')}`
  const location = useLocation()
  const [selection, setSelection] = useState(() => ({ userId: userId, year: initialYear(userId) }))
  const fiscalYear = selection.userId === userId ? selection.year : initialYear(userId)
  const [snapshot, setSnapshot] = useState(null)
  const [inbox, setInbox] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const refresh = useCallback(() => setAttempt((value) => value + 1), [])
  const setFiscalYear = useCallback((value) => {
    const year = value === 'all' ? 'all' : Number(value)
    if (year !== 'all' && (!Number.isInteger(year) || year < 1900 || year > 9999)) return
    try { sessionStorage.setItem(`workspace.fiscalYear.${userId}`, String(year)) } catch { /* optional */ }
    setSelection({ userId: userId, year })
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined
    const controller = new AbortController()
    // All three surfaces receive this single snapshot. Reading an update does
    // not remove an outstanding approval or other unfinished workflow task.
    apiClient.get('/my-work', { params: { fiscalYear, limit: 1000 }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        if (!Array.isArray(data?.items) || !data?.counts || !Number.isFinite(data?.total)) throw new Error('Invalid action queue response')
        setSnapshot({ userId, permissionKey, fiscalYear, data, error: '' })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSnapshot({ userId, permissionKey, fiscalYear, data: EMPTY, error: error.response?.data?.message || 'Your action list could not be refreshed.' })
      })
    apiClient.get('/notifications', { params: { limit: 30 }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setInbox({ userId: userId, ...data }) })
      .catch(() => { /* Tasks remain usable if historical updates fail. */ })
    return () => controller.abort()
  }, [userId, permissionKey, fiscalYear, attempt, location.pathname])

  useEffect(() => {
    let debounce
    const schedule = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 200) }
    const wake = () => { if (document.visibilityState !== 'hidden') schedule() }
    const timer = setInterval(wake, 30_000)
    window.addEventListener('procurement:changed', schedule)
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      clearTimeout(debounce)
      clearInterval(timer)
      window.removeEventListener('procurement:changed', schedule)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [refresh])

  const active = snapshot?.userId === userId && snapshot?.fiscalYear === fiscalYear && snapshot?.permissionKey === permissionKey
  const data = active ? snapshot.data : EMPTY
  const markRead = async (id) => { await notificationsApi.markRead(id); refresh() }
  const markAllRead = async () => { await notificationsApi.markAllRead(); refresh() }
  return <ActionQueueContext.Provider value={{
    ...data, fiscalYear, setFiscalYear, refresh, loading: !active, error: active ? snapshot.error : '',
    notifications: inbox?.userId === userId ? inbox.notifications ?? [] : [],
    unreadCount: inbox?.userId === userId ? inbox.unreadCount ?? 0 : 0, markRead, markAllRead,
  }}>{children}</ActionQueueContext.Provider>
}
