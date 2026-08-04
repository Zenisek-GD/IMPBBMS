import { useEffect, useState, useCallback } from 'react'
import { Plus, FileText, Trash2, AlertTriangle, Wallet } from 'lucide-react'
import * as prApi from '../../api/purchaseRequisitions'
import {
  PR_STATUS_LABELS,
  PR_STATUS_TONES,
  PR_TRANSITION_FOR_STATUS,
  PR_RETURN_PERMISSION_FOR_STATUS,
} from '../../api/purchaseRequisitions'
import { fetchAppEntries } from '../../api/appEntries'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const emptyLine = () => ({ description: '', unit: '', quantity: '', unitCost: '' })

function PrFormModal({ existing, onClose, onSaved }) {
  const [appEntries, setAppEntries] = useState([])
  const [appEntryId, setAppEntryId] = useState(existing?.appEntryId ?? '')
  const [purpose, setPurpose] = useState(existing?.purpose ?? '')
  const [dateRequired, setDateRequired] = useState(existing?.dateRequired ?? '')
  const [isEmergency, setIsEmergency] = useState(existing?.isEmergency ?? false)
  const [justification, setJustification] = useState(existing?.justification ?? '')
  const [lines, setLines] = useState(
    existing?.lineItems?.length ? existing.lineItems.map((l) => ({ ...l })) : [emptyLine()]
  )
  const [balance, setBalance] = useState(null)
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  // Only approved/locked APP entries may be linked (Section 5.3).
  useEffect(() => {
    let cancelled = false
    fetchAppEntries()
      .then((entries) => {
        if (!cancelled) setAppEntries(entries.filter((e) => ['approved', 'locked'].includes(e.status)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Section 5.3: remaining APP balance is shown in real time as PRs are drafted.
  useEffect(() => {
    if (!appEntryId) return
    let cancelled = false
    prApi
      .fetchAppBalance(appEntryId, existing?.id)
      .then((result) => {
        if (!cancelled) setBalance(result)
      })
      .catch(() => {
        if (!cancelled) setBalance(null)
      })
    return () => {
      cancelled = true
    }
  }, [appEntryId, existing?.id])

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0
  )
  const overBudget = balance !== null && total > balance.remaining

  const updateLine = (index, field, value) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [field]: value } : line)))

  const save = async () => {
    setServerError('')
    setSaving(true)
    try {
      const payload = {
        appEntryId: Number(appEntryId),
        purpose,
        dateRequired,
        isEmergency,
        justification,
        lineItems: lines.map((line) => ({
          description: line.description,
          unit: line.unit,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      }
      if (existing) await prApi.updatePr(existing.id, payload)
      else await prApi.createPr(payload)
      onSaved()
      onClose()
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={existing ? `Edit ${existing.prNumber}` : 'New Purchase Requisition'} onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Linked APP entry (approved only)
          </label>
          <select
            value={appEntryId}
            onChange={(event) => setAppEntryId(event.target.value)}
            disabled={Boolean(existing)}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy disabled:bg-sidebar focus:border-navy focus:outline-none"
          >
            <option value="">Select an approved APP entry...</option>
            {appEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.projectTitle} — ABC {peso(entry.abc)}
              </option>
            ))}
          </select>
        </div>

        {balance && (
          <div
            className={`flex items-start gap-2 rounded border p-3 ${
              overBudget ? 'border-danger/30 bg-danger/10' : 'border-navy/10 bg-chip/40'
            }`}
          >
            <Wallet size={14} className={`mt-0.5 shrink-0 ${overBudget ? 'text-danger' : 'text-navy'}`} />
            <div className="text-xs">
              <p className="text-text-secondary">
                APP balance: <strong className="text-navy">{peso(balance.remaining)}</strong> remaining of{' '}
                {peso(balance.abc)} ({peso(balance.committed)} already committed)
              </p>
              <p className={`mt-0.5 font-medium ${overBudget ? 'text-danger' : 'text-success'}`}>
                This requisition: {peso(total)}
                {overBudget ? ' — exceeds the remaining balance' : ' — within balance'}
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Purpose</label>
          <textarea
            rows={2}
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Date required
            </label>
            <input
              type="date"
              value={dateRequired}
              onChange={(event) => setDateRequired(event.target.value)}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 pb-3 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={isEmergency}
              onChange={(event) => setIsEmergency(event.target.checked)}
            />
            Emergency requisition
          </label>
        </div>

        {!isEmergency && (
          <p className="flex items-start gap-2 text-xs text-text-faint">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Non-emergency requisitions must be dated at least 15 days out. Checked at submission, not while drafting.
          </p>
        )}

        {isEmergency && (
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Emergency justification (minimum 30 characters)
            </label>
            <textarea
              rows={2}
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-faint">{justification.trim().length} / 30 characters</p>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium tracking-[0.02em] text-text-secondary">Line items</label>
            <button
              type="button"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
            >
              + ADD LINE
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-12 items-center gap-2">
                <input
                  placeholder="Description"
                  value={line.description}
                  onChange={(event) => updateLine(index, 'description', event.target.value)}
                  className="col-span-5 rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
                />
                <input
                  placeholder="Unit"
                  value={line.unit ?? ''}
                  onChange={(event) => updateLine(index, 'unit', event.target.value)}
                  className="col-span-2 rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, 'quantity', event.target.value)}
                  className="col-span-2 rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="Unit cost"
                  value={line.unitCost}
                  onChange={(event) => updateLine(index, 'unitCost', event.target.value)}
                  className="col-span-2 rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                  aria-label="Remove line"
                  className="col-span-1 text-text-faint hover:text-danger disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <p className="mt-3 text-right text-sm font-bold text-navy">Total: {peso(total)}</p>
        </div>

        {serverError && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !appEntryId}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'SAVING...' : 'SAVE DRAFT'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ReturnModal({ pr, onClose, onConfirm }) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')

  return (
    <Modal title={`Return ${pr.prNumber}`} onClose={onClose}>
      <p className="mb-3 text-sm text-text-secondary">Remarks are required and go back to the requester.</p>
      <textarea
        rows={3}
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
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
              await onConfirm(remarks)
              onClose()
            } catch (err) {
              setError(err.response?.data?.message ?? 'Could not return it.')
            }
          }}
          className="rounded-sm bg-danger px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-white"
        >
          RETURN
        </button>
      </div>
    </Modal>
  )
}

export default function PurchaseRequisitions() {
  const permissions = usePermissions()
  const [prs, setPrs] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [returning, setReturning] = useState(null)
  const [actionError, setActionError] = useState('')

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    prApi
      .fetchPrs(statusFilter ? { status: statusFilter } : {})
      .then((data) => {
        if (!cancelled) {
          setPrs(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [statusFilter, refreshToken])

  const runTransition = async (pr, action, remarks) => {
    setActionError('')
    try {
      await prApi.transitionPr(pr.id, action, remarks)
      refresh()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Could not update that requisition.')
      throw err
    }
  }

  const canCreate = permissions.has('pr.create')

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(prs)

  return (
    <DashboardPage>
      <PageHeader
        title="Purchase Requisitions"
        subtitle="Each requisition draws against an approved APP entry's remaining balance."
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              NEW REQUISITION
            </Button>
          )
        }
      />

      <Card bodyClassName="p-4">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
        >
          <option value="">All statuses</option>
          {Object.entries(PR_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Card>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Requisitions" icon={FileText} bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading requisitions...</p>
        ) : prs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">No requisitions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['PR Number', 'APP Entry', 'Total', 'Required', 'Status', 'Actions'].map((head) => (
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
                {pageRows.map((pr) => {
                  const next = PR_TRANSITION_FOR_STATUS[pr.status]
                  // A null permission means the server decides (endorsement).
                  const canAdvance = next && (next.permission === null || permissions.has(next.permission))
                  const returnPermission = PR_RETURN_PERMISSION_FOR_STATUS[pr.status]
                  const canReturn = returnPermission && permissions.has(returnPermission)

                  return (
                    <tr key={pr.id} className="border-t border-border-muted">
                      <td className="px-4 py-3 font-mono text-xs text-navy">
                        {pr.prNumber}
                        {pr.isEmergency && (
                          <span className="ml-2">
                            <Badge tone="danger">EMERGENCY</Badge>
                          </span>
                        )}
                        {pr.returnRemarks && <p className="mt-1 text-xs text-danger">Returned: {pr.returnRemarks}</p>}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{pr.appEntryTitle ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">{peso(pr.totalAmount)}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">{pr.dateRequired}</td>
                      <td className="px-4 py-3">
                        <Badge tone={PR_STATUS_TONES[pr.status]}>{PR_STATUS_LABELS[pr.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3">
                          {pr.editable && canCreate && (
                            <button
                              type="button"
                              onClick={() => setEditing(pr)}
                              className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                            >
                              EDIT
                            </button>
                          )}
                          {canAdvance && (
                            <button
                              type="button"
                              onClick={() => runTransition(pr, next.action).catch(() => {})}
                              className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                            >
                              {next.label}
                            </button>
                          )}
                          {canReturn && (
                            <button
                              type="button"
                              onClick={() => setReturning(pr)}
                              className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                            >
                              RETURN
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="requisitions" />
      </Card>

      {creating && <PrFormModal onClose={() => setCreating(false)} onSaved={refresh} />}
      {editing && <PrFormModal existing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {returning && (
        <ReturnModal
          pr={returning}
          onClose={() => setReturning(null)}
          onConfirm={(remarks) => runTransition(returning, 'return', remarks)}
        />
      )}
    </DashboardPage>
  )
}
