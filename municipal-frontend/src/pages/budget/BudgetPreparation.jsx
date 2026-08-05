import { useEffect, useState, useCallback } from 'react'
import { Plus, Landmark, Users, Trash2, AlertTriangle, Gavel, CalendarClock } from 'lucide-react'
import * as budgetApi from '../../api/budgetPreparation'
import {
  BUDGET_STAGES,
  BUDGET_STATUS_TONES,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_TONES,
} from '../../api/budgetPreparation'
import { fetchAipEntries } from '../../api/planning'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

// Steps 6 to 14: from an office asking for money to the Sanggunian granting it.
//
// The stepper is the point of this page. Every stage is a different body — the
// offices, the Budget Council, the Planning Office, the Local Finance
// Committee, the Mayor, the Sanggunian, the province — and the single most
// useful thing the screen can say is which of them is holding the budget right
// now, because that is the question everyone in the building is asking.

const peso = (value) => `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const inputClass =
  'w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'

const emptyLine = () => ({
  title: '',
  aipEntryId: '',
  expenseClass: 'mooe',
  fund: 'generalFund',
  proposedAmount: '',
})

function Stepper({ budget }) {
  const currentIndex = BUDGET_STAGES.findIndex((stage) => stage.key === budget.status)

  return (
    <div className="flex flex-wrap gap-1">
      {BUDGET_STAGES.map((stage, index) => {
        const done = currentIndex > index || budget.status === 'enacted'
        const current = currentIndex === index && budget.status !== 'enacted'
        return (
          <div
            key={stage.key}
            className={`flex-1 rounded border px-2 py-1.5 text-[10px] leading-tight ${
              current
                ? 'border-accent bg-accent/10 text-navy'
                : done
                  ? 'border-success/30 bg-success/10 text-text-secondary'
                  : 'border-border-muted text-text-faint'
            }`}
            style={{ minWidth: '92px' }}
          >
            <p className="font-medium">{stage.label}</p>
            <p className="mt-0.5">{stage.body}</p>
          </div>
        )
      })}
    </div>
  )
}

function ProposalForm({ budget, existing, onClose, onSaved }) {
  const [aipEntries, setAipEntries] = useState([])
  const [lines, setLines] = useState(
    existing?.lines?.length
      ? existing.lines.map((l) => ({ ...l, aipEntryId: l.aipEntryId ?? '' }))
      : [emptyLine()]
  )
  const [justification, setJustification] = useState(existing?.justification ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAipEntries({ fiscalYear: budget.fiscalYear })
      .then((rows) => {
        if (!cancelled) setAipEntries(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [budget.fiscalYear])

  const total = lines.reduce((sum, line) => sum + (Number(line.proposedAmount) || 0), 0)
  const ceiling = existing?.growthCeiling ?? null
  const overCeiling = ceiling !== null && total > ceiling

  const updateLine = (index, field, value) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [field]: value } : line)))

  return (
    <Modal title={existing ? `Edit proposal — ${existing.departmentName}` : 'New budget proposal'} onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        {overCeiling && (
          <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-xs text-text-secondary">
              {peso(total)} exceeds the {existing.ceilingGrowthPct}% growth ceiling of {peso(ceiling)} over last
              year&apos;s {peso(existing.previousYearAppropriation)}. This is allowed, but a justification is required
              before it can be submitted — the hearing will ask.
            </p>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium tracking-[0.02em] text-text-secondary">Proposal lines</label>
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
              <div key={index} className="rounded border border-border-muted/70 p-2">
                <div className="grid grid-cols-12 items-center gap-2">
                  <input
                    placeholder="What the office is asking for"
                    value={line.title}
                    onChange={(event) => updateLine(index, 'title', event.target.value)}
                    className="col-span-6 rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
                  />
                  <select
                    value={line.expenseClass}
                    onChange={(event) => updateLine(index, 'expenseClass', event.target.value)}
                    className="col-span-2 rounded border border-border-muted px-2 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
                  >
                    <option value="mooe">MOOE</option>
                    <option value="capitalOutlay">Capital Outlay</option>
                    <option value="personalServices">Personal Services</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={line.proposedAmount}
                    onChange={(event) => updateLine(index, 'proposedAmount', event.target.value)}
                    className="col-span-3 rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
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

                {/* The link back to the investment program. Capital lines that
                    cite nothing are what the Planning Office's consolidation
                    check catches, so the form offers the list up front. */}
                <select
                  value={line.aipEntryId ?? ''}
                  onChange={(event) => updateLine(index, 'aipEntryId', event.target.value)}
                  className="mt-2 w-full rounded border border-border-muted px-3 py-1.5 text-xs text-navy focus:border-navy focus:outline-none"
                >
                  <option value="">No investment programme project (standing cost)</option>
                  {aipEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title} — {peso(entry.estimatedCost)}
                    </option>
                  ))}
                </select>
                {line.expenseClass === 'capitalOutlay' && !line.aipEntryId && (
                  <p className="mt-1 text-[11px] text-warning">
                    A capital outlay request with no investment programme project behind it funds something the LGU
                    never programmed.
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="mt-3 text-right text-sm font-bold text-navy">Total: {peso(total)}</p>
        </div>

        <label className="text-xs text-text-secondary">
          Justification
          <textarea
            rows={3}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>

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
            disabled={saving}
            onClick={async () => {
              setError('')
              setSaving(true)
              try {
                const payload = {
                  executiveBudgetId: budget.id,
                  justification,
                  lines: lines.map((line) => ({
                    title: line.title,
                    expenseClass: line.expenseClass,
                    fund: line.fund ?? 'generalFund',
                    proposedAmount: Number(line.proposedAmount),
                    aipEntryId: line.aipEntryId ? Number(line.aipEntryId) : null,
                  })),
                }
                if (existing) await budgetApi.updateProposal(existing.id, payload)
                else await budgetApi.createProposal(payload)
                onSaved()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not save the proposal.')
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'SAVING...' : 'SAVE DRAFT'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// One form for both the Budget Council's recommendation and the deliberation's
// final figures. They are the same act on different columns: read every line,
// write a number against it, and never above what was asked.
function AmountsForm({ proposal, field, title, onClose, onConfirm }) {
  const [amounts, setAmounts] = useState(
    Object.fromEntries(proposal.lines.map((line) => [line.id, line[field] ?? line.proposedAmount]))
  )
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const total = Object.values(amounts).reduce((sum, value) => sum + (Number(value) || 0), 0)

  return (
    <Modal title={`${title} — ${proposal.departmentName}`} onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <p className="text-xs text-text-faint">
          Enter a figure against every line. Zero is how a line is refused — it stays on the proposal as the record of
          what was asked.
        </p>

        {proposal.lines.map((line) => (
          <div key={line.id} className="grid grid-cols-12 items-center gap-2">
            <span className="col-span-6 text-[13px] text-navy">{line.title}</span>
            <span className="col-span-3 text-right text-xs text-text-faint">
              asked {peso(line.proposedAmount)}
            </span>
            <input
              type="number"
              value={amounts[line.id]}
              onChange={(event) =>
                setAmounts((current) => ({ ...current, [line.id]: event.target.value }))
              }
              className="col-span-3 rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
            />
          </div>
        ))}

        <p className="text-right text-sm font-bold text-navy">
          {peso(total)} of {peso(proposal.proposedTotal)} requested
        </p>

        <label className="text-xs text-text-secondary">
          Notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            onClick={async () => {
              setError('')
              try {
                await onConfirm({
                  amounts: proposal.lines.map((line) => ({
                    lineId: line.id,
                    amount: Number(amounts[line.id]),
                  })),
                  notes: notes.trim() || undefined,
                })
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not record those figures.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg"
          >
            RECORD
          </button>
        </div>
      </div>
    </Modal>
  )
}

// The forms the three form-bearing stages need: the forum's income and ceiling,
// the ordinance number, and the provincial review's outcome.
function StageForm({ budget, stage, options, onClose, onConfirm }) {
  const [values, setValues] = useState({
    estimatedIncome: budget.estimatedIncome ?? '',
    expenditureCeiling: budget.expenditureCeiling ?? '',
    ceilingGrowthPct: budget.ceilingGrowthPct ?? 5,
    ordinanceNo: '',
    ordinanceDate: '',
    provincialReviewOutcome: 'approved',
    provincialRemarks: '',
  })
  const [error, setError] = useState('')
  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }))

  return (
    <Modal title={stage.actionLabel} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {stage.action === 'holdForum' && (
          <>
            <p className="text-xs text-text-faint">
              The Local Finance Committee records what the LGU expects to collect and the ceiling it will spend
              against. A ceiling above the estimated income would not balance (LGC Sec. 324) and is refused.
            </p>
            <label className="text-xs text-text-secondary">
              Estimated income
              <input
                type="number"
                value={values.estimatedIncome}
                onChange={(e) => set('estimatedIncome', e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-text-secondary">
              Expenditure ceiling
              <input
                type="number"
                value={values.expenditureCeiling}
                onChange={(e) => set('expenditureCeiling', e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-text-secondary">
              Growth ceiling over last year (%)
              <input
                type="number"
                value={values.ceilingGrowthPct}
                onChange={(e) => set('ceilingGrowthPct', e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </>
        )}

        {stage.action === 'enactOrdinance' && (
          <>
            <label className="text-xs text-text-secondary">
              Appropriation Ordinance number
              <input
                value={values.ordinanceNo}
                onChange={(e) => set('ordinanceNo', e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-text-secondary">
              Date enacted
              <input
                type="date"
                value={values.ordinanceDate}
                onChange={(e) => set('ordinanceDate', e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </>
        )}

        {stage.action === 'recordProvincialReview' && (
          <>
            <p className="text-xs text-text-faint">
              Recording the review is what releases the appropriations. An ordinance the province declared inoperative
              in full releases nothing and must be revised and re-enacted instead.
            </p>
            <label className="text-xs text-text-secondary">
              Outcome
              <select
                value={values.provincialReviewOutcome}
                onChange={(e) => set('provincialReviewOutcome', e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                {(options.provincialOutcomes ?? []).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-secondary">
              Remarks
              <textarea
                rows={3}
                value={values.provincialRemarks}
                onChange={(e) => set('provincialRemarks', e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            onClick={async () => {
              setError('')
              try {
                await onConfirm(values)
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not complete that stage.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg"
          >
            {stage.actionLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ProceedingForm({ budget, onClose, onSaved }) {
  const [values, setValues] = useState({
    type: 'hearing',
    scheduledAt: '',
    venue: '',
    agenda: '',
    minutes: '',
  })
  const [error, setError] = useState('')
  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }))

  return (
    <Modal title="Record a proceeding" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs text-text-secondary">
          Type
          <select value={values.type} onChange={(e) => set('type', e.target.value)} className={`mt-1 ${inputClass}`}>
            <option value="forum">Budget forum</option>
            <option value="hearing">Budget hearing</option>
            <option value="deliberation">Deliberation</option>
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          Held on
          <input
            type="datetime-local"
            value={values.scheduledAt}
            onChange={(e) => set('scheduledAt', e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs text-text-secondary">
          Venue
          <input value={values.venue} onChange={(e) => set('venue', e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-text-secondary">
          Minutes
          <textarea rows={4} value={values.minutes} onChange={(e) => set('minutes', e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            onClick={async () => {
              setError('')
              try {
                await budgetApi.recordProceeding(budget.id, {
                  ...values,
                  scheduledAt: values.scheduledAt || new Date().toISOString(),
                  heldAt: values.scheduledAt || new Date().toISOString(),
                })
                onSaved()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not record it.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg"
          >
            RECORD
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function BudgetPreparation() {
  const permissions = usePermissions()
  const [budgets, setBudgets] = useState([])
  const [options, setOptions] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState('')

  const [proposing, setProposing] = useState(null)
  const [editingProposal, setEditingProposal] = useState(null)
  const [amountsFor, setAmountsFor] = useState(null)
  const [stageFormFor, setStageFormFor] = useState(null)
  const [recordingProceeding, setRecordingProceeding] = useState(null)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([budgetApi.fetchBudgets(), budgetApi.fetchBudgetOptions()])
      .then(([budgetRows, optionRows]) => {
        if (cancelled) return
        setBudgets(budgetRows)
        setOptions(optionRows)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const run = async (fn) => {
    setError('')
    try {
      await fn()
      refresh()
    } catch (err) {
      setError(err.response?.data?.message ?? 'That action could not be completed.')
      throw err
    }
  }

  const canOpen = permissions.has('budget.prepareExecutive')
  const canPropose = permissions.has('budget.proposeBudget') || canOpen

  return (
    <DashboardPage>
      <PageHeader
        title="Budget Preparation"
        subtitle="From an office's request to the Appropriation Ordinance. Each stage is a different body, and the budget only becomes spendable authority after the provincial review is recorded."
        actions={
          canOpen && (
            <Button
              icon={Plus}
              onClick={() =>
                run(() =>
                  budgetApi.createBudget({
                    fiscalYear: new Date().getFullYear() + 1,
                    ceilingGrowthPct: 5,
                  })
                ).catch(() => {})
              }
            >
              OPEN NEXT YEAR
            </Button>
          )
        }
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <Card bodyClassName="p-8">
          <p className="text-center text-[13px] text-text-faint">Loading budgets...</p>
        </Card>
      ) : budgets.length === 0 ? (
        <Card title="Budget preparation" icon={Landmark} bodyClassName="p-8">
          <p className="text-center text-[13px] text-text-faint">
            No budget opened yet. A budget can only be opened once an Annual Investment Program has been adopted for
            the year — the projects it appropriates for have to exist first.
          </p>
        </Card>
      ) : (
        budgets.map((budget) => {
          const stage = BUDGET_STAGES.find((s) => s.key === budget.status)
          const canAct = stage?.action && permissions.has(stage.permission)
          const myProposal = budget.proposals.find(
            (p) => !canOpen && p.departmentId // an office sees only its own; the API already filtered
          )

          return (
            <Card
              key={budget.id}
              title={budget.title}
              icon={Landmark}
              bodyClassName="p-4"
              action={
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={BUDGET_STATUS_TONES[budget.status]}>{budget.statusLabel}</Badge>
                  {budget.proposalsOpen && canPropose && !myProposal && (
                    <button
                      type="button"
                      onClick={() => setProposing(budget)}
                      className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                    >
                      NEW PROPOSAL
                    </button>
                  )}
                  {(permissions.has('budget.conductForum') || permissions.has('budget.conductHearing')) && (
                    <button
                      type="button"
                      onClick={() => setRecordingProceeding(budget)}
                      className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                    >
                      RECORD PROCEEDING
                    </button>
                  )}
                  {canAct && (
                    <button
                      type="button"
                      onClick={() =>
                        stage.opensForm
                          ? setStageFormFor({ budget, stage })
                          : run(() => budgetApi.transitionBudget(budget.id, stage.action)).catch(() => {})
                      }
                      className="text-[11px] font-medium tracking-[0.03em] text-accent hover:underline"
                    >
                      {stage.actionLabel}
                    </button>
                  )}
                </div>
              }
            >
              <div className="mb-4">
                <Stepper budget={budget} />
              </div>

              {budget.returnRemarks && (
                <p className="mb-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
                  Returned: {budget.returnRemarks}
                </p>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-text-faint">Estimated income</p>
                  <p className="text-sm font-medium text-navy">
                    {budget.estimatedIncome === null ? '—' : peso(budget.estimatedIncome)}
                  </p>
                </div>
                <div>
                  <p className="text-text-faint">Expenditure ceiling</p>
                  <p className="text-sm font-medium text-navy">
                    {budget.expenditureCeiling === null ? '—' : peso(budget.expenditureCeiling)}
                  </p>
                </div>
                <div>
                  <p className="text-text-faint">Proposed</p>
                  <p className="text-sm font-medium text-navy">{peso(budget.totals.proposed)}</p>
                </div>
                <div>
                  <p className="text-text-faint">Final</p>
                  <p className="text-sm font-medium text-navy">{peso(budget.totals.final)}</p>
                </div>
              </div>

              {budget.ordinanceNo && (
                <p className="mb-3 flex items-center gap-2 text-xs text-text-secondary">
                  <Gavel size={12} />
                  {budget.ordinanceNo}
                  {budget.ordinanceDate ? ` · ${budget.ordinanceDate}` : ''}
                  {budget.provincialReviewLabel ? ` · ${budget.provincialReviewLabel}` : ''}
                </p>
              )}

              {/* ── Proposals ── */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-sidebar">
                    <tr>
                      {['Office', 'Proposed', 'Recommended', 'Final', 'Status', 'Actions'].map((head) => (
                        <th
                          key={head}
                          className="px-3 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {budget.proposals.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-[13px] text-text-faint">
                          No proposals submitted yet.
                        </td>
                      </tr>
                    ) : (
                      budget.proposals.map((proposal) => (
                        <tr key={proposal.id} className="border-t border-border-muted">
                          <td className="px-3 py-2 text-[13px] text-navy">
                            {proposal.departmentName}
                            {proposal.exceedsCeiling && (
                              <span className="ml-2">
                                <Badge tone="warning">OVER CEILING</Badge>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[13px] whitespace-nowrap text-navy">
                            {peso(proposal.proposedTotal)}
                          </td>
                          <td className="px-3 py-2 text-[13px] whitespace-nowrap text-text-secondary">
                            {proposal.recommendedTotal ? peso(proposal.recommendedTotal) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[13px] whitespace-nowrap text-text-secondary">
                            {proposal.finalTotal ? peso(proposal.finalTotal) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={PROPOSAL_STATUS_TONES[proposal.status]}>
                              {PROPOSAL_STATUS_LABELS[proposal.status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-3">
                              {proposal.status === 'draft' && budget.proposalsOpen && canPropose && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setEditingProposal({ budget, proposal })}
                                    className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                                  >
                                    EDIT
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      run(() => budgetApi.submitProposal(proposal.id)).catch(() => {})
                                    }
                                    className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                                  >
                                    SUBMIT
                                  </button>
                                </>
                              )}
                              {budget.status === 'pendingMbcReview' &&
                                permissions.has('budget.reviewProposal') &&
                                proposal.status !== 'draft' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAmountsFor({
                                        proposal,
                                        field: 'recommendedAmount',
                                        title: 'Budget Council recommendation',
                                        submit: (payload) => budgetApi.reviewProposal(proposal.id, payload),
                                      })
                                    }
                                    className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                                  >
                                    RECOMMEND
                                  </button>
                                )}
                              {budget.status === 'pendingFinalisation' &&
                                permissions.has('budget.finaliseExecutive') &&
                                proposal.status !== 'draft' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAmountsFor({
                                        proposal,
                                        field: 'finalAmount',
                                        title: 'Final appropriation figures',
                                        submit: (payload) => budgetApi.finaliseProposal(proposal.id, payload),
                                      })
                                    }
                                    className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                                  >
                                    STRIKE FINAL FIGURES
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Proceedings ── */}
              {budget.proceedings.length > 0 && (
                <div className="mt-4 border-t border-border-muted pt-3">
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                    <CalendarClock size={12} />
                    Proceedings
                  </p>
                  {budget.proceedings.map((proceeding) => (
                    <div key={proceeding.id} className="border-t border-border-muted py-2 text-xs first:border-t-0">
                      <p className="text-navy">
                        {proceeding.typeLabel}
                        {proceeding.departmentName ? ` — ${proceeding.departmentName}` : ''}
                      </p>
                      {proceeding.minutes && <p className="mt-0.5 text-text-secondary">{proceeding.minutes}</p>}
                      <p className="mt-0.5 text-text-faint">
                        <Users size={10} className="mr-1 inline" />
                        {proceeding.attendees.length} recorded · {proceeding.recordedByName ?? '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })
      )}

      {proposing && (
        <ProposalForm budget={proposing} onClose={() => setProposing(null)} onSaved={refresh} />
      )}
      {editingProposal && (
        <ProposalForm
          budget={editingProposal.budget}
          existing={editingProposal.proposal}
          onClose={() => setEditingProposal(null)}
          onSaved={refresh}
        />
      )}
      {amountsFor && (
        <AmountsForm
          proposal={amountsFor.proposal}
          field={amountsFor.field}
          title={amountsFor.title}
          onClose={() => setAmountsFor(null)}
          onConfirm={(payload) => run(() => amountsFor.submit(payload))}
        />
      )}
      {stageFormFor && (
        <StageForm
          budget={stageFormFor.budget}
          stage={stageFormFor.stage}
          options={options}
          onClose={() => setStageFormFor(null)}
          onConfirm={(values) =>
            run(() =>
              budgetApi.transitionBudget(stageFormFor.budget.id, stageFormFor.stage.action, values)
            )
          }
        />
      )}
      {recordingProceeding && (
        <ProceedingForm
          budget={recordingProceeding}
          onClose={() => setRecordingProceeding(null)}
          onSaved={refresh}
        />
      )}
    </DashboardPage>
  )
}
