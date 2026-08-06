import { useEffect, useState, useCallback } from 'react'
import { Plus, Target, Star, ListTree, Route, Check } from 'lucide-react'
import * as planningApi from '../../api/planning'
import {
  PLAN_STATUS_LABELS,
  PLAN_STATUS_TONES,
  AIP_STATUS_LABELS,
  AIP_STATUS_TONES,
  AIP_TRANSITION_FOR_STATUS,
  AIP_RETURN_PERMISSION_FOR_STATUS,
} from '../../api/planning'
import { fetchOfficeDirectory } from '../../api/departments'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

// Steps 1 to 3 of the municipal process on one screen, because they are one
// conversation: the development plan states what the municipality is for, the
// Mayor names which of those goals this year chases, and the investment program
// turns those into costed projects. Splitting them across three pages would
// hide the only thing that matters — that each one derives from the one above.

const peso = (value) => `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const inputClass =
  'w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'

function PlanForm({ onClose, onSaved }) {
  const thisYear = new Date().getFullYear()
  const [title, setTitle] = useState(`Comprehensive Development Plan ${thisYear}–${thisYear + 2}`)
  const [startYear, setStartYear] = useState(thisYear)
  const [endYear, setEndYear] = useState(thisYear + 2)
  const [vision, setVision] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <Modal title="New development plan" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs text-text-secondary">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-text-secondary">
            Start year
            <input
              type="number"
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-xs text-text-secondary">
            End year
            <input
              type="number"
              value={endYear}
              onChange={(e) => setEndYear(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
        <label className="text-xs text-text-secondary">
          Vision
          <textarea rows={3} value={vision} onChange={(e) => setVision(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
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
                await planningApi.createPlan({ title, startYear, endYear, vision })
                onSaved()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not create the plan.')
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'SAVING...' : 'CREATE'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function GoalForm({ plan, sectors, onClose, onSaved }) {
  const [sector, setSector] = useState(sectors[0]?.key ?? 'social')
  const [subsector, setSubsector] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  return (
    <Modal title="Add a development goal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs text-text-secondary">
          Sector
          <select value={sector} onChange={(e) => setSector(e.target.value)} className={`mt-1 ${inputClass}`}>
            {sectors.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          Programme (free text — e.g. Health, Agriculture, Disaster preparedness)
          <input value={subsector} onChange={(e) => setSubsector(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-text-secondary">
          Goal
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-text-secondary">
          Description
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={`mt-1 ${inputClass}`} />
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
                await planningApi.createGoal(plan.id, { sector, subsector, title, description })
                onSaved()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not add the goal.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg"
          >
            ADD GOAL
          </button>
        </div>
      </div>
    </Modal>
  )
}

// The Mayor picks and *orders* the year's priorities. Ordering is the whole
// point — "our top three priorities" is only answerable if the ranking is a
// single decision rather than a per-goal toggle that lets two goals be first.
function PrioritiesForm({ plan, onClose, onSaved }) {
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear() + 1)
  const [selected, setSelected] = useState(
    plan.goals.filter((g) => g.isMayorPriority).sort((a, b) => a.priorityRank - b.priorityRank).map((g) => g.id)
  )
  const [error, setError] = useState('')

  const toggle = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  return (
    <Modal title="Set the Mayor's priorities" onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <label className="text-xs text-text-secondary">
          Fiscal year
          <input
            type="number"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>

        <p className="text-xs text-text-faint">
          Tick goals in the order they should be ranked. The order you tick them is the order they are ranked.
        </p>

        <div className="flex flex-col gap-1">
          {plan.goals.map((goal) => {
            const rank = selected.indexOf(goal.id)
            return (
              <label
                key={goal.id}
                className="flex items-center gap-3 rounded border border-border-muted px-3 py-2 text-[13px]"
              >
                <input type="checkbox" checked={rank >= 0} onChange={() => toggle(goal.id)} />
                <span className="flex-1 text-navy">{goal.title}</span>
                <Badge tone="neutral">{goal.sector}</Badge>
                {rank >= 0 && <Badge tone="success">#{rank + 1}</Badge>}
              </label>
            )
          })}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={async () => {
              setError('')
              try {
                await planningApi.setPriorities({ fiscalYear: Number(fiscalYear), goalIds: selected })
                onSaved()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not set the priorities.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            SET PRIORITIES
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ResolutionForm({ title, label, onClose, onConfirm }) {
  const [resolutionNo, setResolutionNo] = useState('')
  const [adoptedAt, setAdoptedAt] = useState('')
  const [error, setError] = useState('')

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs text-text-secondary">
          {label}
          <input value={resolutionNo} onChange={(e) => setResolutionNo(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-text-secondary">
          Date
          <input type="date" value={adoptedAt} onChange={(e) => setAdoptedAt(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            disabled={!resolutionNo.trim()}
            onClick={async () => {
              setError('')
              try {
                await onConfirm({ resolutionNo, adoptedAt: adoptedAt || undefined })
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not record it.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            RECORD
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AipEntryForm({ program, goals, departments, options, onClose, onSaved }) {
  const [values, setValues] = useState({
    title: '',
    developmentGoalId: goals[0]?.id ?? '',
    implementingUnitId: departments[0]?.id ?? '',
    expenseClass: 'mooe',
    fund: 'generalFund',
    estimatedCost: '',
    startQuarter: 'Q1',
    endQuarter: 'Q4',
    papCode: '',
    expectedOutput: '',
  })
  const [error, setError] = useState('')

  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }))

  return (
    <Modal title={`Add a project to AIP ${program.fiscalYear}`} onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <label className="text-xs text-text-secondary">
          Project
          <input value={values.title} onChange={(e) => set('title', e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>

        <label className="text-xs text-text-secondary">
          Development goal it pursues
          <select
            value={values.developmentGoalId}
            onChange={(e) => set('developmentGoalId', e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.isMayorPriority ? `★ #${goal.priorityRank} — ` : ''}
                {goal.title}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-text-secondary">
          Implementing office
          <select
            value={values.implementingUnitId}
            onChange={(e) => set('implementingUnitId', e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-text-secondary">
            Expense class
            <select value={values.expenseClass} onChange={(e) => set('expenseClass', e.target.value)} className={`mt-1 ${inputClass}`}>
              {(options.expenseClasses ?? []).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Fund
            <select value={values.fund} onChange={(e) => set('fund', e.target.value)} className={`mt-1 ${inputClass}`}>
              {(options.funds ?? []).map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-text-secondary">
            Estimated cost
            <input
              type="number"
              value={values.estimatedCost}
              onChange={(e) => set('estimatedCost', e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-xs text-text-secondary">
            Start
            <select value={values.startQuarter} onChange={(e) => set('startQuarter', e.target.value)} className={`mt-1 ${inputClass}`}>
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            End
            <select value={values.endQuarter} onChange={(e) => set('endQuarter', e.target.value)} className={`mt-1 ${inputClass}`}>
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-text-secondary">
          PAP code
          <input value={values.papCode} onChange={(e) => set('papCode', e.target.value)} className={`mt-1 ${inputClass}`} />
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
                await planningApi.createAipEntry(program.id, values)
                onSaved()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not add the project.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg"
          >
            ADD PROJECT
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── The projects inside one investment program ───────────────────────────────
// Its own component so it can hold search, filters, sort and paging: hooks
// cannot be called inside the `programs.map()` that renders one card per
// program, and each program's project list needs controls of its own.
//
// The AIP is the longest list on this page — every project the municipality
// intends to fund that year — and it was previously rendered whole, unsorted
// and unsearchable, which is a large part of why this screen felt overwhelming.
function AipEntriesTable({ entries }) {
  const table = useTableControls(entries, {
    searchKeys: ['title', 'goalTitle', 'implementingUnitCode'],
    filters: [
      { key: 'implementingUnitCode', label: 'All offices' },
      {
        key: 'expenseClass',
        label: 'All classes',
        options: [
          { value: 'capitalOutlay', label: 'Capital Outlay' },
          { value: 'mooe', label: 'MOOE' },
          { value: 'ps', label: 'Personal Services' },
        ],
      },
      {
        key: 'isMayorPriority',
        label: 'Priority',
        options: [
          { value: 'true', label: "Mayor's priorities only" },
          { value: 'false', label: 'Not a priority' },
        ],
        accessor: (entry) => String(Boolean(entry.isMayorPriority)),
      },
      { key: 'status', label: 'All statuses' },
    ],
    accessors: { estimatedCost: (entry) => Number(entry.estimatedCost ?? 0) },
  })

  if (entries.length === 0) {
    return <p className="text-[13px] text-text-faint">No projects yet.</p>
  }

  return (
    <div>
      <div className="mb-3">
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search project, goal or office…" />
      </div>

      {table.rows.length === 0 ? (
        <p className="text-[13px] text-text-faint">No projects match your search or filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('title')}>Project</SortableTh>
                  <SortableTh {...table.sortProps('goalTitle')}>Goal</SortableTh>
                  <SortableTh {...table.sortProps('implementingUnitCode')}>Office</SortableTh>
                  <SortableTh {...table.sortProps('expenseClass')}>Class</SortableTh>
                  <SortableTh {...table.sortProps('estimatedCost')}>Cost</SortableTh>
                  <SortableTh {...table.sortProps('startQuarter')}>Schedule</SortableTh>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((entry) => (
                  <tr key={entry.id} className="border-t border-border-muted">
                    <td className="px-3 py-2 text-[13px] text-navy">
                      {entry.title}
                      {entry.status === 'dropped' && (
                        <span className="ml-2">
                          <Badge tone="danger">DROPPED</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-text-secondary">
                      {entry.isMayorPriority && (
                        <Star size={11} className="mr-1 inline text-warning" fill="currentColor" />
                      )}
                      {entry.goalTitle ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-text-secondary">
                      {entry.implementingUnitCode ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={entry.expenseClass === 'capitalOutlay' ? 'warning' : 'neutral'}>
                        {entry.expenseClass === 'capitalOutlay' ? 'CO' : entry.expenseClass.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[13px] whitespace-nowrap text-navy">
                      {peso(entry.estimatedCost)}
                    </td>
                    <td className="px-3 py-2 text-[13px] whitespace-nowrap text-text-secondary">
                      {entry.startQuarter}–{entry.endQuarter}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...table.paginationProps} label="projects" />
        </>
      )}
    </div>
  )
}

// ── WHERE THE MUNICIPALITY IS IN THE CHAIN ───────────────────────────────────
// The complaint about this page was "I open it and I don't know what to look at
// first", and the cause was that it opened with everything at once: every plan,
// every goal, every investment program and every project in all of them, with
// nothing saying which of those was the thing currently needing attention.
//
// This is the answer, and it is the delivery-timeline pattern from the
// reference: four steps, each either done, in progress or not started, so the
// first thing on the screen tells you where the work actually stands. The
// detail is behind the tabs below.
const chainSteps = (plans, programs) => {
  const adoptedPlan = plans.find((p) => p.status === 'adopted')
  const draftPlan = plans.find((p) => p.status === 'draft')
  const priorities = (adoptedPlan?.goals ?? []).filter((g) => g.isMayorPriority)
  const adoptedProgram = programs.find((p) => p.status === 'adopted')
  const liveProgram = programs.find((p) => p.status !== 'adopted')

  return [
    {
      label: 'Comprehensive Development Plan',
      state: adoptedPlan ? 'done' : draftPlan ? 'active' : 'pending',
      detail: adoptedPlan
        ? `${adoptedPlan.title} · adopted${adoptedPlan.resolutionNo ? ` under ${adoptedPlan.resolutionNo}` : ''}`
        : draftPlan
          ? `${draftPlan.title} — drafted, not yet adopted by the Sanggunian`
          : 'Nothing downstream can exist without one',
    },
    {
      label: "Mayor's priorities",
      state: priorities.length ? 'done' : adoptedPlan ? 'active' : 'pending',
      detail: priorities.length
        ? `${priorities.length} goal${priorities.length === 1 ? '' : 's'} named for FY ${priorities[0].priorityFiscalYear}`
        : adoptedPlan
          ? 'The plan is adopted — the year’s priorities have not been named'
          : 'Named against an adopted plan',
    },
    {
      label: 'Annual Investment Program',
      state: adoptedProgram ? 'done' : liveProgram ? 'active' : 'pending',
      detail: adoptedProgram
        ? `${adoptedProgram.title} · ${peso(adoptedProgram.totalEstimatedCost)} programmed`
        : liveProgram
          ? `${liveProgram.title} · ${AIP_STATUS_LABELS[liveProgram.status] ?? liveProgram.status}`
          : 'The year’s costed slice of the plan',
    },
    {
      label: 'Ready for the budget',
      state: adoptedProgram ? 'done' : 'pending',
      detail: adoptedProgram
        ? 'A budget can now be opened against this programme'
        : 'The budget cannot be opened until the investment program is adopted',
    },
  ]
}

function PlanningChain({ plans, programs }) {
  const steps = chainSteps(plans, programs)

  return (
    <Card title="Where this stands" icon={Route} bodyClassName="p-5">
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.label} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  step.state === 'done'
                    ? 'bg-success text-white'
                    : step.state === 'active'
                      ? 'bg-warning/15 text-warning ring-2 ring-warning/40'
                      : 'bg-track text-text-faint'
                }`}
              >
                {step.state === 'done' ? <Check size={12} /> : index + 1}
              </span>
              {index < steps.length - 1 && (
                <span
                  className={`w-px flex-1 ${step.state === 'done' ? 'bg-success/40' : 'bg-border-muted'}`}
                  style={{ minHeight: 20 }}
                />
              )}
            </div>
            <div className="flex-1 pb-5 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={`text-[13.5px] font-medium ${
                    step.state === 'pending' ? 'text-text-faint' : 'text-navy'
                  }`}
                >
                  {step.label}
                </p>
                {step.state === 'active' && (
                  <Badge tone="warning" dot>
                    In progress
                  </Badge>
                )}
                {step.state === 'done' && (
                  <Badge tone="success" dot>
                    Done
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

const TABS = [
  { key: 'plan', label: 'Development Plan', icon: Target },
  { key: 'aip', label: 'Investment Program', icon: ListTree },
]

export default function DevelopmentPlanning() {
  const permissions = usePermissions()
  const [plans, setPlans] = useState([])
  const [programs, setPrograms] = useState([])
  const [departments, setDepartments] = useState([])
  const [options, setOptions] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState('')

  const [creatingPlan, setCreatingPlan] = useState(false)
  const [addingGoalTo, setAddingGoalTo] = useState(null)
  const [prioritising, setPrioritising] = useState(null)
  const [adoptingPlan, setAdoptingPlan] = useState(null)
  const [adoptingProgram, setAdoptingProgram] = useState(null)
  const [addingEntryTo, setAddingEntryTo] = useState(null)

  // Which half of the chain is on screen. The two used to be stacked, so a
  // reader scrolled past every development goal to reach the projects — and the
  // page opened with both at once, which is what made it overwhelming.
  const [tab, setTab] = useState('plan')

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      planningApi.fetchPlans(),
      planningApi.fetchPrograms(),
      planningApi.fetchPlanningOptions(),
      fetchOfficeDirectory().catch(() => []),
    ])
      .then(([planRows, programRows, optionRows, departmentRows]) => {
        if (cancelled) return
        setPlans(planRows)
        setPrograms(programRows)
        setOptions(optionRows)
        setDepartments(departmentRows ?? [])
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

  const canManageCdp = permissions.has('planning.manageCdp')
  const canManageAip = permissions.has('planning.manageAip')
  const canPrioritise = permissions.has('planning.setPriorities')
  const canAdopt = permissions.has('planning.adoptAip')

  const adoptedPlan = plans.find((p) => p.status === 'adopted')

  return (
    <DashboardPage>
      <PageHeader
        title="Development Plan &amp; AIP"
        subtitle="The development plan, the Mayor's priorities for the year, and the investment program derived from them. Everything the LGU budgets for and procures traces back to a line on this page."
        actions={
          canManageCdp && (
            <Button icon={Plus} onClick={() => setCreatingPlan(true)}>
              NEW PLAN
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
          <p className="text-center text-[13px] text-text-faint">Loading plans...</p>
        </Card>
      ) : (
        <>
          <PlanningChain plans={plans} programs={programs} />

          {/* One at a time. Both halves are still one record — the AIP is the
              year's slice of the plan — so they stay on one route with one set
              of permissions; only the reading is split. */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-pressed={tab === item.key}
                className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[13px] font-medium transition-colors ${
                  tab === item.key
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-border-muted bg-surface text-text-secondary hover:text-navy'
                }`}
              >
                <item.icon size={14} />
                {item.label}
                {item.key === 'aip' && programs.length > 0 && (
                  <span
                    className={`ml-0.5 text-[11.5px] ${
                      tab === item.key ? 'text-accent-fg/70' : 'text-text-faint'
                    }`}
                  >
                    {programs.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Step 1 & 2: the plan and the priorities ── */}
          {tab === 'plan' && (plans.length === 0 ? (
            <Card title="Comprehensive Development Plan" icon={Target} bodyClassName="p-8">
              <p className="text-center text-[13px] text-text-faint">
                No development plan recorded yet. Everything downstream — the investment program, the budget, the
                procurement plan — is checked against one, so this is the first thing to capture.
              </p>
            </Card>
          ) : (
            plans.map((plan) => (
              <Card
                key={plan.id}
                title={plan.title}
                icon={Target}
                bodyClassName="p-4"
                action={
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={PLAN_STATUS_TONES[plan.status]}>{PLAN_STATUS_LABELS[plan.status]}</Badge>
                    {plan.status === 'draft' && canManageCdp && (
                      <button
                        type="button"
                        onClick={() => setAddingGoalTo(plan)}
                        className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                      >
                        ADD GOAL
                      </button>
                    )}
                    {plan.status === 'draft' && canAdopt && (
                      <button
                        type="button"
                        onClick={() => setAdoptingPlan(plan)}
                        className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                      >
                        RECORD ADOPTION
                      </button>
                    )}
                    {plan.status === 'adopted' && canPrioritise && (
                      <button
                        type="button"
                        onClick={() => setPrioritising(plan)}
                        className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                      >
                        SET PRIORITIES
                      </button>
                    )}
                  </div>
                }
              >
                <p className="mb-3 text-xs text-text-faint">
                  {plan.startYear}–{plan.endYear} ({plan.horizonYears} years)
                  {plan.resolutionNo ? ` · adopted under ${plan.resolutionNo}` : ''}
                </p>
                {plan.vision && <p className="mb-3 text-[13px] text-text-secondary">{plan.vision}</p>}

                <div className="flex flex-col gap-1">
                  {plan.goals.length === 0 ? (
                    <p className="text-[13px] text-text-faint">No goals recorded yet.</p>
                  ) : (
                    plan.goals.map((goal) => (
                      <div
                        key={goal.id}
                        className="flex flex-wrap items-center gap-2 border-t border-border-muted py-2 text-[13px] first:border-t-0"
                      >
                        {goal.isMayorPriority && (
                          <span className="inline-flex items-center gap-1 text-warning">
                            <Star size={12} fill="currentColor" />
                            <span className="text-[11px] font-medium">#{goal.priorityRank}</span>
                          </span>
                        )}
                        <span className="flex-1 text-navy">{goal.title}</span>
                        {goal.subsector && <span className="text-[11px] text-text-faint">{goal.subsector}</span>}
                        <Badge tone="neutral">{goal.sector}</Badge>
                        {goal.isMayorPriority && (
                          <Badge tone="warning">MAYOR&apos;S PRIORITY FY {goal.priorityFiscalYear}</Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            ))
          ))}

          {/* ── Step 3: the investment program ── */}
          {tab === 'aip' && (
          <Card
            title="Annual Investment Program"
            icon={ListTree}
            bodyClassName="p-4"
            action={
              canManageAip &&
              adoptedPlan && (
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      planningApi.createProgram({ fiscalYear: new Date().getFullYear() + 1 })
                    ).catch(() => {})
                  }
                  className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                >
                  OPEN NEXT YEAR
                </button>
              )
            }
          >
            {programs.length === 0 ? (
              <p className="text-[13px] text-text-faint">
                No investment program yet. It is the year&apos;s slice of the development plan, and the budget cannot
                be opened without one.
              </p>
            ) : (
              programs.map((program) => {
                const next = AIP_TRANSITION_FOR_STATUS[program.status]
                const canAdvance = next && permissions.has(next.permission)
                const returnPermission = AIP_RETURN_PERMISSION_FOR_STATUS[program.status]

                return (
                  <div key={program.id} className="mb-4 rounded border border-border-muted p-3 last:mb-0">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <span className="text-[13px] font-medium text-navy">{program.title}</span>
                      <Badge tone={AIP_STATUS_TONES[program.status]}>{AIP_STATUS_LABELS[program.status]}</Badge>
                      <span className="text-xs text-text-faint">{peso(program.totalEstimatedCost)} programmed</span>
                      {program.resolutionNo && (
                        <span className="text-xs text-text-faint">adopted under {program.resolutionNo}</span>
                      )}
                      <div className="ml-auto flex flex-wrap gap-3">
                        {program.editable && canManageAip && (
                          <button
                            type="button"
                            onClick={() => setAddingEntryTo(program)}
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            ADD PROJECT
                          </button>
                        )}
                        {canAdvance && (
                          <button
                            type="button"
                            onClick={() =>
                              next.opensForm
                                ? setAdoptingProgram(program)
                                : run(() => planningApi.transitionProgram(program.id, next.action)).catch(() => {})
                            }
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            {next.label}
                          </button>
                        )}
                        {returnPermission && permissions.has(returnPermission) && (
                          <button
                            type="button"
                            onClick={() => {
                              const remarks = window.prompt('Why is it being returned?')
                              if (remarks?.trim()) {
                                run(() =>
                                  planningApi.transitionProgram(program.id, 'return', { remarks })
                                ).catch(() => {})
                              }
                            }}
                            className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                          >
                            RETURN
                          </button>
                        )}
                      </div>
                    </div>

                    {program.returnRemarks && (
                      <p className="mb-2 text-xs text-danger">Returned: {program.returnRemarks}</p>
                    )}

                    <AipEntriesTable entries={program.entries} />
                  </div>
                )
              })
            )}
          </Card>
          )}
        </>
      )}

      {creatingPlan && <PlanForm onClose={() => setCreatingPlan(false)} onSaved={refresh} />}
      {addingGoalTo && (
        <GoalForm
          plan={addingGoalTo}
          sectors={options.sectors ?? []}
          onClose={() => setAddingGoalTo(null)}
          onSaved={refresh}
        />
      )}
      {prioritising && (
        <PrioritiesForm plan={prioritising} onClose={() => setPrioritising(null)} onSaved={refresh} />
      )}
      {adoptingPlan && (
        <ResolutionForm
          title={`Record adoption — ${adoptingPlan.title}`}
          label="Adopting resolution number"
          onClose={() => setAdoptingPlan(null)}
          onConfirm={(payload) => run(() => planningApi.adoptPlan(adoptingPlan.id, payload))}
        />
      )}
      {adoptingProgram && (
        <ResolutionForm
          title={`Record adoption — ${adoptingProgram.title}`}
          label="Adopting resolution number"
          onClose={() => setAdoptingProgram(null)}
          onConfirm={(payload) =>
            run(() => planningApi.transitionProgram(adoptingProgram.id, 'adopt', payload))
          }
        />
      )}
      {addingEntryTo && (
        <AipEntryForm
          program={addingEntryTo}
          goals={(plans.find((p) => p.id === addingEntryTo.developmentPlanId)?.goals ?? []).filter(
            (g) => g.status === 'active'
          )}
          departments={departments}
          options={options}
          onClose={() => setAddingEntryTo(null)}
          onSaved={refresh}
        />
      )}
    </DashboardPage>
  )
}
