import { useActionQueue } from '../../context/useActionQueue'
import FiscalYearFilter from '../../components/ui/FiscalYearFilter'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ClipboardList, Info, Lock } from 'lucide-react'
import * as appApi from '../../api/appEntries'
import * as financeApi from '../../api/finance'
import * as planningApi from '../../api/planning'
import {
  APP_STATUS_LABELS,
  APP_STATUS_TONES,
  TRANSITION_FOR_STATUS,
  RETURN_PERMISSION_FOR_STATUS,
  PROCUREMENT_MODES,
  PLAN_CYCLE_LABELS,
  PLAN_STAGE_LABELS,
  modeLabel,
} from '../../api/appEntries'
import { usePermissions } from '../../context/usePermissions'
import { useAuth } from '../../context/useAuth'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import LargeFormPage from '../../components/ui/LargeFormPage'
import FormField from '../../components/ui/FormField'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { NextInline } from '../../components/ui/NextStep'
import { appNext } from '../../config/nextSteps'
import { useServerTable } from '../../components/ui/useServerTable'
import useDraftRecovery from '../../hooks/useDraftRecovery'
import { currentFiscalYear } from '../../utils/fiscalYear'
import { CommitteeActionModal } from '../bidding/EvaluationForms'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']
const PROCUREMENT_CATEGORIES = [
  { value: 'goods', label: 'Goods' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'consulting', label: 'Consulting services' },
]
const normalizeCategory = (value) => {
  const category = String(value ?? '').trim().toLowerCase()
  return PROCUREMENT_CATEGORIES.some((option) => option.value === category) ? category : ''
}

// Mirrors the Section 4.3 rules the server enforces.
const entrySchema = z
  .object({
    fiscalYear: z.coerce.number().int().min(2000, 'Enter a valid fiscal year.').max(2100, 'Enter a valid fiscal year.'),
    planCycle: z.enum(['indicative', 'final']),
    projectTitle: z.string().trim().min(1, 'Project title is required'),
    description: z.string().optional(),
    category: z.enum(['goods', 'infrastructure', 'consulting'], { message: 'Select a procurement category.' }),
    aipEntryId: z.coerce.number({ message: 'An investment program project is required' }).positive(
      'Select the investment program project this APP line will procure.'
    ),
    appropriationId: z.union([
      z.coerce.number().positive('Select the appropriation line this plan is charged against.'),
      z.literal(''),
    ]),
    abc: z.coerce.number({ message: 'ABC is required' }).positive('ABC must be greater than 0.'),
    unit: z.string().optional(),
    quantity: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
    procurementMode: z.string(),
    targetStartQuarter: z.enum(QUARTERS),
    targetCompletionQuarter: z.enum(QUARTERS),
    fundSource: z.string().optional(),
    accountCode: z.string().optional(),
    mfoId: z.string().optional(),
    papCode: z.string().optional(),
    uacsCode: z.string().optional(),
    justification: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.planCycle === 'final' && !values.appropriationId) {
      ctx.addIssue({
        code: 'custom',
        path: ['appropriationId'],
        message: 'Select an enacted appropriation line for a final APP entry.',
      })
    }
    if (QUARTERS.indexOf(values.targetStartQuarter) > QUARTERS.indexOf(values.targetCompletionQuarter)) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetCompletionQuarter'],
        message: 'Start quarter must not be after the completion quarter.',
      })
    }
    if (values.procurementMode !== 'competitiveBidding' && !values.justification?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification'],
        message: 'A justification is required for alternative procurement modes.',
      })
    }
  })

const peso = (value) =>
  `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function EntryFormModal({ title, defaultValues, onSubmit, onClose }) {
  const { fiscalYear } = useActionQueue()
  const [serverError, setServerError] = useState('')
  const [suggestion, setSuggestion] = useState(null)
  const [appropriations, setAppropriations] = useState([])
  const [aipEntries, setAipEntries] = useState([])
  const [linkedRecordsLoading, setLinkedRecordsLoading] = useState(true)
  const [linkedRecordsError, setLinkedRecordsError] = useState(false)
  const [linkedRecordsReload, setLinkedRecordsReload] = useState(0)
  const yearChosenByUser = useRef(Boolean(defaultValues?.id) || fiscalYear !== 'all')

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(entrySchema), defaultValues, mode: 'onBlur' })
  const currentValues = useWatch({ control })
  const watchedFiscalYear = useWatch({ control, name: 'fiscalYear' })
  const watchedPlanCycle = useWatch({ control, name: 'planCycle' })
  const isIndicative = watchedPlanCycle === 'indicative'
  const draft = useDraftRecovery({
    key: defaultValues?.id ? `app-entry-${defaultValues.id}` : 'app-entry-new',
    value: currentValues,
    onRestore: (saved) => {
      yearChosenByUser.current = true
      const category = saved.category == null ? (defaultValues?.category ?? 'goods') : normalizeCategory(saved.category)
      reset({ ...saved, planCycle: saved.planCycle ?? 'final', appropriationId: saved.appropriationId ?? '', category })
    },
  })

  // Ask the server what mode the ABC implies, as it is typed. The thresholds
  // come from the RA 12009 IRR and depend on the LGU's classification, so this
  // is not something the frontend can work out on its own.
  // Load all eligible years. An indicative line needs an adopted AIP project;
  // a final line also needs an enacted appropriation for that fiscal year.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      financeApi.fetchAppropriations({ chargeable: 'true', fiscalYear: 'all' }),
      planningApi.fetchAipEntries({ fiscalYear: 'all' }),
    ])
      .then(([lines, projects]) => {
        if (cancelled) return
        setAppropriations(lines)
        setAipEntries(projects)
        setLinkedRecordsError(false)
        setLinkedRecordsLoading(false)

        // For a new entry, choose the latest year with the records required by
        // its cycle. Do not replace a year picked by the user or restored locally.
        if (!yearChosenByUser.current) {
          const projectYears = new Set(projects.map((entry) => Number(entry.fiscalYear)))
          const lineYears = new Set(lines.map((line) => Number(line.fiscalYear)))
          const sharedYears = [...projectYears].filter((year) => lineYears.has(year))
          const availableYears = getValues('planCycle') === 'indicative'
            ? [...projectYears]
            : sharedYears.length ? sharedYears : [...projectYears, ...lineYears]
          const preferredYear = availableYears.length ? Math.max(...availableYears) : currentFiscalYear()
          setValue('fiscalYear', preferredYear)
        }
      })
      .catch(() => {
        if (cancelled) return
        setLinkedRecordsError(true)
        setLinkedRecordsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [getValues, linkedRecordsReload, setValue])

  const watchedAbc = useWatch({ control, name: 'abc' })
  const watchedCategory = useWatch({ control, name: 'category' })
  const watchedAppropriation = useWatch({ control, name: 'appropriationId' })
  const year = Number(watchedFiscalYear)
  const fiscalYears = [...new Set([
    currentFiscalYear(),
    Number(defaultValues?.fiscalYear),
    Number(watchedFiscalYear),
    ...aipEntries.map((entry) => Number(entry.fiscalYear)),
    ...appropriations.map((line) => Number(line.fiscalYear)),
  ].filter((value) => Number.isInteger(value) && value >= 2000 && value <= 2100))].sort((a, b) => b - a)
  const yearAipEntries = aipEntries.filter((entry) => Number(entry.fiscalYear) === year)
  const yearAppropriations = appropriations.filter((line) => Number(line.fiscalYear) === year)
  const selectedLine = yearAppropriations.find((row) => String(row.id) === String(watchedAppropriation))
  const fiscalYearRegistration = register('fiscalYear')
  const planCycleRegistration = register('planCycle')
  const changePlanCycle = (event) => {
    planCycleRegistration.onChange(event)
    setValue('appropriationId', '')
    if (!yearChosenByUser.current && aipEntries.length > 0) {
      const projectYears = new Set(aipEntries.map((entry) => Number(entry.fiscalYear)))
      const lineYears = new Set(appropriations.map((line) => Number(line.fiscalYear)))
      const sharedYears = [...projectYears].filter((value) => lineYears.has(value))
      const availableYears = event.target.value === 'indicative'
        ? [...projectYears]
        : sharedYears.length ? sharedYears : [...projectYears, ...lineYears]
      if (availableYears.length > 0) {
        const preferredYear = Math.max(...availableYears)
        if (preferredYear !== year) {
          setValue('fiscalYear', preferredYear)
          setValue('aipEntryId', '')
        }
      }
    }
  }
  useEffect(() => {
    const abc = Number(watchedAbc)
    if (!abc || Number.isNaN(abc) || abc <= 0) return

    let cancelled = false
    const timer = setTimeout(() => {
      appApi
        .fetchModeSuggestion(abc, watchedCategory)
        .then((result) => {
          if (!cancelled) setSuggestion(result)
        })
        .catch(() => {
          if (!cancelled) setSuggestion(null)
        })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [watchedAbc, watchedCategory])

  const submit = async (values) => {
    setServerError('')
    try {
      const payload = { ...values }
      // An indicative line has no ordinance reference. Omit the field entirely
      // so an edited line cannot turn a blank select into a numeric zero.
      if (payload.planCycle === 'indicative') delete payload.appropriationId
      await onSubmit(payload)
      draft.clearDraft()
      onClose()
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong.')
    }
  }

  return (
    // Item 12: fifteen fields across linked records, mode and schedule — a full
    // page with logical sections, not a scroll-heavy modal.
    <LargeFormPage
      title={title}
      purpose={isIndicative
        ? 'An indicative PPMP line plans a procurement for an adopted investment program project before the appropriation ordinance is enacted.'
        : 'A final APP line plans a procurement against an adopted investment program project and an enacted appropriation line.'}
      onBack={onClose}
      backLabel="Back to procurement plan"
      error={serverError}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || linkedRecordsLoading || linkedRecordsError} onClick={handleSubmit(submit)}>
            {isSubmitting ? 'Saving…' : 'Save draft'}
          </Button>
        </>
      }
    >
      {draft.pendingDraft && (
        <div role="status" className="mb-4 rounded-lg border border-info/30 bg-info-soft p-3 text-sm text-text-secondary">
          <p>An APP form recovery copy from {new Date(draft.pendingDraft.savedAt).toLocaleString('en-PH')} is available on this browser.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={draft.restoreDraft}>Restore draft</Button>
            <Button size="sm" variant="secondary" onClick={draft.discardDraft}>Discard it</Button>
          </div>
        </div>
      )}
      {!draft.pendingDraft && draft.lastSavedAt && (
        <p className="mb-3 text-xs text-text-faint">Draft recovery saved locally. Save this form to update the official procurement plan.</p>
      )}
      <LargeFormPage.Section
        title="Linked records"
        description={isIndicative
          ? 'Choose the fiscal year and adopted investment program project for this indicative line.'
          : 'Choose the project this procures and the enacted ordinance line it is charged against.'}
      >
        <div className="flex flex-col gap-4">
          <div>
            <span className="mb-2 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">Plan cycle</span>
            {defaultValues?.id ? (
              <>
                <input type="hidden" {...planCycleRegistration} />
                <p className="rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy">
                  {PLAN_CYCLE_LABELS[watchedPlanCycle] ?? watchedPlanCycle}
                </p>
              </>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { value: 'indicative', title: 'Indicative plan', detail: 'Prepared during budget planning; no ordinance line is needed yet.' },
                  { value: 'final', title: 'Final APP', detail: 'After enactment. Charged against an enacted appropriation line.' },
                ].map((option) => (
                  <label key={option.value} className={`flex cursor-pointer gap-3 rounded border p-3 ${watchedPlanCycle === option.value ? 'border-navy bg-chip/40' : 'border-border-muted bg-surface'}`}>
                    <input type="radio" value={option.value} {...planCycleRegistration} onChange={changePlanCycle} className="mt-0.5 accent-navy" />
                    <span>
                      <span className="block text-[13px] font-medium text-navy">{option.title}</span>
                      <span className="mt-1 block text-xs text-text-secondary">{option.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {errors.planCycle && <p className="mt-1 text-xs text-danger">Select a plan cycle.</p>}
          </div>
          <div>
            <label htmlFor="app-fiscal-year" className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              Fiscal year
            </label>
            <select
              id="app-fiscal-year"
              {...fiscalYearRegistration}
              onChange={(event) => {
                yearChosenByUser.current = true
                fiscalYearRegistration.onChange(event)
                setValue('aipEntryId', '')
                setValue('appropriationId', '')
              }}
              className="w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
            >
              {fiscalYears.map((fiscalYear) => (
                <option key={fiscalYear} value={fiscalYear}>FY {fiscalYear}</option>
              ))}
            </select>
            {errors.fiscalYear && <p className="mt-1 text-xs text-danger">{errors.fiscalYear.message}</p>}
            <p className="mt-1.5 text-xs text-text-faint">
              {isIndicative ? 'Choose the fiscal year of the adopted AIP project.' : 'Choose the year of the adopted AIP and enacted appropriation.'}
            </p>
          </div>

          {linkedRecordsLoading && <p className="text-xs text-text-faint">Loading linked records…</p>}
          {linkedRecordsError && (
            <p role="alert" className="text-xs text-danger">
              Linked records could not be loaded.{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => {
                setLinkedRecordsLoading(true)
                setLinkedRecordsReload((value) => value + 1)
              }}>Try again</button>
            </p>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              Investment program project
            </label>
            <select
              {...register('aipEntryId')}
              className="w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
            >
              <option value="">— select an adopted investment program project —</option>
              {yearAipEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} ({entry.fiscalYear}) · {peso(entry.estimatedCost)} programmed
                </option>
              ))}
            </select>
            {errors.aipEntryId && <p className="mt-1 text-xs text-danger">{errors.aipEntryId.message}</p>}
            {!linkedRecordsLoading && !linkedRecordsError && yearAipEntries.length === 0 && (
              <p className="mt-1.5 text-xs text-warning">
                No adopted investment program projects are available for FY {year}. Create and adopt an AIP
                project before filing this APP line.
              </p>
            )}
          </div>

          {!isIndicative && <div>
            <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              Charged against (appropriation line)
            </label>
            <select
              {...register('appropriationId')}
              className="w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
            >
              <option value="">— select an enacted ordinance line —</option>
              {yearAppropriations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.ordinanceNo} · {row.title} ({peso(row.unprogrammed)} unprogrammed)
                </option>
              ))}
            </select>
            {errors.appropriationId && (
              <p className="mt-1 text-xs text-danger">{errors.appropriationId.message}</p>
            )}
            {selectedLine && (
              <p className="mt-1.5 text-xs text-text-faint">
                {selectedLine.fundLabel} · {selectedLine.expenseClassLabel} — {peso(selectedLine.amount)}{' '}
                appropriated, {peso(selectedLine.programmed)} already planned,{' '}
                <strong className="text-text-secondary">{peso(selectedLine.unprogrammed)} still unprogrammed</strong>.
              </p>
            )}
            {!linkedRecordsLoading && !linkedRecordsError && yearAppropriations.length === 0 && (
              <p className="mt-1.5 text-xs text-warning">
                No enacted appropriation lines are available for FY {year}. The Budget Officer must record the Appropriation
                Ordinance before procurement can be planned.
              </p>
            )}
          </div>}
          {isIndicative && (
            <p className="rounded border border-info/20 bg-info-soft p-3 text-xs text-text-secondary">
              An indicative plan is prepared before the appropriation ordinance. Add the enacted ordinance line when preparing the final APP.
            </p>
          )}
        </div>
      </LargeFormPage.Section>

      <LargeFormPage.Section
        title="Project"
        description="What will be procured and for how much."
      >
        <div className="flex flex-col gap-4">
          <FormField label="Project title" error={errors.projectTitle?.message} registration={register('projectTitle')} />

          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Description</label>
            <textarea
              rows={2}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              {...register('description')}
            />
          </div>

          <div>
            <label htmlFor="app-procurement-category" className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Procurement category
            </label>
            <select
              id="app-procurement-category"
              className="w-full rounded border border-border-muted bg-surface px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              {...register('category')}
            >
              <option value="">Select a category</option>
              {PROCUREMENT_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {errors.category && <p className="mt-1 text-xs text-danger">{errors.category.message}</p>}
            <p className="mt-1.5 text-xs text-text-faint">Used to calculate the suggested procurement mode.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
              label="ABC (₱)"
              type="number"
              step="0.01"
              error={errors.abc?.message}
              registration={register('abc')}
            />
            <FormField label="Unit" registration={register('unit')} placeholder="e.g. units" />
            <FormField label="Quantity" type="number" registration={register('quantity')} />
          </div>

          {suggestion && (
            <div className="flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
              <Info size={14} className="mt-0.5 shrink-0 text-navy" />
              <div className="text-xs text-text-secondary">
                <p>
                  Suggested mode: <strong className="text-navy">{modeLabel(suggestion.suggested)}</strong>
                </p>
                <p className="mt-0.5">{suggestion.rationale}</p>
                <p className="mt-0.5 font-mono text-[11px] text-text-faint">
                  {suggestion.citation} · {suggestion.lgu.incomeClass}-class {suggestion.lgu.lguType}
                  {suggestion.requiresPosting ? ' · posting required' : ' · posting not required'}
                </p>
              </div>
            </div>
          )}
        </div>
      </LargeFormPage.Section>

      <LargeFormPage.Section
        title="Procurement mode"
        description="How this will be procured. Alternative modes need a written justification."
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Procurement mode
            </label>
            <select
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              {...register('procurementMode')}
            >
              {PROCUREMENT_MODES.map((mode) => (
                <option key={mode.key} value={mode.key}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Justification (required for alternative modes)
            </label>
            <textarea
              rows={2}
              className={`w-full rounded border px-4 py-2 text-sm text-navy focus:outline-none ${
                errors.justification ? 'border-danger' : 'border-border-muted focus:border-navy'
              }`}
              {...register('justification')}
            />
            {errors.justification && <p className="mt-1 text-xs text-danger">{errors.justification.message}</p>}
          </div>
        </div>
      </LargeFormPage.Section>

      <LargeFormPage.Section
        title="Schedule and coding"
        description="When it is needed and how it is tracked."
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                Target start quarter
              </label>
              <select
                className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:outline-none"
                {...register('targetStartQuarter')}
              >
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                Target completion quarter
              </label>
              <select
                className={`w-full rounded border px-4 py-2 text-sm text-navy focus:outline-none ${
                  errors.targetCompletionQuarter ? 'border-danger' : 'border-border-muted'
                }`}
                {...register('targetCompletionQuarter')}
              >
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              {errors.targetCompletionQuarter && (
                <p className="mt-1 text-xs text-danger">{errors.targetCompletionQuarter.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Fund source" registration={register('fundSource')} />
            <FormField label="Account code" registration={register('accountCode')} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="MFO ID" registration={register('mfoId')} />
            <FormField label="PAP code" registration={register('papCode')} />
            <FormField label="UACS code" registration={register('uacsCode')} />
          </div>
        </div>
      </LargeFormPage.Section>
    </LargeFormPage>
  )
}

function ReturnModal({ entry, onClose, onConfirm }) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')

  return (
    <Modal title={`Return "${entry.projectTitle}"`} onClose={onClose}>
      <p className="mb-3 text-sm text-text-secondary">
        The entry goes back to the requester as editable. Remarks are required.
      </p>
      <textarea
        rows={3}
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
        placeholder="What needs to change?"
      />
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <button
          type="button"
          onClick={async () => {
            try {
              await onConfirm(remarks)
              onClose()
            } catch (err) {
              setError(err.response?.data?.message ?? 'Could not return the entry.')
            }
          }}
          className="min-h-11 w-full rounded-sm bg-danger px-4 py-2 text-center text-[11px] font-medium tracking-[0.03em] text-white sm:w-auto"
        >
          RETURN ENTRY
        </button>
      </div>
    </Modal>
  )
}

export default function AppEntries() {
  const { fiscalYear, setFiscalYear } = useActionQueue()
  const { user } = useAuth()
  const permissions = usePermissions()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [returning, setReturning] = useState(null)
  const [committeeEntry, setCommitteeEntry] = useState(null)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')

  // State is only set from the promise callbacks, never synchronously in the
  // effect body — that would cascade renders.
  // Fetched once and filtered in the browser. The status filter used to be a
  // query parameter, which meant every change of the dropdown was a round trip
  // and search could not be combined with it. The endpoint returns the whole
  // set unpaged, so there is nothing to gain by asking the server again.
  const runTransition = async (entry, action, remarks, attendance) => {
    setActionError('')
    try {
      await appApi.transitionAppEntry(entry.id, action, remarks, attendance)
      const messages = { submit: 'Procurement plan submitted. The BAC Secretariat may now review and consolidate it.', consolidate: 'BAC recommendation recorded with committee attendance. The plan is ready for funding certification.', certify: 'Funding certified. The procurement plan is ready for approval.', approve: 'Procurement plan approved and locked. Procurement preparation may now proceed.', return: 'Procurement plan returned to the requesting office. Review the remarks and submit the corrected plan.' }
      setMessage(messages[action] ?? 'Procurement plan updated. Review its current status before continuing.')
      refresh()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Could not update that entry.')
      throw err
    }
  }

  const canCreate = permissions.has('app.create')

  // Search, filter, sort and paging over the loaded set. Sorting the money and
  // the mode by their *displayed* value would sort "₱1,200,000" as text and put
  // it below "₱900" — so ABC sorts on the raw number and Mode on its label.
  const table = useServerTable(appApi.fetchAppEntries, {
    urlKey: 'appEntries',
    baseParams: { fiscalYear },
    searchKeys: ['projectTitle', 'implementingUnitCode', 'description', 'fundSource', 'accountCode'],
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(APP_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'procurementMode',
        label: 'All modes',
        options: PROCUREMENT_MODES.map((mode) => ({ value: mode.key, label: mode.label })),
      },
      { key: 'targetStartQuarter', label: 'All start quarters', options: QUARTERS },
    ],
    accessors: {
      abc: (entry) => Number(entry.abc ?? 0),
      procurementMode: (entry) => modeLabel(entry.procurementMode),
      status: (entry) => APP_STATUS_LABELS[entry.status] ?? entry.status,
    },
  })
  const { pageRows, paginationProps, refresh, loading } = table

  // Item 12: the fifteen-field entry form renders as a full page, not as a
  // modal over the list. The short return-reason modal stays a modal.
  if (creating) {
    return (
      <DashboardPage>
        <EntryFormModal
          title="New procurement plan line"
          defaultValues={{
            fiscalYear: fiscalYear === 'all' ? currentFiscalYear() : Number(fiscalYear),
            planCycle: 'final',
            projectTitle: '',
            description: '',
            category: 'goods',
            aipEntryId: '',
            appropriationId: '',
            abc: '',
            unit: '',
            quantity: '',
            procurementMode: 'competitiveBidding',
            targetStartQuarter: 'Q1',
            targetCompletionQuarter: 'Q4',
            fundSource: '',
            accountCode: '',
            mfoId: '',
            papCode: '',
            uacsCode: '',
            justification: '',
          }}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await appApi.createAppEntry(values)
            refresh()
          }}
        />
      </DashboardPage>
    )
  }

  if (editing) {
    return (
      <DashboardPage>
        <EntryFormModal
          title={`Edit ${editing.projectTitle}`}
          defaultValues={{
            ...editing,
            aipEntryId: editing.aipEntryId ?? '',
            appropriationId: editing.appropriationId ?? '',
            description: editing.description ?? '',
            category: normalizeCategory(editing.category),
            unit: editing.unit ?? '',
            quantity: editing.quantity ?? '',
            fundSource: editing.fundSource ?? '',
            accountCode: editing.accountCode ?? '',
            mfoId: editing.mfoId ?? '',
            papCode: editing.papCode ?? '',
            uacsCode: editing.uacsCode ?? '',
            justification: editing.justification ?? '',
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            const editableValues = { ...values }
            delete editableValues.planCycle
            await appApi.updateAppEntry(editing.id, editableValues)
            refresh()
          }}
        />
      </DashboardPage>
    )
  }

  return (
    <DashboardPage>
      <PageHeader
        title="Annual Procurement Plan"
        subtitle="Prepare indicative lines before budget enactment, then final APP lines against enacted appropriations."
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              NEW PLAN LINE
            </Button>
          )
        }
      />
      <FiscalYearFilter value={fiscalYear} onChange={(year) => { paginationProps.onPageChange(1); setFiscalYear(year) }} />

      <Card bodyClassName="p-4">
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search project, description, fund or account…" />
      </Card>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Procurement plan entries" icon={ClipboardList} bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading entries...</p>
        ) : table.failed ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] text-danger">Could not load APP entries.</p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={refresh}>Try again</Button>
          </div>
        ) : table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.isDirty ? 'No entries match your search or filters.' : 'No APP entries yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('projectTitle')}>Project</SortableTh>
                  <Th>Cycle / stage</Th>
                  <Th>Unit</Th>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <Th>Mode</Th>
                  <SortableTh {...table.sortProps('targetStartQuarter')}>Schedule</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((entry) => {
                  const next = TRANSITION_FOR_STATUS[entry.status]
                  const canAdvance = next && permissions.has(next.permission) && (!['consolidate', 'certify', 'approve'].includes(next.action) || entry.createdById !== user?.id)
                  const returnPermission = RETURN_PERMISSION_FOR_STATUS[entry.status]
                  const canReturn = returnPermission && permissions.has(returnPermission)

                  return (
                    <tr key={entry.id} className="border-t border-border-muted">
                      <td className="px-4 py-3 text-[13px] text-navy">
                        {entry.projectTitle}
                        {entry.returnRemarks && (
                          <p className="mt-1 text-xs text-danger">Returned: {entry.returnRemarks}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        <p className="font-medium text-navy">
                          FY {entry.fiscalYear} · {entry.planCycle === 'indicative' ? 'Indicative' : 'Final'}
                        </p>
                        <p className="mt-1">{PLAN_STAGE_LABELS[entry.planStage] ?? entry.planStage ?? 'PPMP'}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-navy">{entry.implementingUnitCode ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">{peso(entry.abc)}</td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{modeLabel(entry.procurementMode)}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                        {entry.targetStartQuarter} → {entry.targetCompletionQuarter}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={APP_STATUS_TONES[entry.status]}>{APP_STATUS_LABELS[entry.status]}</Badge>
                        <NextInline next={appNext(entry)} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex w-max items-center gap-2">
                          {entry.editable && canCreate && (
                            <Button
                              size="table"
                              variant="secondary"
                              onClick={() => setEditing(entry)}
                            >
                              Edit
                            </Button>
                          )}
                          {canAdvance && (
                            <Button
                              size="table"
                              onClick={() => next.action === 'consolidate' ? setCommitteeEntry(entry) : runTransition(entry, next.action).catch(() => {})}
                            >
                              {next.label}
                            </Button>
                          )}
                          {canReturn && (
                            <Button
                              size="table"
                              variant="warning"
                              onClick={() => setReturning(entry)}
                            >
                              Return
                            </Button>
                          )}
                          {entry.status === 'locked' && (
                            <span className="flex items-center gap-1 text-[11px] text-text-faint">
                              <Lock size={11} /> LOCKED
                            </span>
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
        <Pagination {...paginationProps} label="entries" />
      </Card>

      {message && <p role="status" className="rounded border border-success/20 bg-success/5 p-3 text-sm text-success">{message}</p>}
      {committeeEntry && <CommitteeActionModal title="Record BAC plan recommendation" description={`Confirm the participating BAC members for ${committeeEntry.projectTitle}. The plan will proceed to funding certification.`} onClose={() => setCommitteeEntry(null)} onSubmit={(attendance) => runTransition(committeeEntry, 'consolidate', undefined, attendance)} />}
      {returning && (
        <ReturnModal
          entry={returning}
          onClose={() => setReturning(null)}
          onConfirm={(remarks) => runTransition(returning, 'return', remarks)}
        />
      )}
    </DashboardPage>
  )
}
