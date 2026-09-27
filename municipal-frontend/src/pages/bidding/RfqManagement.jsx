import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Plus, Inbox, Info, Table2 } from 'lucide-react'
import * as biddingApi from '../../api/bidding'
import { RFQ_STATUS_LABELS, RFQ_STATUS_TONES } from '../../api/bidding'
import { fetchPrs } from '../../api/purchaseRequisitions'
import { fetchDocuments } from '../../api/documents'
import DashboardPage from '../../components/ui/DashboardPage'
import { usePermissions } from '../../context/usePermissions'
import { useAuth } from '../../context/useAuth'
import ScheduleFields from './ScheduleFields'
import { schedulePayload } from './schedulePayload'
import ScheduleWorkspace from './ScheduleWorkspace'
import AttemptHistoryModal from './AttemptHistoryModal'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import DocumentSlot from '../../components/ui/DocumentSlot'
import LargeFormPage from '../../components/ui/LargeFormPage'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { NextInline } from '../../components/ui/NextStep'
import { rfqNext } from '../../config/nextSteps'
import { useServerTable } from '../../components/ui/useServerTable'

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function HopeWithdrawalModal({ rfq, onClose, onSaved, onOpenAbstract }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ reason: '', factualFinding: '', decisionReference: '' })
  const evidence = documents.find((document) => document.docType === 'rfqCancellationEvidence')

  const refreshDocuments = useCallback(() => fetchDocuments('rfq', rfq.id)
    .then(setDocuments)
    .catch((err) => setError(err.response?.data?.message ?? 'Could not load RFQ supporting records.'))
    .finally(() => setLoading(false)), [rfq.id])

  useEffect(() => { refreshDocuments() }, [refreshDocuments])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const result = await biddingApi.cancelRfq(rfq.id, { ...form, supportingDocumentId: evidence?.id })
      onSaved(result)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message ?? 'The HoPE decision could not be recorded. Review the fields and try again.')
    } finally {
      setSaving(false)
    }
  }

  return <Modal size="xl" title={`HoPE review of ${rfq.referenceNo}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-text-secondary">Review the published terms and quotations before deciding. Withdrawing this RFQ preserves its abstract, quotations, and provisional assessments. Suppliers are notified, and any corrected RFQ needs a new deadline.</p>
      {rfq.modeKey === 'smallValueProcurement' && ['opened', 'evaluated'].includes(rfq.status) && <Button type="button" size="sm" variant="secondary" onClick={onOpenAbstract}>Review Abstract of Quotations</Button>}
      <div className="space-y-2">
        <p className="text-sm font-medium text-navy">Factual review note</p>
        <p className="text-xs text-text-secondary">Attach the BAC or end-user note describing the omission. The signed-in HoPE action below records the decision.</p>
        {loading ? <p className="text-xs text-text-secondary">Loading supporting records…</p> : <DocumentSlot entityRef="rfq" entityId={rfq.id} docType="rfqCancellationEvidence" label="Factual review for HoPE withdrawal" existing={evidence} disabled={Boolean(evidence)} onChanged={refreshDocuments} />}
      </div>
      <label className="block text-sm font-medium text-navy">Decision reference
        <input required maxLength={255} value={form.decisionReference} onChange={(event) => setForm({ ...form, decisionReference: event.target.value })} placeholder="Official decision or memorandum reference" className="mt-1 min-h-11 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm font-normal text-navy focus:border-navy focus:outline-none" />
      </label>
      <label className="block text-sm font-medium text-navy">Procedural finding
        <textarea required maxLength={4000} rows={4} value={form.factualFinding} onChange={(event) => setForm({ ...form, factualFinding: event.target.value })} placeholder="State what was missing from the RFQ and why quotations cannot be compared fairly." className="mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm font-normal text-navy focus:border-navy focus:outline-none" />
      </label>
      <label className="block text-sm font-medium text-navy">Reason for withdrawal and no award
        <textarea required maxLength={2000} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Explain the Section 70(b) decision and the corrected RFQ to follow." className="mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm font-normal text-navy focus:border-navy focus:outline-none" />
      </label>
      <p className="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-text-secondary">This decision concerns the RFQ procedure. Earlier provisional non-compliance findings stay in the record and do not disqualify the suppliers from the corrected RFQ.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Back</Button><Button type="submit" disabled={saving || loading || !evidence || !form.reason.trim() || !form.factualFinding.trim() || !form.decisionReference.trim()}>{saving ? 'Recording decision…' : 'Record HoPE decision and withdraw RFQ'}</Button></div>
    </form>
  </Modal>
}

function CreateRfqModal({ onClose, onCreated }) {
  const [prs, setPrs] = useState([])
  const [form, setForm] = useState({ prHeaderId: '', title: '', category: 'goods', closingDate: '', openingDate: '', qualityWeight: '', financialWeight: '', consultingPassingScore: '', svpTechnicalSpecifications: '', svpEligibilityDueStage: 'offer' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedPr = prs.find((pr) => String(pr.id) === String(form.prHeaderId))
  const isSmallValue = selectedPr?.procurementModeKey === 'smallValueProcurement'

  useEffect(() => {
    let cancelled = false
    fetchPrs({ status: 'approved' })
      .then((data) => {
        if (!cancelled) setPrs(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    // Item 12: procurement setup carries the requisition link, particulars and
    // a full schedule — a full page with sections, not a scroll-heavy modal.
    <LargeFormPage
      title="New Request for Quotation (RFQ) / Invitation to Bid (ITB)"
      purpose="Advertise an approved requisition. The ABC and procurement mode come from the requisition — review the schedule before publication."
      onBack={onClose}
      backLabel="Back to procurements"
      error={error}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !form.prHeaderId || !form.closingDate || !form.openingDate || (isSmallValue && form.svpTechnicalSpecifications.trim().length < 20)}
            onClick={async () => {
              setError('')
              setSaving(true)
              try {
                await biddingApi.createRfq({ prHeaderId: Number(form.prHeaderId), title: form.title, category: form.category, ...(isSmallValue ? { svpTechnicalSpecifications: form.svpTechnicalSpecifications, svpEligibilityDueStage: form.svpEligibilityDueStage } : {}), ...schedulePayload(form) })
                onCreated()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? err.message ?? 'Could not create the RFQ.')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Creating…' : 'Create draft'}
          </Button>
        </>
      }
    >
      <LargeFormPage.Section
        title="Linked requisition"
        description="Which approved requisition this solicitation advertises."
      >
        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Approved requisition
          </label>
          <select
            value={form.prHeaderId}
            onChange={(event) => setForm({ ...form, prHeaderId: event.target.value })}
            className="min-h-11 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">Select an approved requisition...</option>
            {prs.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.prNumber} — {peso(pr.totalAmount)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-faint">
            The ABC and procurement mode are derived from the requisition and the LGU&apos;s IRR thresholds.
          </p>
        </div>
      </LargeFormPage.Section>

      <LargeFormPage.Section
        title="Solicitation"
        description="What bidders will see on the advertisement."
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Category
            </label>
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            >
              <option value="goods">Goods</option>
              <option value="infrastructure">Infrastructure Projects</option>
              <option value="consulting">Consulting Services</option>
            </select>
          </div>
          {isSmallValue && <>
            <label className="block text-xs font-medium text-text-secondary">Technical specifications, quantities, delivery terms and required eligibility documents
              <textarea required minLength={20} rows={5} value={form.svpTechnicalSpecifications} onChange={(event) => setForm({ ...form, svpTechnicalSpecifications: event.target.value })} className="mt-1 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none" />
            </label>
            <label className="block text-xs font-medium text-text-secondary">When must suppliers submit eligibility documents?
              <select value={form.svpEligibilityDueStage} onChange={(event) => setForm({ ...form, svpEligibilityDueStage: event.target.value })} className="mt-1 min-h-11 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none">
                <option value="offer">With the quotation</option>
                <option value="evaluation">During evaluation</option>
                <option value="beforeAward">Before the award notice</option>
              </select>
            </label>
            <p className="text-xs text-text-faint">Review these terms in the draft Schedule / Criteria screen before publishing; publication locks them.</p>
          </>}
        </div>
      </LargeFormPage.Section>

      <LargeFormPage.Section
        title="Schedule"
        description="Submission deadline, opening date and related milestones."
      >
        <ScheduleFields form={form} setForm={setForm} />
      </LargeFormPage.Section>
    </LargeFormPage>
  )
}

// ── ABSTRACT OF BIDS / QUOTATIONS (RA 12009 IRR Secs. 34.3(f), 43) ───────────
// The tabulation of who responded and at what — one of the documents observers
// are entitled to demand, and the one they sign as witnesses.
//
// Small Value Procurement lists respondents and prices after the recorded
// opening. Other modes retain their existing blind and sealed presentation.
function AbstractOfBidsModal({ rfq, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const isSmallValue = rfq.modeKey === 'smallValueProcurement'

  useEffect(() => {
    let cancelled = false
    biddingApi
      .fetchAbstractOfBids(rfq.id)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err.response?.data?.message ?? 'Could not load the Abstract of Bids.')
      })
    return () => {
      cancelled = true
    }
  }, [rfq.id])

  return (
    <Modal title={`${isSmallValue ? 'Abstract of Quotations' : 'Abstract of Bids'} — ${rfq.referenceNo}`} onClose={onClose}>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !data && <p className="text-[13px] text-text-faint">Loading…</p>}

      {data && (
        <>
          <dl className="mb-4 grid grid-cols-1 gap-x-4 gap-y-2 rounded border border-border-muted bg-sidebar px-4 py-3 text-[12.5px] sm:grid-cols-2">
            <dt className="text-text-secondary">Project</dt>
            <dd className="min-w-0 break-words font-medium text-navy sm:text-right">{data.title}</dd>
            <dt className="text-text-secondary">Approved Budget (ABC)</dt>
            <dd className="font-medium text-navy sm:text-right">{peso(data.abc)}</dd>
            <dt className="text-text-secondary">Mode</dt>
            <dd className="break-words text-navy sm:text-right">{data.mode ?? '—'}</dd>
            <dt className="text-text-secondary">{isSmallValue ? 'Quotations opened' : 'Bids opened'}</dt>
            <dd className="break-words text-navy sm:text-right">
              {data.openedAt ? new Date(data.openedAt).toLocaleString('en-PH') : 'Not yet opened'}
              {data.openedByName && (
                <span className="block text-[11.5px] text-text-faint">by {data.openedByName}</span>
              )}
            </dd>
          </dl>

          {data.blind && (
            <p className="mb-3 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
              Evaluation is blind. Bidders are shown by their label and prices are withheld until
              the committee has scored the technical component.
            </p>
          )}

          <div className="overflow-x-auto overscroll-x-contain rounded border border-border-muted" role="region" aria-label={isSmallValue ? 'Abstract of quotations table' : 'Abstract of bids table'} tabIndex={0}>
            <table className="min-w-[34rem] w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <Th>{isSmallValue ? 'Respondent' : 'Bidder'}</Th>
                  <Th>{isSmallValue ? 'Quoted price' : 'Bid price'}</Th>
                  <Th>Rating</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-text-faint">
                      {isSmallValue ? 'No quotations were received.' : 'No bids were received.'}
                    </td>
                  </tr>
                ) : (
                  data.entries.map((entry) => (
                    <tr key={entry.blindLabel} className="border-t border-border-muted">
                      <td className="px-4 py-2.5 text-[13px] text-navy">
                        {entry.bidderName ?? entry.blindLabel}
                        {!data.blind && !isSmallValue && entry.blindLabel && (
                          <span className="ml-1.5 font-mono text-[11px] text-text-faint">
                            {entry.blindLabel}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] whitespace-nowrap text-navy">
                        {entry.totalBidPrice === null ? (
                          <span className="text-text-faint">Sealed</span>
                        ) : (
                          peso(entry.totalBidPrice)
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-text-secondary">
                        {entry.rating ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-text-secondary">{entry.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[12px] text-text-faint">
            {data.bidsReceived} {isSmallValue ? 'quotation' : 'bid'}{data.bidsReceived === 1 ? '' : 's'} received, closing{' '}
            {data.closingDate ? new Date(data.closingDate).toLocaleDateString('en-PH') : '—'}.
          </p>

          <h4 className="mt-5 text-[13px] font-semibold text-navy">Witnesses (Sec. 43)</h4>
          {data.witnesses.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] text-text-faint">
              No observer attended this opening. The abstract records that as a fact — the bidding
              is not invalidated by non-attendance, but the absence is part of the record.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border-muted border-t border-border-muted">
              {data.witnesses.map((witness, index) => (
                <li key={index} className="flex items-baseline justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="break-words text-[13px] text-navy">{witness.representative ?? '—'}</p>
                    <p className="break-words text-[11.5px] text-text-faint">{witness.organization}</p>
                    {witness.stagesAttended?.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-text-faint">
                        Attended: {witness.stagesAttended.length} stage
                        {witness.stagesAttended.length === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11.5px] text-text-secondary">{witness.sector}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          CLOSE
        </Button>
      </div>
    </Modal>
  )
}

export default function RfqManagement() {
  const permissions = usePermissions()
  const { user } = useAuth()
  const canPublish = permissions.has('bidding.publish')
  const canHopeWithdraw = user?.role === 'hope' && permissions.has('bidding.award')
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(null)
  const [abstractFor, setAbstractFor] = useState(null)
  const [historyFor, setHistoryFor] = useState(null)
  const [scheduleFor, setScheduleFor] = useState(null)
  const [withdrawalFor, setWithdrawalFor] = useState(null)
  const [witnesses, setWitnesses] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const run = async (fn, success) => {
    setActionError('')
    setMessage('')
    try {
      const result = await fn()
      setMessage(result?.message ?? success ?? 'Procurement updated. Review its current status and next action.')
      refresh()
      return true
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'That action could not be completed.')
      return false
    }
  }

  // Sorting by closing date is the one this office needs most: it is the order
  // in which the work becomes urgent.
  const table = useServerTable(biddingApi.fetchRfqs, {
    urlKey: 'rfqs',
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(RFQ_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'prebidRequired',
        label: 'Pre-bid conference',
        options: [
          { value: 'true', label: 'Pre-bid required' },
          { value: 'false', label: 'No pre-bid' },
        ],
      },
    ],
    accessors: {
      abc: (rfq) => Number(rfq.abc ?? 0),
      status: (rfq) => RFQ_STATUS_LABELS[rfq.status] ?? rfq.status,
    },
  })
  const { pageRows, paginationProps, refresh } = table

  // Item 12: procurement setup renders as a full page, not as a modal over
  // the list. The abstract, history and bid-opening dialogs stay modals —
  // brief views and short confirmations are what modals are for.
  if (creating) {
    return (
      <DashboardPage>
        <CreateRfqModal onClose={() => setCreating(false)} onCreated={() => { refresh(); setMessage('RFQ / ITB draft created. Review the schedule and procurement details before publication.') }} />
      </DashboardPage>
    )
  }

  if (scheduleFor) return <DashboardPage><ScheduleWorkspace rfq={scheduleFor} onClose={() => setScheduleFor(null)} onChanged={(result) => { refresh(); setMessage(result?.message ?? 'Procurement preparation updated.') }} /></DashboardPage>

  return (
    <DashboardPage>
      <PageHeader
        title="Request for Quotation (RFQ) / Invitation to Bid (ITB) Management"
        subtitle="Advertise approved requisitions, close submission, and open bids."
        actions={
          canPublish && <Button icon={Plus} onClick={() => setCreating(true)}>
            NEW RFQ / ITB
          </Button>
        }
      />
      {message && <p role="status" className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{message}</p>}

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Procurements" icon={Megaphone} bodyClassName="">
        {(
          <div className="border-b border-border-muted p-4">
            <TableToolbar {...table.toolbarProps} searchPlaceholder="Search reference or title…" />
          </div>
        )}
        {table.loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading procurements…</p>
        ) : table.failed ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] text-danger">Could not load procurements.</p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={refresh}>Try again</Button>
          </div>
        ) : table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {!table.isDirty
              ? 'Nothing advertised yet. Create one from an approved requisition.'
              : 'No procurements match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('referenceNo')}>Reference</SortableTh>
                  <SortableTh {...table.sortProps('title')}>Title</SortableTh>
                  <Th>Mode</Th>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <SortableTh {...table.sortProps('closingDate')}>Closing</SortableTh>
                  <SortableTh {...table.sortProps('openingDate')}>Bid opening</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th className="min-w-[12rem]">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((rfq) => (
                  <tr key={rfq.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">
                      {rfq.referenceNo}
                      <span className="mt-1 block text-[11px] text-text-faint">Attempt #{rfq.attemptNumber ?? 1}</span>
                      {!rfq.postingRequired && (
                        <span className="ml-2">
                          <Badge tone="neutral">No posting req.</Badge>
                        </span>
                      )}
                      {rfq.prebidRequired && (
                        <span className="ml-2">
                          <Badge tone="warning">Pre-bid required</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-navy">{rfq.title}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{rfq.modeName}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">{peso(rfq.abc)}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {new Date(rfq.closingDate).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{rfq.openingDate ? new Date(rfq.openingDate).toLocaleString() : 'Schedule required before publication'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={RFQ_STATUS_TONES[rfq.status]}>{rfq.statusLabel ?? (rfq.status === 'failed' ? `Failed — Attempt #${rfq.attemptNumber ?? 1}` : RFQ_STATUS_LABELS[rfq.status])}</Badge>
                      <NextInline next={rfqNext(rfq)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[12rem] flex-wrap items-center gap-1.5">
                        <Button size="table" variant="secondary" onClick={() => setHistoryFor(rfq)}>History / next action</Button>
                        <Button size="table" variant="secondary" onClick={() => setScheduleFor(rfq)}>Schedule / criteria</Button>
                        {canPublish && rfq.status === 'draft' && (
                          <Button
                            size="table"
                            variant="success"
                            disabled={!rfq.scheduleApprovedAt}
                            title={!rfq.scheduleApprovedAt ? 'Approve the official schedule before publication.' : 'Publish the approved procurement'}
                            onClick={() => run(() => biddingApi.publishRfq(rfq.id), 'RFQ / ITB published. Bid submission is open until the recorded deadline.')}
                          >
                            Publish
                          </Button>
                        )}
                        {canPublish && rfq.status === 'published' && (
                          <Button
                            size="table"
                            variant="warning"
                            onClick={() => run(() => biddingApi.closeRfq(rfq.id), rfq.modeKey === 'smallValueProcurement'
                              ? 'Quotation submissions closed. Open quotations at the recorded opening date and time.'
                              : 'Bid submission closed. Open bids at the recorded opening date and time.')}
                          >
                            Close submissions
                          </Button>
                        )}
                        {canPublish && rfq.status === 'closed' && (
                          <Button
                            size="table"
                            variant="primary"
                            icon={Inbox}
                            onClick={() => setOpening(rfq)}
                          >
                            {rfq.modeKey === 'smallValueProcurement' ? 'Open quotations' : 'Open bids'}
                          </Button>
                        )}
                        {canHopeWithdraw && ['published', 'closed', 'opened', 'evaluated'].includes(rfq.status) && (
                          <Button size="table" variant="warning" onClick={() => setWithdrawalFor(rfq)}>Review withdrawal</Button>
                        )}

                        {/* SVP quotations appear after their recorded opening;
                            other modes keep the existing disclosure timing. */}
                        {(
                          rfq.modeKey === 'smallValueProcurement'
                            ? ['opened', 'evaluated', 'awarded', 'cancelled'].includes(rfq.status)
                            : rfq.status !== 'draft' && rfq.status !== 'published'
                        ) && (
                          <Button
                            size="table"
                            variant="info"
                            icon={Table2}
                            onClick={() => setAbstractFor(rfq)}
                          >
                            {rfq.modeKey === 'smallValueProcurement' ? 'Abstract of quotations' : 'Abstract of bids'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="solicitations" />
      </Card>

      {historyFor && <AttemptHistoryModal rfq={historyFor} onClose={() => setHistoryFor(null)} onChanged={(result) => { refresh(); setMessage(result?.message ?? 'Procurement history updated. Review the next action for the current attempt.') }} />}

      {withdrawalFor && <HopeWithdrawalModal rfq={withdrawalFor} onClose={() => setWithdrawalFor(null)} onOpenAbstract={() => { setAbstractFor(withdrawalFor); setWithdrawalFor(null) }} onSaved={(result) => { refresh(); setMessage(result.message) }} />}

      {abstractFor && (
        <AbstractOfBidsModal rfq={abstractFor} onClose={() => setAbstractFor(null)} />
      )}

      {opening && (
        <Modal title={`${opening.modeKey === 'smallValueProcurement' ? 'Open quotations' : 'Open bids'} — ${opening.referenceNo}`} onClose={() => setOpening(null)}>
          <div className="mb-4 flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
            <Info size={14} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-xs text-text-secondary">
              {opening.modeKey === 'smallValueProcurement'
                ? 'Record the quotation opening and witnesses. The Abstract of Quotations will then show each respondent and quoted price for BAC review.'
                : 'Bid opening must be witnessed per BAC rules. The record is written to the audit trail, and each bid is assigned an anonymous label for blind evaluation.'}
            </p>
          </div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Witnesses present
          </label>
          <input
            type="text"
            value={witnesses}
            onChange={(event) => setWitnesses(event.target.value)}
            placeholder="e.g. COA Representative, Private Sector Observer"
            className="min-h-11 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setOpening(null)}>
              CANCEL
            </Button>
            <button
              type="button"
              onClick={async () => {
                const succeeded = await run(() => biddingApi.openBids(opening.id, { witnesses }), opening.modeKey === 'smallValueProcurement'
                  ? 'Quotations opened. Review the Abstract of Quotations, then continue to TWG technical assessment.'
                  : 'Bids opened. The TWG may now record its conflict-of-interest declarations and technical assessments.')
                if (!succeeded) return
                setOpening(null)
                setWitnesses('')
              }}
              className="min-h-11 w-full rounded-sm bg-accent px-4 py-2 text-center text-[11px] font-medium tracking-[0.03em] text-accent-fg sm:w-auto"
            >
              {opening.modeKey === 'smallValueProcurement' ? 'OPEN QUOTATIONS' : 'OPEN BIDS'}
            </button>
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}
