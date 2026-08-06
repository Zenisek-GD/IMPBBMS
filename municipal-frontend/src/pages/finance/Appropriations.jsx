import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Landmark, Plus, ScrollText, Scale } from 'lucide-react'
import * as financeApi from '../../api/finance'
import { APPROPRIATION_STATUS_TONES, OBLIGATION_STATUS_TONES } from '../../api/finance'
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
import SortableTh from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

// The appropriation register — the Appropriation Ordinance as the system holds
// it. Everything else in the budget module is measured against these rows, so
// this page is effectively the source of truth for how much money exists.
//
// The Budget Officer records what the Sanggunian enacted. The system does not
// create budget and cannot: a line starts as a draft and only authorises
// spending once marked enacted.

const peso = (value) => `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const TABS = [
  { key: 'appropriations', label: 'Appropriation Lines', icon: ScrollText },
  { key: 'obligations', label: 'Obligation Register', icon: Scale },
]

function AppropriationForm({ options, departments, onSubmit, onClose }) {
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      fiscalYear: new Date().getFullYear(),
      type: 'annual',
      fund: 'generalFund',
      expenseClass: 'mooe',
      status: 'enacted',
    },
  })

  const submit = async (values) => {
    setServerError('')
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'That line could not be recorded.')
    }
  }

  const selectClass =
    'w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'

  return (
    <Modal title="Record an appropriation line" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        <p className="rounded border border-border-muted bg-chip/40 px-3 py-2 text-xs text-text-secondary">
          Record what the Sanggunian enacted. A line marked <strong>draft</strong> authorises nothing and cannot be
          planned or charged against.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ordinance number" registration={register('ordinanceNo')} placeholder="Ord. No. 2026-01" />
          <FormField label="Ordinance date" type="date" registration={register('ordinanceDate')} />
        </div>

        <FormField label="Title" registration={register('title')} placeholder="e.g. Local Roads Outlay" />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Appropriated amount (₱)" type="number" step="0.01" registration={register('amount')} />
          <FormField label="Fiscal year" type="number" registration={register('fiscalYear')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              Fund
            </label>
            <select {...register('fund')} className={selectClass}>
              {(options?.funds ?? []).map((fund) => (
                <option key={fund.key} value={fund.key}>
                  {fund.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              Expense class
            </label>
            <select {...register('expenseClass')} className={selectClass}>
              {(options?.expenseClasses ?? []).map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              Implementing office
            </label>
            <select {...register('departmentId')} className={selectClass}>
              <option value="">— none —</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              Type
            </label>
            <select {...register('type')} className={selectClass}>
              {(options?.types ?? []).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="PAP code" registration={register('papCode')} />
          <FormField label="UACS code" registration={register('uacsCode')} />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
            Status
          </label>
          <select {...register('status')} className={selectClass}>
            <option value="enacted">Enacted — chargeable</option>
            <option value="draft">Draft — not yet chargeable</option>
          </select>
        </div>

        {serverError && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            CANCEL
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'RECORDING...' : 'RECORD LINE'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Appropriations() {
  const permissions = usePermissions()
  const [tab, setTab] = useState('appropriations')
  const [rows, setRows] = useState([])
  const [obligations, setObligations] = useState([])
  const [options, setOptions] = useState(null)
  const [departments, setDepartments] = useState([])
  const [creating, setCreating] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])
  const canManage = permissions.has('budget.manageAppropriations')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      financeApi.fetchAppropriations(),
      financeApi.fetchObligations(),
      financeApi.fetchAppropriationOptions(),
    ])
      .then(([lines, obligationRows, optionSet]) => {
        if (cancelled) return
        setRows(lines)
        setObligations(obligationRows)
        setOptions(optionSet)
        // Offices are derived from the lines already loaded, so the page does
        // not need the departments endpoint (which is admin-only).
        const seen = new Map()
        for (const line of lines) {
          if (line.departmentId && !seen.has(line.departmentId)) {
            seen.set(line.departmentId, { id: line.departmentId, name: line.departmentName })
          }
        }
        setDepartments([...seen.values()])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const totals = rows.reduce(
    (sum, row) => ({
      amount: sum.amount + Number(row.amount ?? 0),
      programmed: sum.programmed + Number(row.programmed ?? 0),
      obligated: sum.obligated + Number(row.obligated ?? 0),
      available: sum.available + Number(row.available ?? 0),
    }),
    { amount: 0, programmed: 0, obligated: 0, available: 0 }
  )

  // Two independent tables on one page, so each keeps its own controls and its
  // own page position — searching the ordinance lines must not disturb the
  // obligation register, and paging one must not scroll the other. Every money
  // column sorts on the raw number rather than the formatted peso string.
  const lineTable = useTableControls(rows, {
    searchKeys: ['ordinanceNo', 'title', 'papCode', 'departmentName', 'fundLabel', 'expenseClassLabel'],
    filters: [
      { key: 'fundLabel', label: 'All funds' },
      { key: 'expenseClassLabel', label: 'All expense classes' },
      { key: 'departmentName', label: 'All offices' },
      { key: 'status', label: 'All statuses' },
    ],
    accessors: {
      amount: (row) => Number(row.amount ?? 0),
      programmed: (row) => Number(row.programmed ?? 0),
      obligated: (row) => Number(row.obligated ?? 0),
      available: (row) => Number(row.available ?? 0),
    },
  })

  const obligationTable = useTableControls(obligations, {
    searchKeys: ['obligationNo', 'prNumber', 'appropriationTitle', 'ordinanceNo', 'certifiedByName'],
    filters: [
      { key: 'status', label: 'All statuses' },
      { key: 'certifiedByName', label: 'All certifying officers' },
    ],
    accessors: { amount: (row) => Number(row.amount ?? 0) },
  })

  const { pageRows: linePage, paginationProps: lineProps } = lineTable
  const { pageRows: obligationPage, paginationProps: obligationProps } = obligationTable

  return (
    <DashboardPage>
      <PageHeader
        title="Appropriation Register"
        subtitle="Ordinance lines the LGU may spend against, and the obligations raised on them."
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              RECORD LINE
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total appropriated', totals.amount, 'Authorised by ordinance'],
          ['Programmed in the APP', totals.programmed, 'Planned, not committed'],
          ['Obligated', totals.obligated, 'Committed by ORS'],
          ['Available to commit', totals.available, 'Uncommitted balance'],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-border-muted bg-surface p-4">
            <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">{label}</p>
            <p className="mt-1 text-lg font-bold text-navy">{peso(value)}</p>
            <p className="mt-1 text-xs text-text-faint">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-pressed={tab === item.key}
            className={`flex items-center gap-2 rounded border px-4 py-2 text-[11px] font-medium tracking-[0.03em] uppercase ${
              tab === item.key
                ? 'border-navy bg-accent text-accent-fg'
                : 'border-border-muted bg-surface text-text-secondary'
            }`}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'appropriations' ? (
        <Card title="Appropriation Lines" icon={Landmark} bodyClassName="">
          <div className="border-b border-border-muted p-4">
            <TableToolbar
              {...lineTable.toolbarProps}
              searchPlaceholder="Search ordinance, title, PAP code or office…"
            />
          </div>
          {lineTable.rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-faint">
              {lineTable.totalBeforeFilters === 0
                ? 'No appropriation lines recorded yet.'
                : 'No appropriation lines match your search or filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-sidebar">
                  <tr>
                    <SortableTh {...lineTable.sortProps('ordinanceNo')}>Line</SortableTh>
                    <SortableTh {...lineTable.sortProps('fundLabel')}>Fund / Class</SortableTh>
                    <SortableTh {...lineTable.sortProps('departmentName')}>Office</SortableTh>
                    <SortableTh {...lineTable.sortProps('amount')}>Appropriated</SortableTh>
                    <SortableTh {...lineTable.sortProps('programmed')}>Programmed</SortableTh>
                    <SortableTh {...lineTable.sortProps('obligated')}>Obligated</SortableTh>
                    <SortableTh {...lineTable.sortProps('available')}>Available</SortableTh>
                    <SortableTh {...lineTable.sortProps('status')}>Status</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {linePage.map((row) => (
                    <tr key={row.id} className="border-t border-border-muted">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-navy">{row.ordinanceNo}</span>
                        <p className="mt-0.5 max-w-xs text-[13px] text-navy">{row.title}</p>
                        {row.papCode && <p className="mt-0.5 text-[11px] text-text-faint">{row.papCode}</p>}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">
                        {row.fundLabel}
                        <p className="mt-0.5 text-[11px] text-text-faint">{row.expenseClassLabel}</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.departmentName ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap text-navy">
                        {peso(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                        {peso(row.programmed)}
                      </td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.obligated)}</td>
                      <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap text-success">
                        {peso(row.available)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={APPROPRIATION_STATUS_TONES[row.status]}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Pagination {...lineProps} label="appropriation lines" />
        </Card>
      ) : (
        <Card title="Obligation Register" icon={Scale} bodyClassName="">
          <div className="border-b border-border-muted p-4">
            <TableToolbar
              {...obligationTable.toolbarProps}
              searchPlaceholder="Search ORS, requisition or appropriation…"
            />
          </div>
          {obligationTable.rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-faint">
              {obligationTable.totalBeforeFilters === 0
                ? 'No obligations raised yet. An Obligation Request is created when the Budget Officer certifies a requisition.'
                : 'No obligations match your search or filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-sidebar">
                  <tr>
                    <SortableTh {...obligationTable.sortProps('obligationNo')}>ORS No.</SortableTh>
                    <SortableTh {...obligationTable.sortProps('prNumber')}>Requisition</SortableTh>
                    <SortableTh {...obligationTable.sortProps('appropriationTitle')}>Charged to</SortableTh>
                    <SortableTh {...obligationTable.sortProps('amount')}>Amount</SortableTh>
                    <SortableTh {...obligationTable.sortProps('certifiedByName')}>Certified by</SortableTh>
                    <SortableTh {...obligationTable.sortProps('certifiedAt')}>Date</SortableTh>
                    <SortableTh {...obligationTable.sortProps('status')}>Status</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {obligationPage.map((row) => (
                    <tr key={row.id} className="border-t border-border-muted">
                      <td className="px-4 py-3 font-mono text-xs text-navy">{row.obligationNo}</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">{row.prNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">
                        {row.appropriationTitle}
                        <p className="mt-0.5 text-[11px] text-text-faint">{row.ordinanceNo}</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap text-navy">
                        {peso(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.certifiedByName ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                        {row.certifiedAt ? new Date(row.certifiedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={OBLIGATION_STATUS_TONES[row.status]}>{row.status}</Badge>
                        {row.cancellationReason && (
                          <p className="mt-1 max-w-xs text-[11px] text-text-faint">{row.cancellationReason}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Pagination {...obligationProps} label="obligations" />
        </Card>
      )}

      {creating && (
        <AppropriationForm
          options={options}
          departments={departments}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await financeApi.createAppropriation(values)
            refresh()
          }}
        />
      )}
    </DashboardPage>
  )
}
