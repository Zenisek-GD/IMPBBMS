import { useCallback, useEffect, useState } from 'react'
import { Inbox, Mail, MailX, Check } from 'lucide-react'
import * as messagesApi from '../../api/messages'
import { MESSAGE_STATUS_TONES } from '../../api/messages'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

// ── MESSAGES FROM THE PUBLIC ─────────────────────────────────────────────────
// You see the messages routed to a permission you hold, and nothing else. There
// is no inbox administrator who reads everybody's correspondence — the server
// scopes the list per caller, and this screen never asks for more.
//
// Answering happens by email, outside the system, because the sender is not a
// user of it. What is recorded here is that an officer picked the message up and
// what they did about it, which is the part that has to survive them leaving.

const dateTime = (value) => (value ? new Date(value).toLocaleString('en-PH') : '—')

function MessageModal({ message, onClose, onSaved }) {
  const [status, setStatus] = useState(message.status)
  const [notes, setNotes] = useState(message.handlingNotes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await messagesApi.updateMessage(message.id, { status, handlingNotes: notes })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not update that message.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={message.subject} subtitle={message.categoryLabel} size="lg" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[11.5px] tracking-[0.04em] text-text-faint uppercase">From</p>
            <p className="mt-0.5 text-[13.5px] text-navy">{message.senderName ?? 'Anonymous'}</p>
          </div>
          <div>
            <p className="text-[11.5px] tracking-[0.04em] text-text-faint uppercase">Reply to</p>
            {message.senderEmail ? (
              <a
                href={`mailto:${message.senderEmail}?subject=Re: ${encodeURIComponent(message.subject)}`}
                className="mt-0.5 block truncate text-[13.5px] text-info hover:underline"
              >
                {message.senderEmail}
              </a>
            ) : (
              // Said plainly. An officer who assumes they can reply and cannot
              // will waste time looking for an address that was never given.
              <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-text-faint">
                <MailX size={14} /> No address given
              </p>
            )}
          </div>
          <div>
            <p className="text-[11.5px] tracking-[0.04em] text-text-faint uppercase">Received</p>
            <p className="mt-0.5 text-[13.5px] text-navy">{dateTime(message.receivedAt)}</p>
          </div>
        </div>

        {message.referenceHint && (
          <div className="rounded-md border border-border-muted bg-sidebar px-3.5 py-2.5">
            <p className="text-[11.5px] tracking-[0.04em] text-text-faint uppercase">
              Reference given by the sender
            </p>
            <p className="mt-0.5 font-mono text-[13px] text-navy">{message.referenceHint}</p>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[11.5px] tracking-[0.04em] text-text-faint uppercase">Message</p>
          <p className="rounded-md border border-border-muted bg-sidebar px-4 py-3.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-text-secondary">
            {message.body}
          </p>
        </div>

        <div className="border-t border-border-muted pt-5">
          <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">Status</label>
          <div className="flex flex-wrap gap-2">
            {[
              ['new', 'Unread'],
              ['acknowledged', 'Picked up'],
              ['closed', 'Closed'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={`rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  status === key
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-border-muted text-text-secondary hover:text-navy'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="mt-4 mb-1.5 block text-[12.5px] font-medium text-text-secondary">
            What was done about it
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="e.g. Replied by email 7 Aug; the figure was correct — the reader was looking at the ABC, not the contract amount."
            className="w-full resize-y rounded-md border border-border-muted bg-surface px-3.5 py-2.5 text-[13.5px] text-navy focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Check} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function PublicMessages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [reading, setReading] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    messagesApi
      .fetchMessages()
      .then((data) => {
        if (cancelled) return
        setMessages(data)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const unread = messages.filter((message) => message.status === 'new').length

  const table = useTableControls(messages, {
    searchKeys: ['subject', 'body', 'senderName', 'senderEmail', 'referenceHint', 'categoryLabel'],
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: [
          { value: 'new', label: 'Unread' },
          { value: 'acknowledged', label: 'Picked up' },
          { value: 'closed', label: 'Closed' },
        ],
      },
      { key: 'categoryLabel', label: 'All subjects' },
    ],
    initialSort: { key: 'receivedAt', direction: 'desc' },
  })

  return (
    <DashboardPage>
      <PageHeader
        title="Public Messages"
        subtitle="Sent from the transparency portal and routed to this office by subject. You see only what was routed to you."
        actions={unread > 0 && <Badge tone="warning" dot>{`${unread} unread`}</Badge>}
      />

      <Card title="Inbox" icon={Inbox} bodyClassName="">
        {messages.length > 0 && (
          <div className="border-b border-border-muted p-5">
            <TableToolbar {...table.toolbarProps} searchPlaceholder="Search subject, sender or text…" />
          </div>
        )}

        {loading ? (
          <p className="px-5 py-10 text-center text-[13px] text-text-faint">Loading messages…</p>
        ) : table.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'Nothing has been sent to this office yet.'
              : 'No messages match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('subject')}>Subject</SortableTh>
                  <SortableTh {...table.sortProps('categoryLabel')}>About</SortableTh>
                  <SortableTh {...table.sortProps('senderName')}>From</SortableTh>
                  <SortableTh {...table.sortProps('receivedAt')}>Received</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((message) => (
                  <tr
                    key={message.id}
                    className={`border-t border-border-muted ${
                      message.status === 'new' ? 'bg-warning/[0.04]' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <p
                        className={`text-[13.5px] ${
                          message.status === 'new' ? 'font-semibold text-navy' : 'text-navy'
                        }`}
                      >
                        {message.subject}
                      </p>
                      {message.referenceHint && (
                        <p className="mt-0.5 font-mono text-[11.5px] text-text-faint">
                          {message.referenceHint}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-text-secondary">
                      {message.categoryLabel}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-text-secondary">
                      {message.senderName ?? <span className="text-text-faint">Anonymous</span>}
                      {message.senderEmail && (
                        <p className="truncate text-[11.5px] text-text-faint">{message.senderEmail}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] whitespace-nowrap text-text-secondary">
                      {dateTime(message.receivedAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={MESSAGE_STATUS_TONES[message.status]} dot>
                        {message.status === 'new'
                          ? 'Unread'
                          : message.status === 'acknowledged'
                            ? 'Picked up'
                            : 'Closed'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => setReading(message)}
                        className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy uppercase hover:underline"
                      >
                        <Mail size={12} /> Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {table.rows.length > 0 && <Pagination {...table.paginationProps} label="messages" />}
      </Card>

      {reading && (
        <MessageModal message={reading} onClose={() => setReading(null)} onSaved={refresh} />
      )}
    </DashboardPage>
  )
}
