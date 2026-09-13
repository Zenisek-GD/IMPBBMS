import { Fragment, useEffect, useState, useCallback } from 'react'
import ResolutionNumberInput from '../../components/ui/ResolutionNumberInput'
import { Plus, Target, Star, ListTree, Route, Check } from 'lucide-react'
import * as planningApi from '../../api/planning'
import { availableAipYears } from './aipYears'
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
import LargeFormPage from '../../components/ui/LargeFormPage'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import NextStep, { NextInline } from '../../components/ui/NextStep'
import ReasonModal from '../../components/ui/ReasonModal'
import { planNext, aipNext } from '../../config/nextSteps'
import { useTableControls } from '../../components/ui/useTableControls'

// Steps 1 to 3 of the municipal process on one screen, because they are one
// conversation: the development plan states what the municipality is for, the
// Mayor names which of those goals this year chases, and the investment program
// turns those into costed projects. Splitting them across three pages would
// hide the only thing that matters — that each one derives from the one above.

const peso = (value) => `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const inputClass =
  'w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'

function PlanForm({ sectors, onClose, onSaved }) {
  const thisYear = new Date().getFullYear()
  const [title, setTitle] = useState(`Comprehensive Development Plan ${thisYear}–${thisYear + 2}`)
  const [startYear, setStartYear] = useState(thisYear)
  const [endYear, setEndYear] = useState(thisYear + 2)
  const [vision, setVision] = useState('')
  const emptyGoal = () => ({ sector: sectors[0]?.key ?? 'social', subsector: '', title: '', description: '' })
  const [goals, setGoals] = useState([emptyGoal])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateGoal = (index, key, value) => {
    setGoals((current) => current.map((goal, goalIndex) =>
      goalIndex === index ? { ...goal, [key]: value } : goal
    ))
  }

  // Item 12: a plan with its goals is a long workflow form, so it lives on a
  // full page with logical sections — not inside a scroll-heavy modal.
  return (
    <LargeFormPage
      title="New development plan"
      purpose="Start with the plan and its first goal in one place. You can add more goals now or later while the plan is still a draft."
      onBack={onClose}
      backLabel="Back to plans"
      error={error}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setError('')
              if (!title.trim()) {
                setError('Enter a title for the development plan.')
                return
              }
              if (goals.some((goal) => !goal.title.trim())) {
                setError('Enter a goal title for every goal you added, or remove the empty goal.')
                return
              }
              setSaving(true)
              try {
                await planningApi.createPlan({ title, startYear, endYear, vision, goals })
                onSaved()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not create the plan.')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Creating plan…' : 'Create plan'}
          </Button>
        </>
      }
    >
      <LargeFormPage.Section
        title="Plan details"
        description="What this plan is called and which years it covers."
      >
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
        </div>
      </LargeFormPage.Section>
      {/* Optional and tucked away: a vision is a broad aspiration, not the
          concrete result the plan must open with. Forcing it inline made it
          look required and confused it with the first goal. */}
      <details className="rounded-lg border border-border-muted bg-surface px-4 py-3 shadow-sm">
        <summary className="cursor-pointer text-[13px] font-medium text-navy">
          More details (optional)
        </summary>
        <label className="mt-2 block text-xs text-text-secondary">
          Long-term direction (optional)
          <textarea
            rows={3}
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            placeholder="Example: A safe, healthy, and resilient municipality where every barangay can access essential services."
            className={`mt-1 resize-y leading-relaxed ${inputClass}`}
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-text-faint">
            The municipality&apos;s broad long-term aspiration. Optional, and different from the
            practical goals below.
          </span>
        </label>
      </details>
      <LargeFormPage.Section
        title="Goals of this plan"
        description="Add at least one practical result the municipality wants to achieve."
      >
        <div className="flex flex-col gap-4">
          {goals.map((goal, index) => (
            <fieldset key={index} className="rounded-md border border-border-muted bg-surface p-3">
              <legend className="px-1 text-[12px] font-medium text-navy">
                {index === 0 ? 'First goal of this plan' : `Goal ${index + 1}`}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-text-secondary">
                  Area
                  <select value={goal.sector} onChange={(event) => updateGoal(index, 'sector', event.target.value)} className={`mt-1 ${inputClass}`}>
                    {sectors.map((sector) => <option key={sector.key} value={sector.key}>{sector.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-text-secondary">
                  Programme (optional)
                  <input value={goal.subsector} onChange={(event) => updateGoal(index, 'subsector', event.target.value)} placeholder="Example: Health or disaster preparedness" className={`mt-1 ${inputClass}`} />
                </label>
              </div>
              <label className="mt-3 block text-xs text-text-secondary">
                Goal
                <input value={goal.title} onChange={(event) => updateGoal(index, 'title', event.target.value)} placeholder="Example: Improve access to primary health services" className={`mt-1 ${inputClass}`} />
              </label>
              <label className="mt-3 block text-xs text-text-secondary">
                Short description (optional)
                <textarea rows={2} value={goal.description} onChange={(event) => updateGoal(index, 'description', event.target.value)} placeholder="What does success look like?" className={`mt-1 resize-y ${inputClass}`} />
              </label>
              {goals.length > 1 && (
                <Button className="mt-3" size="sm" variant="ghost" onClick={() => setGoals((current) => current.filter((_, goalIndex) => goalIndex !== index))}>
                  Remove this goal
                </Button>
              )}
            </fieldset>
          ))}
        </div>
        <Button className="mt-4" size="sm" variant="secondary" icon={Plus} onClick={() => setGoals((current) => [...current, emptyGoal()])}>
          Add another goal
        </Button>
      </LargeFormPage.Section>
    </LargeFormPage>
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
          <ResolutionNumberInput
            value={resolutionNo}
            onChange={(e) => setResolutionNo(e.target.value)}
          />
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

function AipProgramForm({ years, plans, onClose, onSaved }) {
  const [requestedYear, setRequestedYear] = useState(
    years.find((year) => year >= new Date().getFullYear()) ?? years[0] ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fiscalYear = years.includes(requestedYear) ? requestedYear : (years[0] ?? '')
  const plan = plans.find(
    (row) => row.status === 'adopted' && row.startYear <= fiscalYear && row.endYear >= fiscalYear
  )

  return (
    <Modal title="Create Annual Investment Program" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault()
          if (saving || !fiscalYear) return
          setSaving(true)
          setError('')
          try {
            await planningApi.createProgram({ fiscalYear })
            onSaved()
            onClose()
          } catch (err) {
            setError(err.response?.data?.message ?? 'Could not create the investment program.')
          } finally {
            setSaving(false)
          }
        }}
      >
        <label className="text-xs text-text-secondary">
          Fiscal year
          <select
            value={fiscalYear}
            onChange={(event) => setRequestedYear(Number(event.target.value))}
            disabled={saving || years.length === 0}
            className={inputClass}
          >
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <p className="text-[13px] text-text-secondary">
          {plan
            ? 'Development plan: ' + plan.title
            : 'No available fiscal year. Adopt a development plan covering a year without an AIP.'}
        </p>
        <p className="text-xs text-text-faint">
          Only years covered by an adopted development plan and without an existing AIP are available.
          After creating the AIP, use ADD PROJECT to record its costed projects.
        </p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={onClose}>CANCEL</Button>
          <Button type="submit" disabled={saving || !fiscalYear || !plan}>
            {saving ? 'CREATING…' : 'CREATE AIP'}
          </Button>
        </div>
      </form>
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

  // Item 12: project entry carries nine fields across budget, schedule and
  // coding dimensions — a full page with sections, not a scroll-heavy modal.
  return (
    <LargeFormPage
      title={`Add a project to AIP ${program.fiscalYear}`}
      purpose="Record one costed project under this year's investment program. It must pursue one of the plan's goals."
      onBack={onClose}
      backLabel="Back to investment program"
      error={error}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!values.title.trim()}
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
          >
            Add project
          </Button>
        </>
      }
    >
      <LargeFormPage.Section
        title="Project"
        description="What will be delivered, which goal it pursues, and which office implements it."
      >
        <div className="flex flex-col gap-3">
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
        </div>
      </LargeFormPage.Section>

      <LargeFormPage.Section
        title="Budget and schedule"
        description="How much it costs, when it runs, and how it is coded."
      >
        <div className="flex flex-col gap-3">
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
        </div>
      </LargeFormPage.Section>
    </LargeFormPage>
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
  const [creatingProgram, setCreatingProgram] = useState(false)
  const [addingGoalTo, setAddingGoalTo] = useState(null)
  const [prioritising, setPrioritising] = useState(null)
  const [adoptingPlan, setAdoptingPlan] = useState(null)
  const [adoptingProgram, setAdoptingProgram] = useState(null)
  const [addingEntryTo, setAddingEntryTo] = useState(null)
  const [returningProgram, setReturningProgram] = useState(null)

  // Which half of the chain is on screen. The two used to be stacked, so a
  // reader scrolled past every development goal to reach the projects — and the
  // page opened with both at once, which is what made it overwhelming.
  const [tab, setTab] = useState('plan')

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  // Planning changes are shared records. Refresh an open Planning page on the
  // same cadence as the notification bell so a Mayor or Sanggunian user sees a
  // colleague's saved update without manually reloading the browser.
  useEffect(() => {
    const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

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
  const programYears = availableAipYears(plans, programs)

  // Item 12: long workflow forms render as full pages, not as modals over the
  // list. Early returns keep every hook above them unconditional.
  if (creatingPlan) {
    return (
      <DashboardPage>
        <PlanForm
          sectors={options.sectors ?? []}
          onClose={() => setCreatingPlan(false)}
          onSaved={refresh}
        />
      </DashboardPage>
    )
  }

  if (addingEntryTo) {
    return (
      <DashboardPage>
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
      </DashboardPage>
    )
  }

  return (
    <DashboardPage>
      <PageHeader
        title="Development Plan & Annual Investment Program (AIP)"
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
          {tab === 'plan' && (
            <DevelopmentPlansTable
              plans={plans}
              canManageCdp={canManageCdp}
              canPrioritise={canPrioritise}
              canAdopt={canAdopt}
              onAddGoal={setAddingGoalTo}
              onPrioritise={setPrioritising}
              onAdopt={setAdoptingPlan}
            />
          )}

          {/* ── Step 3: the investment program ── */}
          {tab === 'aip' && (
          <Card
            title="Annual Investment Program"
            icon={ListTree}
            bodyClassName="p-4"
            action={
              canManageAip && (
                <Button
                  icon={Plus}
                  disabled={programYears.length === 0}
                  onClick={() => setCreatingProgram(true)}
                >
                  NEW AIP
                </Button>
              )
            }
          >
            {canManageAip && programYears.length === 0 && (
              <p className="mb-3 text-[13px] text-text-secondary">
                {adoptedPlan
                  ? 'Every year covered by the adopted development plans already has an AIP. Existing adopted AIPs are closed to new projects.'
                  : 'A Planning Officer must add a development goal, then the Sanggunian Secretary must record adoption of the development plan before an AIP can be created.'}
              </p>
            )}
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
                          <Button
                            size="sm"
                            variant={next.opensForm ? 'primary' : 'secondary'}
                            icon={next.opensForm ? Check : undefined}
                            onClick={() =>
                              next.opensForm
                                ? setAdoptingProgram(program)
                                : run(() => planningApi.transitionProgram(program.id, next.action)).catch(() => {})
                            }
                          >
                            {next.label}
                          </Button>
                        )}
                        {returnPermission && permissions.has(returnPermission) && (
                          <button
                            type="button"
                            onClick={() => setReturningProgram(program)}
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

                    <div className="mb-2">
                      <NextStep next={aipNext(program)} tone={AIP_STATUS_TONES[program.status]} />
                    </div>

                    <AipEntriesTable entries={program.entries} />
                  </div>
                )
              })
            )}
          </Card>
          )}
        </>
      )}

      {creatingProgram && (
        <AipProgramForm
          years={programYears}
          plans={plans}
          onClose={() => setCreatingProgram(false)}
          onSaved={refresh}
        />
      )}
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
      {returningProgram && (
        <ReasonModal
          title={`Return "${returningProgram.title}"`}
          consequence="The program goes back to draft. The Planning Office will need to correct it and submit it again."
          reasonLabel="Why is it being returned?"
          reasonPlaceholder="State what must be corrected"
          confirmLabel="Return program"
          danger
          onClose={() => setReturningProgram(null)}
          onConfirm={(remarks) => {
            const program = returningProgram
            setReturningProgram(null)
            run(() => planningApi.transitionProgram(program.id, 'return', { remarks })).catch(() => {})
          }}
        />
      )}
    </DashboardPage>
  )
}

// Development plans can accumulate across planning cycles. Keeping every goal
// in every plan expanded turns a simple "find the right plan" task into a long
// page of scrolling, so this is a record table first and a detail view only on
// request. One open row at a time keeps the overview compact without hiding
// goals, priorities, or the legal workflow actions that belong to the record.
function DevelopmentPlansTable({
  plans,
  canManageCdp,
  canPrioritise,
  canAdopt,
  onAddGoal,
  onPrioritise,
  onAdopt,
}) {
  const [expandedId, setExpandedId] = useState(null)
  const table = useTableControls(plans, {
    searchKeys: ['title', 'vision', 'resolutionNo', (plan) => `${plan.startYear} ${plan.endYear}`],
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(PLAN_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
    ],
    accessors: {
      goalCount: (plan) => plan.goals?.length ?? 0,
      startYear: (plan) => Number(plan.startYear ?? 0),
    },
    initialSort: { key: 'startYear', direction: 'desc' },
  })

  const goalCount = (plan) => plan.goals?.length ?? 0

  return (
    <Card title="Development Plans" icon={Target} bodyClassName="">
      <div className="border-b border-border-muted p-4">
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search plan, year, direction or resolution…" />
      </div>

      {table.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-text-faint">
          {table.totalBeforeFilters === 0
            ? 'No development plan recorded yet. Create the first plan to begin the planning chain.'
            : 'No development plans match your search or filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-sidebar">
              <tr>
                <SortableTh {...table.sortProps('title')}>Plan</SortableTh>
                <SortableTh {...table.sortProps('startYear')}>Period</SortableTh>
                <SortableTh {...table.sortProps('goalCount')}>Goals</SortableTh>
                <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                <Th>Next step</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {table.pageRows.map((plan) => {
                const open = expandedId === plan.id
                const priorities = (plan.goals ?? []).filter((goal) => goal.isMayorPriority)
                return (
                  <Fragment key={plan.id}>
                    <tr key={plan.id} className="border-t border-border-muted align-top">
                      <td className="px-4 py-3">
                        <p className="max-w-md text-[13px] font-medium text-navy">{plan.title}</p>
                        {plan.resolutionNo && (
                          <p className="mt-0.5 text-[11.5px] text-text-secondary">Resolution {plan.resolutionNo}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-text-secondary">
                        {plan.startYear}–{plan.endYear}
                        <p className="mt-0.5 text-[11.5px] text-text-faint">{plan.horizonYears} years</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-navy">
                        {goalCount(plan)}
                        {priorities.length > 0 && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-warning">
                            <Star size={11} fill="currentColor" aria-hidden="true" />
                            {priorities.length} priority {priorities.length === 1 ? 'goal' : 'goals'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={PLAN_STATUS_TONES[plan.status]}>{PLAN_STATUS_LABELS[plan.status] ?? plan.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <NextInline next={planNext(plan)} />
                        {plan.status === 'adopted' && <span className="text-[11.5px] text-success">Ready for priorities and AIP</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex w-max items-center gap-2">
                          <Button
                            size="table"
                            variant="secondary"
                            aria-expanded={open}
                            aria-controls={`plan-details-${plan.id}`}
                            onClick={() => setExpandedId((current) => (current === plan.id ? null : plan.id))}
                          >
                            {open ? 'Hide' : 'Details'}
                          </Button>
                          {plan.status === 'draft' && canManageCdp && (
                            <Button size="table" icon={Plus} onClick={() => onAddGoal(plan)}>Add goal</Button>
                          )}
                          {plan.status === 'draft' && canAdopt && (
                            <Button size="table" icon={Check} onClick={() => onAdopt(plan)}>Adopt</Button>
                          )}
                          {plan.status === 'adopted' && canPrioritise && (
                            <Button size="table" variant="secondary" onClick={() => onPrioritise(plan)}>Priorities</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${plan.id}-details`} id={`plan-details-${plan.id}`} className="border-t border-border-muted bg-sidebar/40">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                            <div>
                              <h3 className="text-[13px] font-semibold text-navy">Plan details</h3>
                              {plan.vision ? (
                                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
                                  <span className="font-medium text-navy">Long-term direction: </span>
                                  {plan.vision}
                                </p>
                              ) : (
                                <p className="mt-2 text-[13px] text-text-faint">No long-term direction was recorded for this plan.</p>
                              )}
                              <div className="mt-3 max-w-2xl">
                                <NextStep next={planNext(plan)} tone={PLAN_STATUS_TONES[plan.status]} />
                              </div>
                            </div>

                            <div>
                              <h3 className="text-[13px] font-semibold text-navy">Goals in this plan</h3>
                              {goalCount(plan) === 0 ? (
                                <p className="mt-2 text-[13px] text-text-faint">No goals recorded yet. Add the first goal before recording adoption.</p>
                              ) : (
                                <div className="mt-2 max-h-[30rem] overflow-y-auto rounded-lg border border-border-muted bg-surface">
                                  <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-sidebar">
                                      <tr>
                                        <Th>Goal</Th>
                                        <Th>Sector</Th>
                                        <Th>Priority</Th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(plan.goals ?? []).map((goal) => (
                                        <tr key={goal.id} className="border-t border-border-muted">
                                          <td className="px-4 py-2.5 text-[13px] text-navy">
                                            {goal.title}
                                            {goal.subsector && <p className="mt-0.5 text-[11.5px] text-text-faint">{goal.subsector}</p>}
                                          </td>
                                          <td className="px-4 py-2.5"><Badge tone="neutral">{goal.sectorLabel ?? goal.sector}</Badge></td>
                                          <td className="px-4 py-2.5 text-[12px] text-text-secondary">
                                            {goal.isMayorPriority ? `Mayor’s priority FY ${goal.priorityFiscalYear}` : '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {table.rows.length > 0 && <Pagination {...table.paginationProps} label="development plans" />}
    </Card>
  )
}
