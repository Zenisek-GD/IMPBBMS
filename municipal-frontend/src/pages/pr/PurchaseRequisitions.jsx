import { useEffect, useState, useCallback } from 'react'
import { Plus, FileText, Trash2, AlertTriangle, Wallet, Gavel, Info, Eye, Check } from 'lucide-react'
import * as prApi from '../../api/purchaseRequisitions'
import {
  PR_STATUS_LABELS,
  PR_STATUS_TONES,
  PR_STAGE_SEQUENCE,
  PR_TRANSITION_FOR_STATUS,
  PR_RETURN_PERMISSION_FOR_STATUS,
  ASSET_CLASS_LABELS,
  ASSET_CLASS_TONES,
} from '../../api/purchaseRequisitions'
import { fetchAppEntries } from '../../api/appEntries'
import { fetchSettings } from '../../api/settings'
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

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const emptyLine = () => ({
  description: '',
  unit: '',
  quantity: '',
  unitCost: '',
  hasUsefulLifeOverOneYear: false,
})

// Mirrors classifyLineItem() on the server so the requester sees the
// consequence of ticking the box before saving. The server's answer is the one
// that is stored — this is a preview, not a second source of truth.
const previewAssetClass = (line, threshold) => {
  if (!line.hasUsefulLifeOverOneYear) return 'expense'
  return Number(line.unitCost || 0) >= threshold ? 'capitalOutlay' : 'semiExpendable'
}

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
  const [threshold, setThreshold] = useState(50000)
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  // The capitalisation threshold is configuration, not a constant — read it
  // rather than hardcoding ₱50,000 here, or the preview would go stale the day
  // COA moves it and the admin updates the setting.
  useEffect(() => {
    let cancelled = false
    fetchSettings()
      .then((data) => {
        if (!cancelled && data?.lgu?.capitalizationThreshold) {
          setThreshold(Number(data.lgu.capitalizationThreshold))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
          // The classification itself is derived server-side; what the form
          // sends is the only part it can know — whether the item lasts.
          hasUsefulLifeOverOneYear: Boolean(line.hasUsefulLifeOverOneYear),
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

          <div className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const assetClass = previewAssetClass(line, threshold)
              return (
                <div key={index} className="rounded border border-border-muted/70 p-2">
                  <div className="grid grid-cols-12 items-center gap-2">
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

                  {/* Useful life is the question only the requester can answer,
                      and it is what decides whether the item is capitalised.
                      The badge shows the consequence as soon as the box is
                      ticked, so nobody discovers the classification at
                      certification. */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 pl-1">
                    <label className="flex items-center gap-2 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={Boolean(line.hasUsefulLifeOverOneYear)}
                        onChange={(event) =>
                          updateLine(index, 'hasUsefulLifeOverOneYear', event.target.checked)
                        }
                      />
                      Useful life over one year
                    </label>
                    <Badge tone={ASSET_CLASS_TONES[assetClass]}>{ASSET_CLASS_LABELS[assetClass]}</Badge>
                    {assetClass === 'capitalOutlay' && (
                      <span className="text-[11px] text-text-faint">
                        At or above {peso(threshold)} per item — must be charged to a Capital Outlay
                        appropriation.
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
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

// ── Step 19: the BAC determines the mode of procurement ──────────────────────
// The committee sees what the IRR ceilings indicate for this ABC *before* it
// chooses, with the citation behind the figure. Departing from the indicated
// mode is allowed — the committee may always fall back to competitive bidding,
// and an alternative mode may rest on grounds the amount alone cannot express —
// but the form makes the departure explicit and demands the reason, which is
// the same rule the server enforces.
function ModeDeterminationModal({ pr, onClose, onConfirm }) {
  const [suggestion, setSuggestion] = useState(null)
  const [modeKey, setModeKey] = useState('')
  const [justification, setJustification] = useState('')
  const [hopeApprovalReference, setHopeApprovalReference] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    prApi
      .fetchModeSuggestion(pr.id)
      .then((data) => {
        if (cancelled) return
        setSuggestion(data)
        setModeKey(data.suggested)
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message ?? 'Could not load the thresholds.')
      })
    return () => {
      cancelled = true
    }
  }, [pr.id])

  const chosen = suggestion?.modes?.find((mode) => mode.key === modeKey)
  const departing = Boolean(suggestion && modeKey && modeKey !== suggestion.suggested)

  return (
    <Modal title={`Determine the mode — ${pr.prNumber}`} onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        {!suggestion ? (
          <p className="text-[13px] text-text-faint">Loading the applicable thresholds...</p>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
              <Info size={14} className="mt-0.5 shrink-0 text-navy" />
              <div className="text-xs text-text-secondary">
                <p>
                  ABC <strong className="text-navy">{peso(suggestion.abc)}</strong> — for a{' '}
                  {suggestion.lgu.incomeClass} class {suggestion.lgu.type}, the thresholds indicate{' '}
                  <strong className="text-navy">
                    {suggestion.modes.find((m) => m.key === suggestion.suggested)?.name ?? suggestion.suggested}
                  </strong>
                  .
                </p>
                <p className="mt-1">{suggestion.rationale}</p>
                <p className="mt-1 text-text-faint">{suggestion.citation}</p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                Mode of procurement resolved by the committee
              </label>
              <select
                value={modeKey}
                onChange={(event) => setModeKey(event.target.value)}
                className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              >
                {suggestion.modes.map((mode) => (
                  <option key={mode.key} value={mode.key}>
                    {mode.name} — {mode.citation}
                    {mode.isSuggested ? ' (indicated)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {departing && (
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                  Why the committee departed from the indicated mode (required)
                </label>
                <textarea
                  rows={3}
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
                />
              </div>
            )}

            {chosen?.requiresHopeApproval && (
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                  Prior approval of the Head of the Procuring Entity — reference (required)
                </label>
                <input
                  value={hopeApprovalReference}
                  onChange={(event) => setHopeApprovalReference(event.target.value)}
                  placeholder="e.g. Office Order No. 2027-114"
                  className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-faint">
                  {chosen.name} cannot be adopted on the committee&apos;s own authority ({chosen.citation}).
                </p>
              </div>
            )}
          </>
        )}

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
            disabled={submitting || !modeKey}
            onClick={async () => {
              setError('')
              setSubmitting(true)
              try {
                await onConfirm({
                  procurementModeKey: modeKey,
                  justification: justification.trim() || undefined,
                  hopeApprovalReference: hopeApprovalReference.trim() || undefined,
                })
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not record the determination.')
              } finally {
                setSubmitting(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {submitting ? 'RECORDING...' : 'RECORD DETERMINATION'}
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

// ── THE REQUISITION, IN FULL ─────────────────────────────────────────────────
// There was no way to open a requisition. The table showed a reference, a total
// and a stage, and every other fact the form carries — what is actually being
// bought, who has signed, which fund it draws on, why the committee chose the
// mode it did — was in the API response and rendered nowhere.
//
// Read-only on purpose. Acting on a requisition happens from the row, where the
// controller has already decided which single transition this officer may make;
// duplicating those buttons here would mean maintaining that decision twice.

// Module scope, not inside the dialog: a component declared during render is a
// new type on every pass, so React unmounts and remounts the whole subtree
// instead of updating it.
const Fact = ({ label, value, mono }) => (
  <div>
    <p className="text-[11.5px] tracking-[0.04em] text-text-faint uppercase">{label}</p>
    <p className={`mt-0.5 text-[13.5px] text-navy ${mono ? 'font-mono text-[12.5px]' : ''}`}>
      {value ?? '—'}
    </p>
  </div>
)

function RequisitionDetail({ pr, onClose }) {
  const stageIndex = PR_STAGE_SEQUENCE.indexOf(pr.status)

  // The four stamps LGC Sec. 344 and the municipal process collect, in the order
  // they are collected. An empty one is as informative as a filled one — it is
  // how a reader sees where the requisition actually is.
  const signatures = [
    ['Treasurer — funds available', pr.cashCertifiedByName, pr.cashCertifiedAt],
    ["Mayor's approval", pr.mayorApprovedByName, pr.mayorApprovedAt],
    ['Budget Office — appropriation', pr.appropriationCertifiedByName, pr.appropriationCertifiedAt],
    ['Accountant — obligation (ORS)', pr.obligatedByName, pr.fundsReservedAt],
  ]

  return (
    <Modal
      title={pr.prNumber}
      subtitle={pr.appEntryTitle ?? 'Purchase requisition'}
      size="xl"
      onClose={onClose}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PR_STATUS_TONES[pr.status]} dot>
            {PR_STATUS_LABELS[pr.status] ?? pr.status}
          </Badge>
          {pr.isEmergency && <Badge tone="danger">Emergency</Badge>}
          {pr.modeDepartedFromSuggestion && <Badge tone="warning">Departs from threshold</Badge>}
        </div>

        {pr.returnRemarks && (
          <p className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-danger">
            <strong>Returned:</strong> {pr.returnRemarks}
          </p>
        )}

        {/* ── Where it is in the chain ──────────────────────────────────── */}
        <section>
          <p className="mb-3 text-[11.5px] tracking-[0.04em] text-text-faint uppercase">Progress</p>
          <ol className="flex flex-col gap-0">
            {PR_STAGE_SEQUENCE.map((stage, index) => {
              const done = stageIndex > index || pr.status === 'approved'
              const current = stage === pr.status
              return (
                <li key={stage} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        done
                          ? 'bg-success text-white'
                          : current
                            ? 'bg-warning/15 text-warning ring-2 ring-warning/40'
                            : 'bg-track text-text-faint'
                      }`}
                    >
                      {done ? <Check size={11} /> : index + 1}
                    </span>
                    {index < PR_STAGE_SEQUENCE.length - 1 && (
                      <span
                        className={`w-px flex-1 ${done ? 'bg-success/40' : 'bg-border-muted'}`}
                        style={{ minHeight: 18 }}
                      />
                    )}
                  </div>
                  <p
                    className={`pb-3 text-[13px] ${
                      current ? 'font-medium text-navy' : done ? 'text-text-secondary' : 'text-text-faint'
                    }`}
                  >
                    {PR_STATUS_LABELS[stage] ?? stage}
                  </p>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="grid gap-5 border-t border-border-muted pt-5 sm:grid-cols-3">
          <Fact label="Requested by" value={pr.requesterName} />
          <Fact label="Office" value={pr.departmentCode} />
          <Fact label="Date required" value={pr.dateRequired} />
          <Fact label="Total" value={peso(pr.totalAmount)} />
          <Fact label="Fund source" value={pr.fundSourceLabel} />
          <Fact label="APP entry ABC" value={pr.appEntryAbc == null ? null : peso(pr.appEntryAbc)} />
        </section>

        {/* ── The committee's determination ─────────────────────────────── */}
        {pr.procurementModeName && (
          <section className="rounded-md border border-border-muted bg-sidebar p-4">
            <p className="mb-2 text-[11.5px] tracking-[0.04em] text-text-faint uppercase">
              Mode of procurement
            </p>
            <p className="text-[13.5px] font-medium text-navy">{pr.procurementModeName}</p>
            {pr.procurementModeCitation && (
              <p className="mt-0.5 font-mono text-[11.5px] text-text-faint">
                {pr.procurementModeCitation}
              </p>
            )}
            {pr.modeJustification && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-text-secondary">
                {pr.modeJustification}
              </p>
            )}
            {pr.modeDeterminedByName && (
              <p className="mt-2 text-[11.5px] text-text-faint">
                Determined by {pr.modeDeterminedByName}
                {pr.modeDeterminedAt && ` · ${new Date(pr.modeDeterminedAt).toLocaleDateString()}`}
              </p>
            )}
          </section>
        )}

        {/* ── What is being bought ──────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-[11.5px] tracking-[0.04em] text-text-faint uppercase">
            Items ({pr.lineItems?.length ?? 0})
          </p>
          {!pr.lineItems?.length ? (
            <p className="text-[13px] text-text-faint">No line items recorded.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border-muted">
              <table className="w-full text-left">
                <thead className="bg-sidebar">
                  <tr>
                    {['Description', 'Qty', 'Unit cost', 'Total', 'Class'].map((head) => (
                      <th
                        key={head}
                        className="px-4 py-2.5 text-[11px] font-medium tracking-[0.04em] whitespace-nowrap text-text-faint uppercase"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pr.lineItems.map((item) => (
                    <tr key={item.id} className="border-t border-border-muted">
                      <td className="px-4 py-2.5 text-[13px] text-navy">
                        {item.description}
                        {item.unit && (
                          <span className="ml-1.5 text-[11.5px] text-text-faint">({item.unit})</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-text-secondary tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] whitespace-nowrap text-text-secondary tabular-nums">
                        {peso(item.unitCost)}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] whitespace-nowrap text-navy tabular-nums">
                        {peso(item.lineTotal)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={ASSET_CLASS_TONES[item.assetClass]}>
                          {ASSET_CLASS_LABELS[item.assetClass]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Which pot the money must come from. An officer certifying an
              appropriation needs this before anything else on the form. */}
          {pr.assetSummary && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(pr.assetSummary)
                .filter(([, amount]) => amount > 0)
                .map(([assetClass, amount]) => (
                  <span
                    key={assetClass}
                    className="rounded-md border border-border-muted bg-surface px-3 py-1.5 text-[12px] text-text-secondary"
                  >
                    {ASSET_CLASS_LABELS[assetClass]}{' '}
                    <strong className="text-navy tabular-nums">{peso(amount)}</strong>
                  </span>
                ))}
            </div>
          )}
        </section>

        {/* ── Who has signed ────────────────────────────────────────────── */}
        <section className="border-t border-border-muted pt-5">
          <p className="mb-3 text-[11.5px] tracking-[0.04em] text-text-faint uppercase">Signatures</p>
          <div className="grid gap-px overflow-hidden rounded-md border border-border-muted bg-border-muted sm:grid-cols-2">
            {signatures.map(([label, name, at]) => (
              <div key={label} className="bg-surface px-4 py-3">
                <p className="text-[12px] text-text-secondary">{label}</p>
                {name ? (
                  <>
                    <p className="mt-0.5 text-[13px] font-medium text-navy">{name}</p>
                    <p className="text-[11.5px] text-text-faint">
                      {at ? new Date(at).toLocaleString() : ''}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-[13px] text-text-faint">Not yet signed</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}

export default function PurchaseRequisitions() {
  const permissions = usePermissions()
  const [prs, setPrs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [returning, setReturning] = useState(null)
  const [determiningMode, setDeterminingMode] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [actionError, setActionError] = useState('')

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    prApi
      .fetchPrs()
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
  }, [refreshToken])

  const runTransition = async (pr, action, payload) => {
    setActionError('')
    try {
      await prApi.transitionPr(pr.id, action, payload)
      refresh()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Could not update that requisition.')
      throw err
    }
  }

  const canCreate = permissions.has('pr.create')

  // Total sorts on the raw number, not the formatted peso string — "₱90,000"
  // and "₱900" compare the wrong way round as text. Emergency is a filter of
  // its own because "show me only the emergencies" is the question this queue
  // gets asked when something is on fire.
  const table = useTableControls(prs, {
    searchKeys: ['prNumber', 'appEntryTitle', 'fundSourceLabel', 'procurementModeName', 'purpose'],
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(PR_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'isEmergency',
        label: 'Emergency & routine',
        options: [
          { value: 'true', label: 'Emergency only' },
          { value: 'false', label: 'Routine only' },
        ],
        accessor: (pr) => String(Boolean(pr.isEmergency)),
      },
      { key: 'procurementModeName', label: 'All modes' },
    ],
    accessors: {
      totalAmount: (pr) => Number(pr.totalAmount ?? 0),
      status: (pr) => PR_STATUS_LABELS[pr.status] ?? pr.status,
    },
  })
  const { pageRows, paginationProps } = table

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
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search PR number, project or fund…" />
      </Card>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Requisitions" icon={FileText} bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading requisitions...</p>
        ) : table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'No requisitions yet.'
              : 'No requisitions match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('prNumber')}>PR Number</SortableTh>
                  <SortableTh {...table.sortProps('appEntryTitle')}>APP Entry</SortableTh>
                  <SortableTh {...table.sortProps('totalAmount')}>Total</SortableTh>
                  <SortableTh {...table.sortProps('dateRequired')}>Required</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
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
                      <td className="px-4 py-3 text-[13px] text-text-secondary">
                        {pr.appEntryTitle ?? '—'}
                        {/* The two things the later stages stamp on the
                            requisition: which fund pays, and how it will be
                            procured. Both are decisions of record, so they
                            belong in the list rather than behind a click. */}
                        {(pr.fundSourceLabel || pr.procurementModeName) && (
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-faint">
                            {pr.fundSourceLabel && <span>{pr.fundSourceLabel}</span>}
                            {pr.procurementModeName && (
                              <span className="inline-flex items-center gap-1">
                                <Gavel size={11} />
                                {pr.procurementModeName}
                                {pr.modeDepartedFromSuggestion && (
                                  <Badge tone="warning">DEPARTS FROM THRESHOLD</Badge>
                                )}
                              </span>
                            )}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">
                        {peso(pr.totalAmount)}
                        {pr.assetSummary?.capitalOutlay > 0 && (
                          <p className="mt-1 text-[11px] font-normal text-text-faint">
                            incl. {peso(pr.assetSummary.capitalOutlay)} capital outlay
                          </p>
                        )}
                        {pr.assetSummary?.semiExpendable > 0 && (
                          <p className="text-[11px] font-normal text-text-faint">
                            {peso(pr.assetSummary.semiExpendable)} semi-expendable
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">{pr.dateRequired}</td>
                      <td className="px-4 py-3">
                        <Badge tone={PR_STATUS_TONES[pr.status]}>{PR_STATUS_LABELS[pr.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3">
                          {/* First, and available to everyone who can see the
                              row: reading a requisition is not an action on it. */}
                          <button
                            type="button"
                            onClick={() => setViewing(pr)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy uppercase hover:underline"
                          >
                            <Eye size={12} /> View
                          </button>
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
                              onClick={() =>
                                next.opensForm
                                  ? setDeterminingMode(pr)
                                  : runTransition(pr, next.action).catch(() => {})
                              }
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

      {viewing && <RequisitionDetail pr={viewing} onClose={() => setViewing(null)} />}

      {creating && <PrFormModal onClose={() => setCreating(false)} onSaved={refresh} />}
      {editing && <PrFormModal existing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {returning && (
        <ReturnModal
          pr={returning}
          onClose={() => setReturning(null)}
          onConfirm={(remarks) => runTransition(returning, 'return', { remarks })}
        />
      )}
      {determiningMode && (
        <ModeDeterminationModal
          pr={determiningMode}
          onClose={() => setDeterminingMode(null)}
          onConfirm={(payload) => runTransition(determiningMode, 'determineMode', payload)}
        />
      )}
    </DashboardPage>
  )
}
