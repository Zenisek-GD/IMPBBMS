import { useEffect, useState, useCallback } from 'react'
import { FileSignature, Plus, Truck, PenLine, Send, GitBranch, ShieldCheck } from 'lucide-react'
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
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

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

// ── VARIATION ORDER (RA 12009 Sec. 71) ───────────────────────────────────────
// The ceiling is ten percent of the ORIGINAL contract price, cumulative across
// every variation — not ten percent of the current amount, which a previous
// variation has already moved. The remaining headroom is shown before anything
// is typed, because an officer who only learns the limit from a rejection has
// already written the justification.
//
// Everything here is a courtesy: the server enforces the ceiling, the minimum
// justification and the performance-security top-up regardless of what this
// form allows through.
const VARIATION_CEILING_RATE = 0.1

function VariationOrderModal({ contract, onClose, onIssued }) {
  const [amount, setAmount] = useState('')
  const [justification, setJustification] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const original = Number(contract.originalAmount ?? contract.amount)
  const issued = Number(contract.variationTotal ?? 0)
  const ceiling = original * VARIATION_CEILING_RATE
  const headroom = ceiling - Math.abs(issued)

  const delta = Number(amount)
  const wouldTotal = issued + (Number.isFinite(delta) ? delta : 0)
  const overCeiling = Math.abs(wouldTotal) > ceiling
  const tooShort = justification.trim().length > 0 && justification.trim().length < 30

  return (
    <Modal title={`Variation order — ${contract.contractNo}`} onClose={onClose}>
      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-border-muted bg-sidebar px-4 py-3 text-[12.5px]">
        <dt className="text-text-secondary">Original contract price</dt>
        <dd className="text-right font-medium text-navy">{peso(original)}</dd>
        <dt className="text-text-secondary">Variations issued so far</dt>
        <dd className="text-right font-medium text-navy">{peso(issued)}</dd>
        <dt className="text-text-secondary">Ceiling (10% of original)</dt>
        <dd className="text-right font-medium text-navy">{peso(ceiling)}</dd>
        <dt className="font-medium text-navy">Remaining headroom</dt>
        <dd className="text-right font-semibold text-accent">{peso(headroom)}</dd>
      </dl>

      <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
        Value of the variation
      </label>
      <input
        type="number"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Negative for a decrease"
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />
      <p className="mt-1.5 text-[11.5px] text-text-faint">
        A decrease is entered as a negative figure. An increase requires the performance security to
        be topped up to cover the enlarged contract first (Sec. 68.1).
      </p>

      <label className="mt-4 mb-1.5 block text-[12.5px] font-medium text-text-secondary">
        Written justification
      </label>
      <textarea
        rows={4}
        value={justification}
        onChange={(event) => setJustification(event.target.value)}
        placeholder="The condition, event or necessity requiring this variation."
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />
      <p className={`mt-1.5 text-[11.5px] ${tooShort ? 'text-warning' : 'text-text-faint'}`}>
        {justification.trim().length} / 30 characters minimum — Sec. 71 requires the reason in
        writing.
      </p>

      {overCeiling && Number.isFinite(delta) && delta !== 0 && (
        <p className="mt-3 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
          This would bring variations to {peso(Math.abs(wouldTotal))}, above the {peso(ceiling)}{' '}
          ceiling. A change beyond ten percent is a new procurement, not a variation.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <button
          type="button"
          disabled={saving || !amount || justification.trim().length < 30 || overCeiling}
          onClick={async () => {
            setSaving(true)
            setError('')
            try {
              await contractsApi.issueVariationOrder(contract.id, {
                amount: delta,
                justification: justification.trim(),
              })
              onIssued()
              onClose()
            } catch (err) {
              setError(err.response?.data?.message ?? 'Could not issue the variation order.')
              setSaving(false)
            }
          }}
          className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'ISSUING…' : 'ISSUE VARIATION ORDER'}
        </button>
      </div>
    </Modal>
  )
}

// ── WARRANTY SECURITY (RA 12009 Sec. 62) ─────────────────────────────────────
// Posted on final acceptance, covering defects that surface after the work is
// taken over. The amount is not the officer's to choose — it is a fixed
// percentage of the contract price, so it is computed and shown rather than
// asked for. The server computes it again and ignores anything sent.
const WARRANTY_RATE = 0.01

function WarrantySecurityModal({ contract, onClose, onPosted }) {
  const [form, setForm] = useState('suretyBond')
  const [referenceNo, setReferenceNo] = useState('')
  const [issuer, setIssuer] = useState('')
  const [warrantyMonths, setWarrantyMonths] = useState(12)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const required = Math.round(Number(contract.amount) * WARRANTY_RATE * 100) / 100

  return (
    <Modal title={`Warranty security — ${contract.contractNo}`} onClose={onClose}>
      <div className="mb-4 flex items-baseline justify-between rounded border border-border-muted bg-sidebar px-4 py-3">
        <span className="text-[12.5px] text-text-secondary">
          Required — 1% of {peso(contract.amount)}
        </span>
        <span className="text-[15px] font-semibold text-navy">{peso(required)}</span>
      </div>

      <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
        Form of security
      </label>
      <select
        value={form}
        onChange={(event) => setForm(event.target.value)}
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      >
        {Object.entries(contractsApi.SECURITY_FORM_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
            Reference number
          </label>
          <input
            value={referenceNo}
            onChange={(event) => setReferenceNo(event.target.value)}
            placeholder="Bond or receipt number"
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
            Issuer
          </label>
          <input
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
            placeholder="Bank or surety company"
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
        </div>
      </div>

      <label className="mt-4 mb-1.5 block text-[12.5px] font-medium text-text-secondary">
        Warranty period (months)
      </label>
      <input
        type="number"
        min={1}
        value={warrantyMonths}
        onChange={(event) => setWarrantyMonths(event.target.value)}
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setError('')
            try {
              await contractsApi.postWarrantySecurity(contract.id, {
                form,
                referenceNo: referenceNo.trim() || undefined,
                issuer: issuer.trim() || undefined,
                warrantyMonths: Number(warrantyMonths),
              })
              onPosted()
              onClose()
            } catch (err) {
              setError(err.response?.data?.message ?? 'Could not post the warranty security.')
              setSaving(false)
            }
          }}
          className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-50"
        >
          {saving ? 'POSTING…' : 'POST WARRANTY SECURITY'}
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
  const [varying, setVarying] = useState(null)
  const [warranting, setWarranting] = useState(null)
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

  // "Awaiting a signature" is the question this page exists to answer, so it is
  // a filter of its own rather than something a reader has to spot by scanning
  // two badges down a column.
  const table = useTableControls(contracts, {
    searchKeys: ['contractNo', 'noaNumber', 'projectTitle', 'vendorName'],
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
      { key: 'vendorName', label: 'All suppliers' },
      {
        key: 'signatures',
        label: 'Signatures',
        options: [
          { value: 'both', label: 'Fully signed' },
          { value: 'lgu', label: 'Awaiting supplier' },
          { value: 'vendor', label: 'Awaiting the LGU' },
          { value: 'none', label: 'Unsigned' },
        ],
        accessor: (contract) => {
          if (contract.signedByLguAt && contract.signedByVendorAt) return 'both'
          if (contract.signedByLguAt) return 'lgu'
          if (contract.signedByVendorAt) return 'vendor'
          return 'none'
        },
      },
    ],
    accessors: {
      amount: (contract) => Number(contract.amount ?? 0),
      status: (contract) => CONTRACT_STATUS_LABELS[contract.status] ?? contract.status,
    },
  })
  const { pageRows, paginationProps } = table

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
        {contracts.length > 0 && (
          <div className="border-b border-border-muted p-4">
            <TableToolbar
              {...table.toolbarProps}
              searchPlaceholder="Search contract, NOA, project or supplier…"
            />
          </div>
        )}
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'No contracts yet.'
              : 'No contracts match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('contractNo')}>Contract</SortableTh>
                  <SortableTh {...table.sortProps('projectTitle')}>Project</SortableTh>
                  <SortableTh {...table.sortProps('vendorName')}>Supplier</SortableTh>
                  <SortableTh {...table.sortProps('amount')}>Amount</SortableTh>
                  <Th>Signatures</Th>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
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

                        {/* Sec. 71 — only against a contract in force, and only
                            for the office that signs contracts. */}
                        {canSign && !isSupplier && contract.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => setVarying(contract)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <GitBranch size={12} /> VARIATION ORDER
                          </button>
                        )}

                        {/* Sec. 62 — posted on final acceptance, so it appears
                            once the contract has run to completion. */}
                        {canSign && !isSupplier && contract.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => setWarranting(contract)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <ShieldCheck size={12} /> WARRANTY SECURITY
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
      {varying && (
        <VariationOrderModal
          contract={varying}
          onClose={() => setVarying(null)}
          onIssued={refresh}
        />
      )}
      {warranting && (
        <WarrantySecurityModal
          contract={warranting}
          onClose={() => setWarranting(null)}
          onPosted={refresh}
        />
      )}
    </DashboardPage>
  )
}
