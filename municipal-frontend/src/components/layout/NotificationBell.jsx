import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import * as notificationsApi from '../../api/notifications'

const SEVERITY_DOT = {
  info: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

// How often the inbox re-checks. Design doc Section 7.4 asks for in-system
// delivery; polling keeps that simple and dependency-free. Swap for websockets
// or SSE if the refresh ever needs to be instant.
const POLL_INTERVAL_MS = 30000

const relativeTime = (iso) => {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ unreadCount: 0, notifications: [] })
  const [refreshToken, setRefreshToken] = useState(0)
  const containerRef = useRef(null)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    notificationsApi
      .fetchNotifications({ limit: 20 })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  useEffect(() => {
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const openNotification = async (notification) => {
    setOpen(false)
    if (!notification.readAt) {
      await notificationsApi.markRead(notification.id).catch(() => {})
      refresh()
    }
    if (notification.link) navigate(notification.link)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value)
          if (!open) refresh()
        }}
        aria-label={`Notifications${data.unreadCount ? ` (${data.unreadCount} unread)` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative text-white/80 hover:text-white"
      >
        <Bell size={20} />
        {data.unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {data.unreadCount > 9 ? '9+' : data.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border-muted bg-surface shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-border-muted bg-sidebar px-4 py-3">
            <span className="text-[13px] font-semibold text-navy">
              Notifications {data.unreadCount > 0 && `(${data.unreadCount})`}
            </span>
            {data.unreadCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await notificationsApi.markAllRead().catch(() => {})
                  refresh()
                }}
                className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
              >
                <CheckCheck size={12} /> MARK ALL READ
              </button>
            )}
          </header>

          <div className="max-h-96 overflow-y-auto">
            {data.notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-faint">Nothing yet.</p>
            ) : (
              data.notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  onClick={() => openNotification(notification)}
                  className={`flex w-full items-start gap-3 border-b border-border-muted px-4 py-3 text-left last:border-0 hover:bg-sidebar ${
                    notification.readAt ? 'opacity-60' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${SEVERITY_DOT[notification.severity]}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-navy">{notification.title}</span>
                    {notification.body && (
                      <span className="mt-0.5 block text-xs text-text-secondary">{notification.body}</span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-text-faint">
                      {relativeTime(notification.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
