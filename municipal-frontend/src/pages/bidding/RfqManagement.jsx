import { useEffect, useState, useCallback } from 'react'
import { Megaphone, Plus, Inbox, Info, Table2 } from 'lucide-react'
import * as biddingApi from '../../api/bidding'
import { RFQ_STATUS_LABELS, RFQ_STATUS_TONES } from '../../api/bidding'
import { fetchPrs } from '../../api/purchaseRequisitions'
import DashboardPage from '../../components/ui/DashboardPage'
import WorkHoursDateTimeInput from '../../components/ui/WorkHoursDateTimeInput'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function CreateRfqModal({ onClose, onCreated }) {
  const [prs, setPrs] = useState([])
  const [form, setForm] = useState({ prHeaderId: '', title: '', category: 'goods', closingDate: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
    <Modal title="New RFQ / ITB" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Approved requisition
          </label>
          <select
            value={form.prHeaderId}
            onChange={(event) => setForm({ ...form, prHeaderId: event.target.value })}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
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

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Closing date
            </label>
            <WorkHoursDateTimeInput
              value={form.closingDate}
              onChange={(event) => setForm({ ...form, closingDate: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
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
            disabled={saving || !form.prHeaderId || !form.closingDate}
            onClick={async () => {
              setError('')
              setSaving(true)
              try {
                await biddingApi.createRfq({ ...form, prHeaderId: Number(form.prHeaderId) })
                onCreated()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not create the RFQ.')
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'CREATING...' : 'CREATE DRAFT'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── ABSTRACT OF BIDS (RA 12009 IRR Sec. 43) ──────────────────────────────────
// The tabulation of who responded and at what — one of the documents observers
// are entitled to demand, and the one they sign as witnesses.
//
// Two things this screen must not do, both enforced by the API and reflected
// here rather than worked around:
//
//   · While evaluation is blind, bidders appear as their blind label and prices
//     are withheld. Showing a name here would defeat the point of the labels.
//   · A financial envelope stays sealed until the technical component passes
//     (Sec. 58), so a bid can legitimately have no price to show yet. That is
//     rendered as "sealed", not as a blank, because the two mean different
//     things to anyone reading the abstract.
function AbstractOfBidsModal({ rfq, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

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
    <Modal title={`Abstract of Bids — ${rfq.referenceNo}`} onClose={onClose}>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !data && <p className="text-[13px] text-text-faint">Loading…</p>}

      {data && (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-border-muted bg-sidebar px-4 py-3 text-[12.5px]">
            <dt className="text-text-secondary">Project</dt>
            <dd className="text-right font-medium text-navy">{data.title}</dd>
            <dt className="text-text-secondary">Approved Budget (ABC)</dt>
            <dd className="text-right font-medium text-navy">{peso(data.abc)}</dd>
            <dt className="text-text-secondary">Mode</dt>
            <dd className="text-right text-navy">{data.mode ?? '—'}</dd>
            <dt className="text-text-secondary">Bids opened</dt>
            <dd className="text-right text-navy">
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

          <div className="overflow-x-auto rounded border border-border-muted">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <Th>Bidder</Th>
                  <Th>Bid price</Th>
                  <Th>Rating</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-text-faint">
                      No bids were received.
                    </td>
                  </tr>
                ) : (
                  data.entries.map((entry) => (
                    <tr key={entry.blindLabel} className="border-t border-border-muted">
                      <td className="px-4 py-2.5 text-[13px] text-navy">
                        {entry.bidderName ?? entry.blindLabel}
                        {!data.blind && entry.blindLabel && (
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
            {data.bidsReceived} bid{data.bidsReceived === 1 ? '' : 's'} received, closing{' '}
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
                    <p className="text-[13px] text-navy">{witness.representative ?? '—'}</p>
                    <p className="text-[11.5px] text-text-faint">{witness.organization}</p>
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
  const [rfqs, setRfqs] = useState([])
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(null)
  const [abstractFor, setAbstractFor] = useState(null)
  const [witnesses, setWitnesses] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    biddingApi
      .fetchRfqs()
      .then((data) => {
        if (!cancelled) setRfqs(data)
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

  // Sorting by closing date is the one this office needs most: it is the order
  // in which the work becomes urgent.
  const table = useTableControls(rfqs, {
    searchKeys: ['referenceNo', 'title', 'modeName'],
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(RFQ_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
      { key: 'modeName', label: 'All modes' },
      {
        key: 'prebidRequired',
        label: 'Pre-bid conference',
        options: [
          { value: 'true', label: 'Pre-bid required' },
          { value: 'false', label: 'No pre-bid' },
        ],
        accessor: (rfq) => String(Boolean(rfq.prebidRequired)),
      },
    ],
    accessors: {
      abc: (rfq) => Number(rfq.abc ?? 0),
      status: (rfq) => RFQ_STATUS_LABELS[rfq.status] ?? rfq.status,
    },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title="RFQ / ITB Management"
        subtitle="Advertise approved requisitions, close submission, and open bids."
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            NEW RFQ / ITB
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Procurements" icon={Megaphone} bodyClassName="">
        {rfqs.length > 0 && (
          <div className="border-b border-border-muted p-4">
            <TableToolbar {...table.toolbarProps} searchPlaceholder="Search reference, title or mode…" />
          </div>
        )}
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'Nothing advertised yet. Create one from an approved requisition.'
              : 'No procurements match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('referenceNo')}>Reference</SortableTh>
                  <SortableTh {...table.sortProps('title')}>Title</SortableTh>
                  <SortableTh {...table.sortProps('modeName')}>Mode</SortableTh>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <SortableTh {...table.sortProps('closingDate')}>Closing</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((rfq) => (
                  <tr key={rfq.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">
                      {rfq.referenceNo}
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
                    <td className="px-4 py-3">
                      <Badge tone={RFQ_STATUS_TONES[rfq.status]}>{RFQ_STATUS_LABELS[rfq.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {rfq.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => run(() => biddingApi.publishRfq(rfq.id))}
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            PUBLISH
                          </button>
                        )}
                        {rfq.status === 'published' && (
                          <button
                            type="button"
                            onClick={() => run(() => biddingApi.closeRfq(rfq.id))}
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            CLOSE
                          </button>
                        )}
                        {rfq.status === 'closed' && (
                          <button
                            type="button"
                            onClick={() => setOpening(rfq)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <Inbox size={12} /> OPEN BIDS
                          </button>
                        )}

                        {/* The abstract is prepared after submission closes, so
                            it is offered from that point on — including after
                            award, since it stays part of the record. */}
                        {rfq.status !== 'draft' && rfq.status !== 'published' && (
                          <button
                            type="button"
                            onClick={() => setAbstractFor(rfq)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <Table2 size={12} /> ABSTRACT OF BIDS
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
        <Pagination {...paginationProps} label="solicitations" />
      </Card>

      {creating && <CreateRfqModal onClose={() => setCreating(false)} onCreated={refresh} />}

      {abstractFor && (
        <AbstractOfBidsModal rfq={abstractFor} onClose={() => setAbstractFor(null)} />
      )}

      {opening && (
        <Modal title={`Open bids — ${opening.referenceNo}`} onClose={() => setOpening(null)}>
          <div className="mb-4 flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
            <Info size={14} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-xs text-text-secondary">
              Bid opening must be witnessed per BAC rules. The record is written to the audit trail, and each bid
              is assigned an anonymous label for blind evaluation.
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
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpening(null)}>
              CANCEL
            </Button>
            <button
              type="button"
              onClick={async () => {
                await run(() => biddingApi.openBids(opening.id, { witnesses }))
                setOpening(null)
                setWitnesses('')
              }}
              className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg"
            >
              OPEN BIDS
            </button>
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}
