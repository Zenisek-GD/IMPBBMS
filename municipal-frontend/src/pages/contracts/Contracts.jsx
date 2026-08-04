import { useEffect, useState, useCallback } from 'react'
import { FileSignature, Plus, Truck, PenLine, Send } from 'lucide-react'
import * as contractsApi from '../../api/contracts'
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES } from '../../api/contracts'
import { fetchAwards } from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function DraftModal({ onClose, onCreated }) {
  const [awards, setAwards] = useState([])
  const [form, setForm] = useState({ awardId: '', deliveryDeadline: '', terms: '', poRef: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAwards()
      .then((data) => {
        if (!cancelled) setAwards(data.filter((award) => award.status === 'issued'))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Modal title="Draft contract" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Issued award
          </label>
          <select
            value={form.awardId}
            onChange={(event) => setForm({ ...form, awardId: event.target.value })}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">Select an issued award...</option>
            {awards.map((award) => (
              <option key={award.id} value={award.id}>
                {award.noaNumber} — {award.vendorName} — {peso(award.amount)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              PO reference
            </label>
            <input
              type="text"
              value={form.poRef}
              onChange={(event) => setForm({ ...form, poRef: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Delivery deadline
            </label>
            <input
              type="date"
              value={form.deliveryDeadline}
              onChange={(event) => setForm({ ...form, deliveryDeadline: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Terms</label>
          <textarea
            rows={3}
            value={form.terms}
            onChange={(event) => setForm({ ...form, terms: event.target.value })}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
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
            disabled={saving || !form.awardId}
            onClick={async () => {
              setError('')
              setSaving(true)
              try {
                await contractsApi.createContract({ ...form, awardId: Number(form.awardId) })
                onCreated()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not draft the contract.')
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'DRAFTING...' : 'DRAFT CONTRACT'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DeliveryModal({ contract, onClose, onReported }) {
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  return (
    <Modal title={`Report delivery — ${contract.contractNo}`} onClose={onClose}>
      <p className="mb-3 text-[13px] text-text-secondary">
        The General Services Office inspects and accepts before an invoice can be raised.
      </p>
      <textarea
        rows={3}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What was delivered, and where?"
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <button
          type="button"
          onClick={async () => {
            try {
              await contractsApi.reportDelivery(contract.id, { description })
              onReported()
              onClose()
            } catch (err) {
              setError(err.response?.data?.message ?? 'Could not report the delivery.')
            }
          }}
          className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg"
        >
          REPORT DELIVERY
        </button>
      </div>
    </Modal>
  )
}

export default function Contracts() {
  const permissions = usePermissions()
  const [contracts, setContracts] = useState([])
  const [drafting, setDrafting] = useState(false)
  const [delivering, setDelivering] = useState(null)
  const [actionError, setActionError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    contractsApi
      .fetchContracts()
      .then((data) => {
        if (!cancelled) setContracts(data)
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

  const canDraft = permissions.has('contract.draft')
  const canSign = permissions.hasAny('contract.sign', 'delivery.submitInvoice')
  const isSupplier = permissions.has('delivery.submitInvoice')

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(contracts)

  return (
    <DashboardPage>
      <PageHeader
        title="Contracts"
        subtitle="Drafted from an issued award; active once both parties have signed."
        actions={
          canDraft && (
            <Button icon={Plus} onClick={() => setDrafting(true)}>
              DRAFT CONTRACT
            </Button>
          )
        }
      />

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Contracts" icon={FileSignature} bodyClassName="">
        {contracts.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">No contracts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Contract', 'Project', 'Supplier', 'Amount', 'Signatures', 'Status', 'Actions'].map((head) => (
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
                {pageRows.map((contract) => (
                  <tr key={contract.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">
                      {contract.contractNo}
                      {contract.noaNumber && (
                        <p className="mt-0.5 text-[11px] text-text-faint">{contract.noaNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-navy">{contract.projectTitle ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{contract.vendorName}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">
                      {peso(contract.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Badge tone={contract.signedByLguAt ? 'success' : 'neutral'}>
                          LGU {contract.signedByLguAt ? '✓' : '—'}
                        </Badge>
                        <Badge tone={contract.signedByVendorAt ? 'success' : 'neutral'}>
                          Supplier {contract.signedByVendorAt ? '✓' : '—'}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={CONTRACT_STATUS_TONES[contract.status]}>
                        {CONTRACT_STATUS_LABELS[contract.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {canDraft && contract.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => run(() => contractsApi.issueForSignature(contract.id))}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <Send size={12} /> ISSUE
                          </button>
                        )}
                        {canSign &&
                          contract.status === 'pendingSignatures' &&
                          !(isSupplier ? contract.signedByVendorAt : contract.signedByLguAt) && (
                            <button
                              type="button"
                              onClick={() => run(() => contractsApi.signContract(contract.id))}
                              className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                            >
                              <PenLine size={12} /> SIGN
                            </button>
                          )}
                        {isSupplier && contract.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => setDelivering(contract)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <Truck size={12} /> REPORT DELIVERY
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
        <Pagination {...paginationProps} label="contracts" />
      </Card>

      {drafting && <DraftModal onClose={() => setDrafting(false)} onCreated={refresh} />}
      {delivering && (
        <DeliveryModal contract={delivering} onClose={() => setDelivering(null)} onReported={refresh} />
      )}
    </DashboardPage>
  )
}
