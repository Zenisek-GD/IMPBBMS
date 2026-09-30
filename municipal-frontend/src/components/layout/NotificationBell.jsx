import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useActionQueue } from '../../context/useActionQueue'
import WorkspaceFiscalYear from '../ui/WorkspaceFiscalYear'
import Button from '../ui/Button'

export default function NotificationBell() {
  const navigate = useNavigate()
  const queue = useActionQueue()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('actions')
  const [noticeError, setNoticeError] = useState('')
  const containerRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const outside = (event) => { if (!containerRef.current?.contains(event.target)) setOpen(false) }
    const escape = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const go = (href) => { setOpen(false); if (href) navigate(href) }
  const read = async (id) => {
    try { setNoticeError(''); await (id ? queue.markRead(id) : queue.markAllRead()) }
    catch { setNoticeError('The update could not be marked as read. Please retry.') }
  }
  return <div className="relative" ref={containerRef}>
    <button type="button" onClick={() => { setOpen((value) => !value); if (!open) queue.refresh() }}
      aria-label={`Notifications (${queue.total} items waiting for your action${queue.unreadCount ? `, ${queue.unreadCount} unread updates` : ''})`}
      aria-expanded={open} aria-controls="workspace-notifications"
      className="relative flex h-11 w-11 items-center justify-center rounded-md text-topnav-link transition-colors hover:bg-white/10 hover:text-topnav-link-alt md:h-9 md:w-9">
      <Bell size={19} />
      {queue.total > 0 && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{queue.total > 99 ? '99+' : queue.total}</span>}
      {queue.total === 0 && queue.unreadCount > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />}
    </button>
    {open && <div id="workspace-notifications" className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border-muted bg-surface shadow-xl">
      <header className="border-b border-border-muted bg-sidebar px-4 py-3">
        <div className="mb-3 flex gap-3 text-[13px] font-semibold">
          <button type="button" className={tab === 'actions' ? 'text-navy underline' : 'text-text-secondary'} onClick={() => setTab('actions')}>Waiting for your action ({queue.total})</button>
          <button type="button" className={tab === 'updates' ? 'text-navy underline' : 'text-text-secondary'} onClick={() => setTab('updates')}>Updates ({queue.unreadCount})</button>
        </div>
        {tab === 'actions' ? <WorkspaceFiscalYear /> : <p className="text-xs text-text-faint">Recent updates across all years. Reading an update does not complete its task.</p>}
      </header>
      <div className="max-h-[min(26rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain">
        {tab === 'actions' ? <>
          {queue.error && <p role="alert" className="p-4 text-sm text-danger">{queue.error}</p>}
          {queue.loading ? <p className="p-4 text-sm text-text-faint">Loading your actions...</p> : !queue.error && queue.total === 0 ? <p className="p-4 text-sm text-text-faint">No items waiting for your action in this year scope.</p> : null}
          {queue.items.map((item) => <button key={item.id} type="button" onClick={() => go(item.href)} className="block w-full border-b border-border-muted px-4 py-3 text-left last:border-0 hover:bg-sidebar">
            <span className="block text-[13px] font-semibold text-navy">{item.title}</span>
            <span className="block text-xs text-text-secondary">{item.action}</span>
            <span className="mt-1 block text-[11px] text-text-faint">{item.responsibleRole}{item.fiscalYear ? ` · FY ${item.fiscalYear}` : ' · Not year-specific'}</span>
            {item.urgency !== 'normal' && <span className={`mt-1 block text-xs font-semibold ${item.urgency === 'overdue' ? 'text-danger' : 'text-warning'}`}>{item.urgency === 'overdue' ? 'Overdue' : 'Due soon'}</span>}
          </button>)}
          {queue.total > queue.items.length && <p className="p-3 text-xs text-text-faint">Showing the first {queue.items.length} items. Open the related sections for the remaining work.</p>}
        </> : <>
          {noticeError && <p role="alert" className="p-3 text-xs text-danger">{noticeError}</p>}
          {queue.unreadCount > 0 && <div className="p-2"><Button variant="ghost" size="table" icon={CheckCheck} onClick={() => read()}>Mark updates read</Button></div>}
          {!queue.notifications.length && <p className="p-4 text-sm text-text-faint">No updates yet.</p>}
          {queue.notifications.map((notice) => <button type="button" key={notice.id} onClick={() => { if (!notice.readAt) read(notice.id); go(notice.link) }} className={`block w-full border-b border-border-muted px-4 py-3 text-left hover:bg-sidebar ${notice.readAt ? 'opacity-60' : ''}`}>
            <span className="block text-[13px] font-semibold text-navy">{notice.title}</span>
            <span className="block text-xs text-text-secondary">{notice.body}</span>
          </button>)}
        </>}
      </div>
    </div>}
  </div>
}
