import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Megaphone, Eye, Copy, Archive, Globe, Paperclip, Trash2, Upload,
  CalendarClock, AlertTriangle, Link2, Send, Undo2,
} from 'lucide-react'
import * as api from '../../api/announcements'
import { ANNOUNCEMENT_STATUS_TONES } from '../../api/announcements'
import WorkHoursDateTimeInput from '../../components/ui/WorkHoursDateTimeInput'
import { fetchRfqs } from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import RichTextEditor from '../../components/ui/RichTextEditor'

// ── INVITATION TO BID ────────────────────────────────────────────────────────
// The public posting, as distinct from the official letter. Both describe the
// same invitation and the separation is deliberate: this is what a citizen or a
// prospective bidder reads on the portal, written for readers; the signed
// instrument is generated in the documents module from the same solicitation,
// so the two cannot quote different figures.
//
// Everything a bidder plans around — ABC, mode, the three dates, where to
// submit, who to call — is populated from the solicitation rather than retyped,
// then frozen on the notice. A published notice must not change because
// somebody edited the RFQ behind it.

const peso = (value) =>
  value === null || value === undefined
    ? '—'
    : `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`

const dt = (value) =>
  value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// datetime-local wants `YYYY-MM-DDTHH:mm` in *local* time; an ISO string is UTC
// and would silently shift the displayed hour.
const toLocalInput = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const inputClass =
  'w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'
const labelClass = 'text-xs text-text-secondary'

function AttachmentPanel({ announcementId, onError }) {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    if (!announcementId) return
    api.fetchAnnouncementAttachments(announcementId).then(setFiles).catch(() => {})
  }, [announcementId])

  useEffect(reload, [reload])

  if (!announcementId) {
    return (
      <p className="text-xs text-text-faint">
        Save the notice first — attachments need something to attach to.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-text-faint">
        Bidding documents, terms of reference, specifications, plans. These become downloadable to the
        public the moment the notice is published, and stay downloadable after it closes.
      </p>

      {files.length === 0 ? (
        <p className="text-xs text-text-faint">Nothing attached yet.</p>
      ) : (
        files.map((file) => (
          <div key={file.id} className="flex items-center gap-2 rounded border border-border-muted px-3 py-2">
            <Paperclip size={13} className="shrink-0 text-text-faint" />
            <span className="flex-1 truncate text-[13px] text-navy">{file.label || file.filename}</span>
            <span className="text-[11px] text-text-faint">{Math.ceil(file.sizeBytes / 1024)} KB</span>
            <button
              type="button"
              aria-label={`Remove ${file.filename}`}
              onClick={async () => {
                if (!window.confirm(`Remove "${file.filename}" from this notice?`)) return
                try {
                  await api.deleteAnnouncementAttachment(file.id)
                  reload()
                } catch (err) {
                  onError(err.response?.data?.message ?? 'Could not remove that file.')
                }
              }}
              className="text-text-faint hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 rounded border border-border-muted px-3 py-1.5 text-[11px] font-medium tracking-[0.03em] text-navy hover:bg-chip">
        <Upload size={13} />
        {busy ? 'UPLOADING…' : 'ATTACH FILE'}
        <input
          type="file"
          className="hidden"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setBusy(true)
            try {
              await api.uploadAnnouncementAttachment(announcementId, file, file.name)
              reload()
            } catch (err) {
              onError(err.response?.data?.message ?? 'That file could not be attached.')
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
    </div>
  )
}

function NoticeEditor({ existing, solicitations, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    title: existing?.title ?? '',
    referenceNo: existing?.referenceNo ?? '',
    bodyHtml: existing?.bodyHtml ?? '',
    body: existing?.body ?? '',
    category: 'procurementOpportunity',
    rfqId: existing?.rfqId ?? '',
    appEntryId: existing?.appEntryId ?? '',
    abc: existing?.abc ?? '',
    fundSource: existing?.fundSource ?? '',
    procurementMethod: existing?.procurementMethod ?? '',
    procurementMethodCitation: existing?.procurementMethodCitation ?? '',
    prebidAt: toLocalInput(existing?.prebidAt),
    submissionDeadline: toLocalInput(existing?.submissionDeadline),
    bidOpeningAt: toLocalInput(existing?.bidOpeningAt),
    venue: existing?.venue ?? '',
    contactPerson: existing?.contactPerson ?? '',
    contactEmail: existing?.contactEmail ?? '',
    contactPhone: existing?.contactPhone ?? '',
    registrationDeadline: toLocalInput(existing?.registrationDeadline),
    publishAt: toLocalInput(existing?.publishAt),
    expiresAt: toLocalInput(existing?.expiresAt),
    pinned: existing?.pinned ?? false,
  }))
  const [id, setId] = useState(existing?.id ?? null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  // The whole point of the link: pull the figures from the record rather than
  // retyping them. Applied to the form so the officer can still adjust anything
  // before saving — it is a starting point, not a lock.
  const pullFromSolicitation = async (rfqId) => {
    set('rfqId', rfqId)
    if (!rfqId) return
    try {
      const draft = await api.draftFromSolicitation(rfqId)
      setForm((current) => ({
        ...current,
        title: current.title || draft.title || '',
        referenceNo: draft.referenceNo ?? current.referenceNo,
        abc: draft.abc ?? current.abc,
        fundSource: draft.fundSource ?? current.fundSource,
        procurementMethod: draft.procurementMethod ?? current.procurementMethod,
        procurementMethodCitation: draft.procurementMethodCitation ?? current.procurementMethodCitation,
        prebidAt: toLocalInput(draft.prebidAt) || current.prebidAt,
        submissionDeadline: toLocalInput(draft.submissionDeadline) || current.submissionDeadline,
        bidOpeningAt: toLocalInput(draft.bidOpeningAt) || current.bidOpeningAt,
        appEntryId: draft.appEntryId ?? current.appEntryId,
      }))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not read that solicitation.')
    }
  }

  const save = async () => {
    setError('')
    setFieldErrors({})
    setSaving(true)
    try {
      const payload = {
        ...form,
        rfqId: form.rfqId || null,
        appEntryId: form.appEntryId || null,
        abc: form.abc === '' ? null : Number(form.abc),
        // A notice needs *something* in `body`; the rich editor fills it
        // server-side from bodyHtml, but a brand-new notice with an empty
        // editor would fail validation with a confusing message.
        body: form.body || (form.bodyHtml ? undefined : 'To be announced.'),
      }
      const saved = id
        ? await api.updateAnnouncement(id, payload)
        : await api.createAnnouncement(payload)
      setId(saved.id)
      setSavedAt(new Date())
      onSaved(saved)
    } catch (err) {
      const data = err.response?.data
      setFieldErrors(data?.errors ?? {})
      setError(data?.message ?? 'Could not save this notice.')
    } finally {
      setSaving(false)
    }
  }

  const err = (field) =>
    fieldErrors[field] ? <p className="mt-1 text-[11px] text-danger">{fieldErrors[field]}</p> : null

  return (
    <Modal
      title={existing ? `Edit — ${existing.title}` : 'New Invitation to Bid'}
      subtitle="The public posting. The official signed letter is generated separately in Documents."
      onClose={onClose}
      size="xl"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {savedAt && !error && (
          <p className="rounded border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
            Saved as a draft. Nothing is public until you publish it.
          </p>
        )}

        {/* ── Link to the solicitation ── */}
        <div className="rounded border border-navy/10 bg-chip/40 p-3">
          <label className={labelClass}>
            <span className="flex items-center gap-1.5">
              <Link2 size={12} /> Solicitation this notice invites bids for
            </span>
            <select
              value={form.rfqId ?? ''}
              onChange={(event) => pullFromSolicitation(event.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">Not linked — the notice precedes the solicitation</option>
              {solicitations.map((rfq) => (
                <option key={rfq.id} value={rfq.id}>
                  {rfq.referenceNo} — {rfq.title}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-[11px] text-text-faint">
            Linking copies the reference, ABC, mode and schedule from the record. You can still change
            anything below; the values are frozen on the notice once saved, so editing the solicitation
            later will not silently rewrite a published invitation.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Title
            <input value={form.title} onChange={(e) => set('title', e.target.value)} className={`mt-1 ${inputClass}`} />
            {err('title')}
          </label>
          <label className={labelClass}>
            Reference number
            <input
              value={form.referenceNo}
              onChange={(e) => set('referenceNo', e.target.value)}
              placeholder="ITB-2026-014"
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>

        {/* ── Body ── */}
        <div>
          <p className={`mb-1 ${labelClass}`}>Announcement text</p>
          <RichTextEditor value={form.bodyHtml} onChange={(html) => set('bodyHtml', html)} minHeight="240px" />
          {err('body')}
        </div>

        {/* ── Procurement particulars ── */}
        <div className="rounded border border-border-muted p-3">
          <p className="mb-2 text-[11px] font-medium tracking-[0.05em] text-text-secondary uppercase">
            Procurement particulars
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Approved Budget for the Contract
              <input
                type="number"
                value={form.abc}
                onChange={(e) => set('abc', e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
              {err('abc')}
            </label>
            <label className={labelClass}>
              Source of funds
              <input value={form.fundSource} onChange={(e) => set('fundSource', e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className={labelClass}>
              Mode of procurement
              <input value={form.procurementMethod} onChange={(e) => set('procurementMethod', e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className={labelClass}>
              Legal basis
              <input
                value={form.procurementMethodCitation}
                onChange={(e) => set('procurementMethodCitation', e.target.value)}
                placeholder="IRR Sec. 26"
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
        </div>

        {/* ── Schedule ── */}
        <div className="rounded border border-border-muted p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.05em] text-text-secondary uppercase">
            <CalendarClock size={12} /> Schedule
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Pre-bid conference
              <WorkHoursDateTimeInput value={form.prebidAt} onChange={(e) => set('prebidAt', e.target.value)} className={`mt-1 ${inputClass}`} />
              {err('prebidAt')}
            </label>
            <label className={labelClass}>
              Deadline for bids
              <WorkHoursDateTimeInput value={form.submissionDeadline} onChange={(e) => set('submissionDeadline', e.target.value)} className={`mt-1 ${inputClass}`} />
              {err('submissionDeadline')}
            </label>
            <label className={labelClass}>
              Bid opening
              <WorkHoursDateTimeInput value={form.bidOpeningAt} onChange={(e) => set('bidOpeningAt', e.target.value)} className={`mt-1 ${inputClass}`} />
              {err('bidOpeningAt')}
            </label>
          </div>
          <label className={`mt-3 block ${labelClass}`}>
            Venue
            <input value={form.venue} onChange={(e) => set('venue', e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
        </div>

        {/* ── Contact ── */}
        <div className="rounded border border-border-muted p-3">
          <p className="mb-2 text-[11px] font-medium tracking-[0.05em] text-text-secondary uppercase">
            BAC Secretariat contact
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Contact person
              <input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className={labelClass}>
              Email
              <input value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className={labelClass}>
              Telephone
              <input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
          </div>
        </div>

        {/* ── Publication ── */}
        <div className="rounded border border-border-muted p-3">
          <p className="mb-2 text-[11px] font-medium tracking-[0.05em] text-text-secondary uppercase">
            Publication
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Publish automatically on
              <input type="datetime-local" value={form.publishAt} onChange={(e) => set('publishAt', e.target.value)} className={`mt-1 ${inputClass}`} />
              <span className="mt-1 block text-[11px] text-text-faint">Leave blank to publish by hand.</span>
            </label>
            <label className={labelClass}>
              Remove from the portal on
              <input type="datetime-local" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} className={`mt-1 ${inputClass}`} />
              {err('expiresAt')}
            </label>
            <label className={labelClass}>
              Bidder registration closes
              <WorkHoursDateTimeInput value={form.registrationDeadline} onChange={(e) => set('registrationDeadline', e.target.value)} className={`mt-1 ${inputClass}`} />
              {err('registrationDeadline')}
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
            <input type="checkbox" checked={form.pinned} onChange={(e) => set('pinned', e.target.checked)} />
            Pin to the top of the public list
          </label>
        </div>

        {/* ── Attachments ── */}
        <div className="rounded border border-border-muted p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.05em] text-text-secondary uppercase">
            <Paperclip size={12} /> Bidding documents
          </p>
          <AttachmentPanel announcementId={id} onError={setError} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>CLOSE</Button>
          <Button icon={Send} onClick={save} disabled={saving}>
            {saving ? 'SAVING…' : id ? 'SAVE CHANGES' : 'SAVE DRAFT'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PreviewModal({ notice, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.previewAnnouncement(notice.id).then(setData).catch((err) =>
      setError(err.response?.data?.message ?? 'Could not build the preview.')
    )
  }, [notice.id])

  const p = data?.preview

  return (
    <Modal
      title="Preview"
      subtitle="Exactly what the public portal will show — same serialiser, no second code path."
      onClose={onClose}
      size="lg"
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      {!data ? (
        <p className="text-[13px] text-text-faint">Building preview…</p>
      ) : (
        <div className="rounded border border-border-muted bg-surface p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="info">Procurement Opportunity</Badge>
            {p.referenceNo && <span className="font-mono text-[11px] text-text-faint">{p.referenceNo}</span>}
            {p.submissionsClosed && <Badge tone="warning">CLOSED</Badge>}
          </div>
          <h3 className="text-base font-semibold text-navy">{p.title}</h3>

          <dl className="mt-3 grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
            {[
              ['Approved Budget', peso(p.abc)],
              ['Source of funds', p.fundSource],
              ['Mode', p.procurementMethod],
              ['Pre-bid conference', dt(p.prebidAt)],
              ['Deadline for bids', dt(p.submissionDeadline)],
              ['Bid opening', dt(p.bidOpeningAt)],
              ['Venue', p.venue],
              ['Contact', p.contactPerson],
            ]
              .filter(([, value]) => value && value !== '—')
              .map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-text-faint">{label}:</dt>
                  <dd className="text-navy">{value}</dd>
                </div>
              ))}
          </dl>

          {p.bodyHtml ? (
            <div
              className="mt-4 text-[13px] leading-relaxed text-text-secondary [&_table]:w-full [&_td]:border [&_td]:p-1 [&_th]:border [&_th]:p-1"
              dangerouslySetInnerHTML={{ __html: p.bodyHtml }}
            />
          ) : (
            <p className="mt-4 whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">{p.body}</p>
          )}

          {(data.attachments ?? []).length > 0 && (
            <div className="mt-4 border-t border-border-muted pt-3">
              <p className="mb-1 text-[11px] font-medium tracking-[0.05em] text-text-secondary uppercase">
                Downloads
              </p>
              {data.attachments.map((file) => (
                <p key={file.id} className="flex items-center gap-2 text-[12.5px] text-navy">
                  <Paperclip size={12} /> {file.label || file.filename}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function InvitationToBid() {
  const permissions = usePermissions()
  const [notices, setNotices] = useState([])
  const [solicitations, setSolicitations] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [previewing, setPreviewing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState('')

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.fetchAnnouncements({ category: 'procurementOpportunity' }),
      fetchRfqs().catch(() => []),
    ])
      .then(([rows, rfqs]) => {
        if (cancelled) return
        setNotices(Array.isArray(rows) ? rows : (rows.rows ?? []))
        // Only a live solicitation can be advertised — a draft has not been
        // opened and a cancelled one must not attract bids.
        setSolicitations(
          (Array.isArray(rfqs) ? rfqs : (rfqs.rows ?? [])).filter((r) =>
            ['published', 'open', 'closed'].includes(r.status)
          )
        )
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshToken])

  const act = async (fn) => {
    setError('')
    try {
      await fn()
      refresh()
    } catch (err) {
      setError(err.response?.data?.message ?? 'That action could not be completed.')
    }
  }

  const canManage = permissions.has('announcements.manage')

  const visible = notices.filter((notice) => {
    if (statusFilter && notice.status !== statusFilter) return false
    if (!search.trim()) return true
    const needle = search.trim().toLowerCase()
    return [notice.title, notice.referenceNo, notice.procurementMethod]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle))
  })

  return (
    <DashboardPage>
      <PageHeader
        title="Invitation to Bid"
        subtitle="Public postings on the transparency portal. Particulars are pulled from the solicitation and frozen on the notice, so a published invitation never changes underneath its readers."
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={CalendarClock}
                onClick={() => act(api.releaseScheduledAnnouncements)}
              >
                RELEASE SCHEDULED
              </Button>
              <Button icon={Plus} onClick={() => setCreating(true)}>NEW INVITATION</Button>
            </div>
          )
        }
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <Card bodyClassName="flex flex-wrap gap-3 p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, reference or mode…"
          className="min-w-[220px] flex-1 rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </Card>

      <Card title="Invitations" icon={Megaphone} bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading invitations…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            No Invitation to Bid notices yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Reference', 'Invitation', 'ABC', 'Deadline', 'Status', 'Actions'].map((head) => (
                    <th key={head} className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((notice) => (
                  <tr key={notice.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">{notice.referenceNo ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-navy">{notice.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-text-faint">
                        {notice.procurementMethod ?? 'Mode not stated'}
                        {notice.duplicatedFromId && ' · duplicated'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">{peso(notice.abc)}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {dt(notice.submissionDeadline)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={ANNOUNCEMENT_STATUS_TONES[notice.status]}>{notice.status}</Badge>
                        {notice.scheduled && <Badge tone="info">SCHEDULED</Badge>}
                        {notice.submissionsClosed && <Badge tone="warning">CLOSED</Badge>}
                        {notice.acceptingRegistrations && <Badge tone="success">ACCEPTING</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={() => setPreviewing(notice)}
                          className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline">
                          <Eye size={11} /> PREVIEW
                        </button>

                        {canManage && notice.status === 'draft' && (
                          <>
                            <button type="button" onClick={() => setEditing(notice)}
                              className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline">
                              EDIT
                            </button>
                            <button type="button" onClick={() => act(() => api.publishAnnouncement(notice.id))}
                              className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-accent hover:underline">
                              <Globe size={11} /> PUBLISH
                            </button>
                          </>
                        )}

                        {canManage && notice.status === 'published' && (
                          <>
                            <button type="button" onClick={() => {
                              const reason = window.prompt('Why is this notice being withdrawn?')
                              if (reason?.trim()) act(() => api.withdrawAnnouncement(notice.id, reason))
                            }}
                              className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-danger hover:underline">
                              <Undo2 size={11} /> WITHDRAW
                            </button>
                            <button type="button" onClick={() => act(() => api.archiveAnnouncement(notice.id))}
                              className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline">
                              <Archive size={11} /> ARCHIVE
                            </button>
                          </>
                        )}

                        {canManage && (
                          <button type="button" onClick={() => act(async () => {
                            const copy = await api.duplicateAnnouncement(notice.id)
                            setEditing(copy)
                          })}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline">
                            <Copy size={11} /> DUPLICATE
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
      </Card>

      <p className="flex items-start gap-2 text-xs text-text-faint">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        This is the public posting. The official signed Invitation to Bid letter is generated from the same
        solicitation under Documents, so the two cannot quote different figures.
      </p>

      {(creating || editing) && (
        <NoticeEditor
          existing={editing}
          solicitations={solicitations}
          onClose={() => { setCreating(false); setEditing(null); refresh() }}
          onSaved={(saved) => setEditing(saved)}
        />
      )}

      {previewing && <PreviewModal notice={previewing} onClose={() => setPreviewing(null)} />}
    </DashboardPage>
  )
}
