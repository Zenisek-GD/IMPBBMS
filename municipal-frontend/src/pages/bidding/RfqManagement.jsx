import { useEffect, useState, useCallback } from 'react'
import { Megaphone, Plus, Inbox, Info } from 'lucide-react'
import * as biddingApi from '../../api/bidding'
import { RFQ_STATUS_LABELS, RFQ_STATUS_TONES } from '../../api/bidding'
import { fetchPrs } from '../../api/purchaseRequisitions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

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
            <input
              type="datetime-local"
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

export default function RfqManagement() {
  const [rfqs, setRfqs] = useState([])
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(null)
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

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(rfqs)

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
        {rfqs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            Nothing advertised yet. Create one from an approved requisition.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Reference', 'Title', 'Mode', 'ABC', 'Closing', 'Status', 'Actions'].map((head) => (
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
