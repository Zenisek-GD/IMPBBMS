import { useEffect, useState, useCallback } from 'react'
import { CalendarClock, Plus, Video, Users, Info } from 'lucide-react'
import * as contractsApi from '../../api/contracts'
import { CONFERENCE_STATUS_TONES } from '../../api/contracts'
import { fetchRfqs } from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

function ScheduleModal({ onClose, onScheduled }) {
  const [rfqs, setRfqs] = useState([])
  const [form, setForm] = useState({ rfqId: '', purpose: 'prebid', scheduledAt: '', meetingUrl: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchRfqs()
      .then((data) => {
        if (!cancelled) {
          setRfqs(data.filter((rfq) => !['cancelled', 'awarded', 'failed'].includes(rfq.status)))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Modal title="Schedule conference" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Procurement
          </label>
          <select
            value={form.rfqId}
            onChange={(event) => setForm({ ...form, rfqId: event.target.value })}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">Select an RFQ / ITB...</option>
            {rfqs.map((rfq) => (
              <option key={rfq.id} value={rfq.id}>
                {rfq.referenceNo} — {rfq.title}
                {rfq.prebidRequired ? ' (pre-bid required)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Purpose
            </label>
            <select
              value={form.purpose}
              onChange={(event) => setForm({ ...form, purpose: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            >
              <option value="prebid">Pre-bid conference</option>
              <option value="clarification">Clarification</option>
              <option value="opening">Bid opening</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Date &amp; time
            </label>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Meeting link
          </label>
          <input
            type="url"
            value={form.meetingUrl}
            onChange={(event) => setForm({ ...form, meetingUrl: event.target.value })}
            placeholder="https://..."
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
          <p className="mt-1 text-xs text-text-faint">
            The system schedules, notifies, and logs attendance — the video call itself runs on your existing
            platform.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            disabled={saving || !form.rfqId || !form.scheduledAt}
            onClick={async () => {
              setError('')
              setSaving(true)
              try {
                await contractsApi.scheduleConference({ ...form, rfqId: Number(form.rfqId) })
                onScheduled()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not schedule.')
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'SCHEDULING...' : 'SCHEDULE & NOTIFY'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function LiveConference() {
  const permissions = usePermissions()
  const [sessions, setSessions] = useState([])
  const [scheduling, setScheduling] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [actionError, setActionError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    contractsApi
      .fetchConferences()
      .then((data) => {
        if (!cancelled) setSessions(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const run = async (fn) => {
    setActionError('')
    try {
      await fn()
      refresh()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'That action could not be completed.')
    }
  }

  const canSchedule = permissions.has('bidding.publish')

  const join = async (session) => {
    // Attendance is captured against the procurement record for audit.
    await run(() => contractsApi.recordAttendance(session.id))
    if (session.meetingUrl) window.open(session.meetingUrl, '_blank', 'noreferrer')
  }

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(sessions)

  return (
    <DashboardPage>
      <PageHeader
        title="Live Conference"
        subtitle="Pre-bid conferences and clarifications, with attendance logged against the procurement."
        actions={
          canSchedule && (
            <Button icon={Plus} onClick={() => setScheduling(true)}>
              SCHEDULE
            </Button>
          )
        }
      />

      <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-[13px] text-text-secondary">
          A pre-bid conference is mandatory at an ABC of ₱3,000,000 or more for competitive selection modes
          (IRR Sec. 51.1). Joining records your attendance in the meeting log.
        </p>
      </div>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Sessions" icon={CalendarClock} bodyClassName="">
        {sessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Nothing scheduled.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Session', 'Procurement', 'When', 'Attendance', 'Status', 'Actions'].map((head) => (
                    <th
                      key={head}
                      className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((session) => (
                  <tr key={session.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 text-[13px] text-navy">{session.title}</td>
                    <td className="px-4 py-3 font-mono text-xs text-navy">{session.referenceNo ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {new Date(session.scheduledAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(session)}
                        className="flex items-center gap-1 text-[13px] text-navy hover:underline"
                      >
                        <Users size={12} /> {session.attendanceCount}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={CONFERENCE_STATUS_TONES[session.status]}>{session.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {['scheduled', 'inProgress'].includes(session.status) && (
                          <button
                            type="button"
                            onClick={() => join(session)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <Video size={12} /> JOIN
                          </button>
                        )}
                        {canSchedule && session.status === 'scheduled' && (
                          <button
                            type="button"
                            onClick={() =>
                              run(() => contractsApi.updateConference(session.id, { status: 'inProgress' }))
                            }
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            START
                          </button>
                        )}
                        {canSchedule && session.status === 'inProgress' && (
                          <button
                            type="button"
                            onClick={() => setViewing(session)}
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            END &amp; LOG
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="conferences" />
      </Card>

      {viewing && (
        <Modal title={viewing.title} onClose={() => setViewing(null)}>
          <p className="mb-2 text-[11px] tracking-[0.03em] text-text-faint uppercase">
            Attendance log ({viewing.attendance.length})
          </p>
          {viewing.attendance.length === 0 ? (
            <p className="text-[13px] text-text-faint">Nobody has joined yet.</p>
          ) : (
            <ol className="mb-4 flex max-h-48 flex-col gap-2 overflow-y-auto">
              {viewing.attendance.map((entry) => (
                <li key={entry.id} className="rounded border border-border-muted p-3">
                  <p className="text-[13px] text-navy">{entry.attendeeName}</p>
                  <p className="text-xs text-text-faint">
                    {entry.organization ?? '—'} · joined {new Date(entry.joinedAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {viewing.minutes && (
            <>
              <p className="mb-1 text-[11px] tracking-[0.03em] text-text-faint uppercase">Minutes</p>
              <p className="mb-4 text-[13px] text-text-secondary">{viewing.minutes}</p>
            </>
          )}

          {canSchedule && viewing.status === 'inProgress' && (
            <EndSessionForm
              session={viewing}
              onDone={() => {
                setViewing(null)
                refresh()
              }}
            />
          )}
        </Modal>
      )}

      {scheduling && <ScheduleModal onClose={() => setScheduling(false)} onScheduled={refresh} />}
    </DashboardPage>
  )
}

function EndSessionForm({ session, onDone }) {
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div>
      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
        Minutes (archived against the procurement record)
      </label>
      <textarea
        rows={3}
        value={minutes}
        onChange={(event) => setMinutes(event.target.value)}
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await contractsApi
              .updateConference(session.id, { status: 'completed', minutes })
              .catch(() => {})
            setBusy(false)
            onDone()
          }}
          className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
        >
          {busy ? 'SAVING...' : 'END SESSION & ARCHIVE'}
        </button>
      </div>
    </div>
  )
}
