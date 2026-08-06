import { useEffect, useState, useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ClipboardList, Info, Lock } from 'lucide-react'
import * as appApi from '../../api/appEntries'
import * as financeApi from '../../api/finance'
import {
  APP_STATUS_LABELS,
  APP_STATUS_TONES,
  TRANSITION_FOR_STATUS,
  RETURN_PERMISSION_FOR_STATUS,
  PROCUREMENT_MODES,
  modeLabel,
} from '../../api/appEntries'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

// Mirrors the Section 4.3 rules the server enforces.
const entrySchema = z
  .object({
    projectTitle: z.string().trim().min(1, 'Project title is required'),
    description: z.string().optional(),
    // An APP entry is a plan to spend appropriated money, so it must name the
    // ordinance line it draws on. The server refuses entries without one.
    appropriationId: z.coerce.number({ message: 'An appropriation line is required' }).positive(
      'Select the appropriation line this plan is charged against.'
    ),
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
  const [serverError, setServerError] = useState('')
  const [suggestion, setSuggestion] = useState(null)
  const [appropriations, setAppropriations] = useState([])

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(entrySchema), defaultValues, mode: 'onBlur' })

  // Ask the server what mode the ABC implies, as it is typed. The thresholds
  // come from the RA 12009 IRR and depend on the LGU's classification, so this
  // is not something the frontend can work out on its own.
  // Only enacted lines are offered — a draft ordinance authorises nothing, so
  // planning against one would be meaningless.
  useEffect(() => {
    let cancelled = false
    financeApi
      .fetchAppropriations({ chargeable: 'true' })
      .then((rows) => !cancelled && setAppropriations(rows))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const watchedAbc = useWatch({ control, name: 'abc' })
  const watchedAppropriation = useWatch({ control, name: 'appropriationId' })
  const selectedLine = appropriations.find((row) => String(row.id) === String(watchedAppropriation))
  useEffect(() => {
    const abc = Number(watchedAbc)
    if (!abc || Number.isNaN(abc) || abc <= 0) return

    let cancelled = false
    const timer = setTimeout(() => {
      appApi
        .fetchModeSuggestion(abc)
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
  }, [watchedAbc])

  const submit = async (values) => {
    setServerError('')
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong.')
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        <FormField label="Project title" error={errors.projectTitle?.message} registration={register('projectTitle')} />

        {/* The budget line first: everything below is constrained by it. */}
        <div>
          <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
            Charged against (appropriation line)
          </label>
          <select
            {...register('appropriationId')}
            className="w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none"
          >
            <option value="">— select an enacted ordinance line —</option>
            {appropriations.map((row) => (
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
          {appropriations.length === 0 && (
            <p className="mt-1.5 text-xs text-warning">
              No enacted appropriation lines are available. The Budget Officer must record the Appropriation
              Ordinance before procurement can be planned.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Description</label>
          <textarea
            rows={2}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            {...register('description')}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
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

        <div className="grid grid-cols-2 gap-3">
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

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fund source" registration={register('fundSource')} />
          <FormField label="Account code" registration={register('accountCode')} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="MFO ID" registration={register('mfoId')} />
          <FormField label="PAP code" registration={register('papCode')} />
          <FormField label="UACS code" registration={register('uacsCode')} />
        </div>

        {serverError && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {isSubmitting ? 'SAVING...' : 'SAVE DRAFT'}
          </button>
        </div>
      </form>
    </Modal>
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
              setError(err.response?.data?.message ?? 'Could not return the entry.')
            }
          }}
          className="rounded-sm bg-danger px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-white"
        >
          RETURN ENTRY
        </button>
      </div>
    </Modal>
  )
}

export default function AppEntries() {
  const permissions = usePermissions()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [returning, setReturning] = useState(null)
  const [actionError, setActionError] = useState('')

  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  // State is only set from the promise callbacks, never synchronously in the
  // effect body — that would cascade renders.
  // Fetched once and filtered in the browser. The status filter used to be a
  // query parameter, which meant every change of the dropdown was a round trip
  // and search could not be combined with it. The endpoint returns the whole
  // set unpaged, so there is nothing to gain by asking the server again.
  useEffect(() => {
    let cancelled = false
    appApi
      .fetchAppEntries()
      .then((data) => {
        if (!cancelled) {
          setEntries(data)
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

  const runTransition = async (entry, action, remarks) => {
    setActionError('')
    try {
      await appApi.transitionAppEntry(entry.id, action, remarks)
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
  const table = useTableControls(entries, {
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
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title="Annual Procurement Plan"
        subtitle="No purchase requisition may exist without an approved APP entry."
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              NEW APP ENTRY
            </Button>
          )
        }
      />

      <Card bodyClassName="p-4">
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search project, unit or fund…" />
      </Card>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="APP Entries" icon={ClipboardList} bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading entries...</p>
        ) : table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'No APP entries yet.'
              : 'No entries match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('projectTitle')}>Project</SortableTh>
                  <SortableTh {...table.sortProps('implementingUnitCode')}>Unit</SortableTh>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <SortableTh {...table.sortProps('procurementMode')}>Mode</SortableTh>
                  <SortableTh {...table.sortProps('targetStartQuarter')}>Schedule</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((entry) => {
                  const next = TRANSITION_FOR_STATUS[entry.status]
                  const canAdvance = next && permissions.has(next.permission)
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
                      <td className="px-4 py-3 font-mono text-xs text-navy">{entry.implementingUnitCode ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">{peso(entry.abc)}</td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{modeLabel(entry.procurementMode)}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                        {entry.targetStartQuarter} → {entry.targetCompletionQuarter}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={APP_STATUS_TONES[entry.status]}>{APP_STATUS_LABELS[entry.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3">
                          {entry.editable && canCreate && (
                            <button
                              type="button"
                              onClick={() => setEditing(entry)}
                              className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                            >
                              EDIT
                            </button>
                          )}
                          {canAdvance && (
                            <button
                              type="button"
                              onClick={() => runTransition(entry, next.action).catch(() => {})}
                              className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                            >
                              {next.label}
                            </button>
                          )}
                          {canReturn && (
                            <button
                              type="button"
                              onClick={() => setReturning(entry)}
                              className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                            >
                              RETURN
                            </button>
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

      {creating && (
        <EntryFormModal
          title="New APP entry"
          defaultValues={{
            projectTitle: '',
            description: '',
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
      )}

      {editing && (
        <EntryFormModal
          title={`Edit ${editing.projectTitle}`}
          defaultValues={{
            ...editing,
            description: editing.description ?? '',
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
            await appApi.updateAppEntry(editing.id, values)
            refresh()
          }}
        />
      )}

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
