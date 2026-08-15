import { useCallback, useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Megaphone, Send, Pin, CalendarClock } from 'lucide-react'
import * as announcementsApi from '../../api/announcements'
import { clampToWorkHours } from '../../utils/workHours'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

// Where the BAC Secretariat (and the administrator, for system notices) writes
// what appears on the public portal.
//
// The workflow is draft → publish → withdraw, and it is three steps rather than
// one on purpose: a notice about an upcoming procurement is usually written
// before the office is ready to commit to it, and publishing is the accountable
// act that puts it in front of the municipality.

const CATEGORY_OPTIONS = [
  { key: 'procurementOpportunity', label: 'Procurement Opportunity' },
  { key: 'newProject', label: 'New Project' },
  { key: 'systemUpdate', label: 'System Update' },
  { key: 'general', label: 'General Notice' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.key, c.label]))

const STATUS_TONES = { draft: 'neutral', published: 'success', archived: 'warning' }

// <input type="datetime-local"> speaks 'YYYY-MM-DDTHH:mm' in the browser's own
// timezone, and the API speaks ISO. These two convert between them without
// dragging in a date library.
const toLocalInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

// '' means "no date", which the API reads as clearing the field.
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'

// ── SETTING A DEADLINE WITHOUT TYPING ONE ────────────────────────────────────
// A bare <input type="datetime-local"> was the whole control. It is precise and
// it is miserable: an officer posting a call that closes in a fortnight had to
// work out the date, then tab through four segments to enter it, then trust that
// what they typed meant what they thought.
//
// The presets are how the deadline actually gets chosen — "two weeks from now,
// end of the working day" — and the echo underneath says, in words, what the
// machine understood. The raw input stays for the cases the presets miss.

// 5pm local. A registration deadline at 00:00 closes the day *before* the one
// the officer means, which is exactly the off-by-one a call for bidders cannot
// afford.
const inDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(17, 0, 0, 0)
  return toLocalInput(date)
}

const DEADLINE_PRESETS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
]

// "Friday, 27 Feb 2026 at 5:00 PM · 12 days from now"
//
// Counted in whole calendar days, not elapsed hours. Rounding the difference in
// milliseconds made the "14 days" preset read back as "15 days from now" — the
// preset lands at 5pm, so from an early-morning now it is 14.6 elapsed days, and
// a button whose label disagrees with the sentence under it is worse than no
// sentence at all.
const describeDeadline = (localValue) => {
  if (!localValue) return null
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return null

  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((midnight(date) - midnight(new Date())) / 86400000)
  const when = date.toLocaleString('en-PH', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const relative =
    days < 0 ? 'in the past' : days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} from now`
  return { when, relative, past: days < 0 }
}

function DeadlineField({ label, value, onChange, error, hint, name }) {
  const described = describeDeadline(value)

  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">{label}</label>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          name={name}
          value={value ?? ''}
          // Clamp a manually typed time into office hours. The presets already
          // land on 5pm; this catches the raw input, where an officer could
          // otherwise set a deadline for 3am (see utils/workHours.js).
          onChange={(event) => onChange(clampToWorkHours(event.target.value))}
          className="h-9.5 min-w-52 flex-1 rounded-md border border-border-muted bg-surface px-3 text-[13px] text-navy focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none"
        />
        {DEADLINE_PRESETS.map((preset) => (
          <button
            key={preset.days}
            type="button"
            onClick={() => onChange(inDays(preset.days))}
            className="h-9.5 rounded-md border border-border-muted px-3 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-navy"
          >
            {preset.label}
          </button>
        ))}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="h-9.5 rounded-md px-2.5 text-[12.5px] text-text-faint transition-colors hover:text-danger"
          >
            Clear
          </button>
        )}
      </div>

      {described && (
        <p
          className={`mt-2 text-[12.5px] ${described.past ? 'text-danger' : 'text-text-secondary'}`}
        >
          {described.when} <span className="text-text-faint">· {described.relative}</span>
        </p>
      )}
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
      {!described && hint && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">{hint}</p>
      )}
    </div>
  )
}

const announcementSchema = z
  .object({
    title: z.string().trim().min(1, 'A title is required').max(200, 'Title is too long'),
    body: z.string().trim().min(1, 'Write what the notice should say'),
    category: z.enum(['procurementOpportunity', 'newProject', 'systemUpdate', 'general']),
    referenceNo: z.string().trim().max(60, 'Reference is too long').optional().or(z.literal('')),
    registrationDeadline: z.string().optional().or(z.literal('')),
    expiresAt: z.string().optional().or(z.literal('')),
    pinned: z.boolean().optional(),
  })
  .superRefine((values, ctx) => {
    // Mirrors the server rule in publishAnnouncement. Caught here as well so the
    // officer finds out while they are still in the form rather than at publish.
    if (values.registrationDeadline && new Date(values.registrationDeadline) <= new Date()) {
      ctx.addIssue({
        path: ['registrationDeadline'],
        code: z.ZodIssueCode.custom,
        message: 'The deadline must be in the future, or bidders cannot answer the call.',
      })
    }
    if (
      values.expiresAt &&
      values.registrationDeadline &&
      new Date(values.expiresAt) < new Date(values.registrationDeadline)
    ) {
      ctx.addIssue({
        path: ['expiresAt'],
        code: z.ZodIssueCode.custom,
        message: 'The notice would come down before registration closes.',
      })
    }
  })

// Module scope: a component declared inside a render is a new type every pass,
// which remounts its whole subtree instead of updating it — and in a form that
// means every field loses focus as you type.
const Section = ({ heading, note, children }) => (
  <section className="border-t border-border-muted pt-5 first:border-0 first:pt-0">
    <p className="text-[11.5px] font-medium tracking-[0.05em] text-text-faint uppercase">{heading}</p>
    {note && <p className="mt-1 text-[12.5px] leading-relaxed text-text-faint">{note}</p>}
    <div className="mt-3.5 flex flex-col gap-4">{children}</div>
  </section>
)

function AnnouncementFormModal({ title, defaultValues, onSubmit, onClose }) {
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(announcementSchema), defaultValues, mode: 'onBlur' })

  // `useWatch` rather than the form's own `watch()`: the latter returns a fresh
  // function each render, which the React Compiler cannot memoize safely.
  const deadline = useWatch({ control, name: 'registrationDeadline' })
  const expiresAt = useWatch({ control, name: 'expiresAt' })

  // The two date fields are driven rather than registered, because the preset
  // buttons write to them from outside the input.
  const setDate = (field) => (next) =>
    setValue(field, next, { shouldValidate: true, shouldDirty: true })

  const submit = async (values) => {
    setServerError('')
    try {
      await onSubmit({
        ...values,
        referenceNo: values.referenceNo?.trim() || null,
        registrationDeadline: fromLocalInput(values.registrationDeadline),
        expiresAt: fromLocalInput(values.expiresAt),
        pinned: Boolean(values.pinned),
      })
      onClose()
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong.')
    }
  }

  const inputClass =
    'w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none'

  return (
    // Two columns at `lg`, so the form is about half as tall as it was. It was
    // one column of seven stacked fields, which is what made it "too long".
    <Modal title={title} size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-6">
        <Section heading="The notice">
          <FormField label="Title" error={errors.title?.message} registration={register('title')} />

          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
              Announcement
            </label>
            <textarea
              rows={5}
              {...register('body')}
              className={`${inputClass} resize-y`}
              placeholder="What the public needs to know. Line breaks are preserved."
            />
            {errors.body?.message && <p className="mt-1 text-[12px] text-danger">{errors.body.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
                Category
              </label>
              <select className={inputClass} {...register('category')}>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <FormField
              label="Reference no. (optional)"
              error={errors.referenceNo?.message}
              registration={register('referenceNo')}
              placeholder="e.g. ITB-2026-014"
            />
          </div>
        </Section>

        <Section
          heading="Dates"
          note="Setting a registration deadline is what turns a notice into a call for bidders — there is no separate switch, because two controls expressing one fact are two controls that can disagree."
        >
          <DeadlineField
            label="Bidder registration deadline (optional)"
            name="registrationDeadline"
            value={deadline}
            onChange={setDate('registrationDeadline')}
            error={errors.registrationDeadline?.message}
            hint="Leave blank for a notice that is not calling for bidders. Set a date and the public registration form accepts applications against this call until then."
          />

          <DeadlineField
            label="Take down automatically on (optional)"
            name="expiresAt"
            value={expiresAt}
            onChange={setDate('expiresAt')}
            error={errors.expiresAt?.message}
            hint="Leave blank to keep the notice up until it is withdrawn by hand."
          />

          <label className="flex items-center gap-2.5 text-[13px] text-text-secondary">
            <input type="checkbox" {...register('pinned')} className="size-4" />
            Pin to the top of the public announcements list
          </label>
        </Section>

        {serverError && (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger"
          >
            {serverError}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border-muted pt-5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-fg disabled:opacity-60"
          >
            {isSubmitting ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Withdrawing is the one destructive-looking action here, and it demands a
// reason: the notice has already been read by the public, so the record has to
// say why it came down.
function WithdrawModal({ announcement, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onConfirm(reason)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not withdraw that notice.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Withdraw "${announcement.title}"`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-text-secondary">
          This removes the notice from the public portal. It is kept as a record of what the public
          was told and cannot be edited or republished afterwards.
        </p>

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Reason for withdrawal
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full resize-y rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            placeholder="e.g. Superseded by ITB-2026-021 after the ABC was revised."
          />
        </div>

        {error && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-sm bg-danger px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-white disabled:opacity-60"
          >
            {busy ? 'WITHDRAWING...' : 'WITHDRAW'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function AnnouncementsAdmin() {
  const [announcements, setAnnouncements] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [withdrawing, setWithdrawing] = useState(null)
  const [actionError, setActionError] = useState('')

  // State is set only inside the promise callbacks, never synchronously in the
  // effect body — this repo's React Compiler lint rules reject the latter, and
  // it is also what stops a filter change cascading an extra render.
  const load = useCallback(
    () =>
      announcementsApi
        .fetchAnnouncements(statusFilter ? { status: statusFilter } : {})
        .then((data) => {
          setAnnouncements(data)
          setLoaded(true)
        })
        .catch(() => setLoaded(true)),
    [statusFilter]
  )

  useEffect(() => {
    load()
  }, [load])

  const publish = async (announcement) => {
    setActionError('')
    try {
      await announcementsApi.publishAnnouncement(announcement.id)
      load()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Could not publish that notice.')
    }
  }

  const published = announcements.filter((a) => a.status === 'published')
  const openCalls = announcements.filter((a) => a.acceptingRegistrations)

  // "Which calls are still open?" is the question that decides whether a
  // late submission can be accepted, so it gets a filter rather than a scan
  // down the deadline column.
  const table = useTableControls(announcements, {
    searchKeys: ['title', 'referenceNo', 'body'],
    filters: [
      {
        key: 'category',
        label: 'All categories',
        options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
      },
      { key: 'status', label: 'All statuses' },
      {
        key: 'acceptingRegistrations',
        label: 'Registration',
        options: [
          { value: 'true', label: 'Still accepting' },
          { value: 'false', label: 'Closed or none' },
        ],
        accessor: (row) => String(Boolean(row.acceptingRegistrations)),
      },
    ],
    accessors: {
      category: (row) => CATEGORY_LABELS[row.category] ?? row.category,
    },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title="Public Announcements"
        subtitle="Notices on the public portal — system updates, open procurements, and calls for bidders ahead of a procurement starting."
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            NEW ANNOUNCEMENT
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Notices" value={announcements.length} icon={Megaphone} />
        <StatCard label="Live on the Portal" value={published.length} icon={Send} tone="success" />
        <StatCard
          label="Open for Registration"
          value={openCalls.length}
          icon={CalendarClock}
          tone={openCalls.length ? 'warning' : undefined}
        />
      </div>

      <Card bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="draft">Drafts</option>
            <option value="published">Published</option>
            <option value="archived">Withdrawn</option>
          </select>
          <p className="text-xs text-text-faint">
            Drafts are invisible to the public until you publish them.
          </p>
        </div>
      </Card>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card bodyClassName="">
        {!loaded ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading announcements...</p>
        ) : table.rows.length === 0 ? (
          <>
            <div className="border-b border-border-muted p-4">
              <TableToolbar {...table.toolbarProps} searchPlaceholder="Search title, reference or text…" />
            </div>
            <p className="px-4 py-8 text-center text-[13px] text-text-faint">
              {table.totalBeforeFilters === 0
                ? 'Nothing here yet. Post a notice to tell the public what is coming.'
                : 'No announcements match your search or filters.'}
            </p>
          </>
        ) : (
          <>
            <div className="border-b border-border-muted p-4">
              <TableToolbar {...table.toolbarProps} searchPlaceholder="Search title, reference or text…" />
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('title')}>Title</SortableTh>
                  <SortableTh {...table.sortProps('category')}>Category</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <SortableTh {...table.sortProps('registrationDeadline')}>Registration closes</SortableTh>
                  <SortableTh {...table.sortProps('publishedAt')}>Published</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-border-muted">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {row.pinned && <Pin size={12} className="shrink-0 text-text-faint" />}
                        <span className="text-[13px] text-navy">{row.title}</span>
                      </div>
                      {row.referenceNo && (
                        <span className="font-mono text-[11px] text-text-faint">{row.referenceNo}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] whitespace-nowrap text-text-secondary">
                      {CATEGORY_LABELS[row.category] ?? row.category}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[row.status]}>
                        {row.status === 'archived' ? 'withdrawn' : row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] whitespace-nowrap text-text-secondary">
                      {row.registrationDeadline ? (
                        <>
                          {formatDateTime(row.registrationDeadline)}
                          {!row.acceptingRegistrations && (
                            <span className="ml-1.5 text-[11px] text-text-faint">(closed)</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] whitespace-nowrap text-text-secondary">
                      {row.publishedAt ? formatDateTime(row.publishedAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {row.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => setEditing(row)}
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            EDIT
                          </button>
                        )}
                        {row.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => publish(row)}
                            className="text-[11px] font-medium tracking-[0.03em] text-success hover:underline"
                          >
                            PUBLISH
                          </button>
                        )}
                        {row.status === 'published' && (
                          <button
                            type="button"
                            onClick={() => setWithdrawing(row)}
                            className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                          >
                            WITHDRAW
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
        <Pagination {...paginationProps} label="announcements" />
      </Card>

      {creating && (
        <AnnouncementFormModal
          title="New announcement"
          defaultValues={{
            title: '',
            body: '',
            category: 'general',
            referenceNo: '',
            registrationDeadline: '',
            expiresAt: '',
            pinned: false,
          }}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await announcementsApi.createAnnouncement(values)
            load()
          }}
        />
      )}

      {editing && (
        <AnnouncementFormModal
          title={`Edit "${editing.title}"`}
          defaultValues={{
            title: editing.title,
            body: editing.body,
            category: editing.category,
            referenceNo: editing.referenceNo ?? '',
            registrationDeadline: toLocalInput(editing.registrationDeadline),
            expiresAt: toLocalInput(editing.expiresAt),
            pinned: editing.pinned,
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await announcementsApi.updateAnnouncement(editing.id, values)
            load()
          }}
        />
      )}

      {withdrawing && (
        <WithdrawModal
          announcement={withdrawing}
          onClose={() => setWithdrawing(null)}
          onConfirm={async (reason) => {
            await announcementsApi.withdrawAnnouncement(withdrawing.id, reason)
            load()
          }}
        />
      )}
    </DashboardPage>
  )
}
