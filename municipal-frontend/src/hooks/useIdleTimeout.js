import { useEffect, useRef, useCallback, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Logs the user out after a period of inactivity.  The timeout is driven by
// `sessionTimeoutMs` that the server sends with the authenticated user — so
// admin-side roles (30 min) and external roles (8 h) each get the right
// countdown without the frontend hard-coding anything.
//
// A warning modal is shown 2 minutes before the deadline.  Any user activity
// (mouse, keyboard, scroll, touch) resets the timer — the point is to catch
// genuinely abandoned sessions, not to interrupt someone mid-task.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']

// Don't reset on every single mousemove — debounce to once per second so we
// aren't thrashing a timer hundreds of times while the user drags something.
const DEBOUNCE_MS = 1000

// How long before expiry the "your session is about to expire" warning appears.
const WARNING_LEAD_MS = 2 * 60 * 1000 // 2 minutes

export default function useIdleTimeout({ timeoutMs, onLogout }) {
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const logoutTimerRef = useRef(null)
  const warningTimerRef = useRef(null)
  const countdownIntervalRef = useRef(null)
  const lastActivityRef = useRef(Date.now())

  const clearTimers = useCallback(() => {
    clearTimeout(logoutTimerRef.current)
    clearTimeout(warningTimerRef.current)
    clearInterval(countdownIntervalRef.current)
  }, [])

  const startTimers = useCallback(() => {
    clearTimers()
    lastActivityRef.current = Date.now()
    setShowWarning(false)

    // Skip idle timeout for long sessions (vendor / observer, 8 h) — the
    // cookie expiry alone is enough, and a countdown running for 8 hours
    // serves nobody.
    if (timeoutMs > 60 * 60 * 1000) return

    // Warning fires 2 minutes before logout (or immediately for very short
    // timeouts — shouldn't happen in practice, but be defensive).
    const warningAt = Math.max(timeoutMs - WARNING_LEAD_MS, 0)

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
      setCountdown(Math.round(WARNING_LEAD_MS / 1000))

      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }, warningAt)

    logoutTimerRef.current = setTimeout(() => {
      clearTimers()
      setShowWarning(false)
      onLogout()
    }, timeoutMs)
  }, [timeoutMs, onLogout, clearTimers])

  // Activity resets the idle timer — but only once per DEBOUNCE_MS.
  const onActivity = useCallback(() => {
    const now = Date.now()
    if (now - lastActivityRef.current < DEBOUNCE_MS) return
    lastActivityRef.current = now
    startTimers()
  }, [startTimers])

  // "Stay signed in" from the warning modal.
  const dismiss = useCallback(() => {
    startTimers()
  }, [startTimers])

  useEffect(() => {
    if (!timeoutMs) return

    startTimers()

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }

    return () => {
      clearTimers()
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
    }
  }, [timeoutMs, onActivity, startTimers, clearTimers])

  return { showWarning, countdown, dismiss }
}
