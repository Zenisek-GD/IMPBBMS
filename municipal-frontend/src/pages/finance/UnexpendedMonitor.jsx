import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, AlertTriangle, BellRing, CalendarClock, Scale, Landmark } from 'lucide-react'
import * as financeApi from '../../api/finance'
import { SEVERITY_TONES } from '../../api/finance'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ProgressRow from '../../components/ui/ProgressRow'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

// Reads the appropriation ledger, not the procurement plan.
//
// This page used to total the ABCs of approved APP entries and call the result
// "allocated" — treating the plan to buy things as the authority to spend on
// them. Every balance below now derives from enacted Appropriation Ordinance
// lines, with the plan shown separately as "programmed" so the difference
// between what is budgeted, what is planned, what is committed and what is paid
// stays visible.

const peso = (value) => `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
const percent = (ratio) => `${Math.round((ratio ?? 0) * 100)}%`

const VIEWS = [
  { key: 'offices', label: 'By Office' },
  { key: 'lines', label: 'By Ordinance Line' },
]

export default function UnexpendedMonitor() {
  const permissions = usePermissions()
  const [data, setData] = useState(null)
  const [notice, setNotice] = useState('')
  const [view, setView] = useState('offices')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    financeApi
      .fetchBudgetMonitor()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const canDispatch = permissions.has('budget.certify')
  const inAlertWindow = data && data.daysToYearEnd <= data.alertWindowDays
  const rows = data ? (view === 'offices' ? data.offices : data.lines) : []

  // One set of controls serving both views. Switching between them keeps the
  // search and filters, which is the behaviour a reader expects when the two
  // are the same figures cut two ways. Sorting by unobligated balance is the
  // one that matters here: it is the money at risk of lapsing.
  const table = useTableControls(rows, {
    searchKeys: ['departmentCode', 'departmentName', 'title', 'papCode', 'ordinanceNo'],
    filters: [
      { key: 'severity', label: 'All risk levels' },
      { key: 'departmentCode', label: 'All offices' },
    ],
    accessors: {
      appropriated: (row) => Number(row.appropriated ?? 0),
      programmed: (row) => Number(row.programmed ?? 0),
      obligated: (row) => Number(row.obligated ?? 0),
      disbursed: (row) => Number(row.disbursed ?? 0),
      unobligated: (row) => Number(row.unobligated ?? 0),
      utilisationRate: (row) => Number(row.utilisationRate ?? 0),
      label: (row) => (view === 'offices' ? row.departmentCode : (row.papCode ?? row.ordinanceNo)),
    },
  })

  return (
    <DashboardPage>
      <PageHeader
        title="Budget Utilisation Monitor"
        subtitle="Appropriated, programmed, obligated and disbursed, as fiscal year-end approaches."
        actions={
          canDispatch && (
            <Button
              icon={BellRing}
              onClick={async () => {
                const result = await financeApi.dispatchAlerts().catch(() => null)
                setNotice(
                  result
                    ? result.dispatched > 0
                      ? `${result.dispatched} alert(s) sent to budget certifiers.`
                      : (result.message ?? 'No alerts were due.')
                    : 'Could not dispatch alerts.'
                )
                refresh()
              }}
            >
              SEND ALERTS
            </Button>
          )
        }
      />

      {notice && (
        <p className="rounded border border-navy/20 bg-chip/40 px-4 py-3 text-sm text-text-secondary">{notice}</p>
      )}

      {!data ? (
        <p className="text-[13px] text-text-faint">Loading...</p>
      ) : (
        <>
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              inAlertWindow ? 'border-warning/30 bg-warning/10' : 'border-border-muted bg-chip/40'
            }`}
          >
            <CalendarClock size={16} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-[13px] text-text-secondary">
              <strong className="text-navy">{data.daysToYearEnd} days</strong> to the end of FY{data.fiscalYear}.
              {inAlertWindow
                ? ' Recurring maturity alerts are active.'
                : ` Alerts begin within ${data.alertWindowDays} days of year-end.`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Appropriated"
              value={peso(data.totals.appropriated)}
              hint="Authorised by ordinance"
              icon={Landmark}
            />
            <StatCard
              label="Obligated"
              value={peso(data.totals.obligated)}
              hint="Committed by certified ORS"
              icon={Scale}
            />
            <StatCard
              label="Disbursed"
              value={peso(data.totals.disbursed)}
              hint="Released from the treasury"
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              label="Unobligated"
              value={peso(data.totals.unobligated)}
              hint="Uncommitted — reverts at year-end"
              icon={AlertTriangle}
              tone="warning"
            />
          </div>

          {/* Programmed sits apart from the four positions above because it is a
              different kind of number: a plan, not a claim on the money. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border-muted bg-surface p-4">
              <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                Programmed in the APP
              </p>
              <p className="mt-1 text-lg font-bold text-navy">{peso(data.totals.programmed)}</p>
              <p className="mt-1 text-xs text-text-faint">
                Planned procurement charged against these lines — a plan, not yet a commitment.
              </p>
            </div>
            <div className="rounded-lg border border-border-muted bg-surface p-4">
              <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                Unpaid obligations
              </p>
              <p className="mt-1 text-lg font-bold text-navy">{peso(data.totals.unpaid)}</p>
              <p className="mt-1 text-xs text-text-faint">
                Committed but not yet disbursed — the LGU&rsquo;s forward liability.
              </p>
            </div>
            <div className="rounded-lg border border-border-muted bg-surface p-4">
              <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
                Unexpended
              </p>
              <p className="mt-1 text-lg font-bold text-navy">{peso(data.totals.unexpended)}</p>
              <p className="mt-1 text-xs text-text-faint">
                Appropriated but not yet paid out. Always higher than unobligated.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {VIEWS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                aria-pressed={view === item.key}
                className={`rounded border px-4 py-2 text-[11px] font-medium tracking-[0.03em] uppercase ${
                  view === item.key
                    ? 'border-navy bg-accent text-accent-fg'
                    : 'border-border-muted bg-surface text-text-secondary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Card title={view === 'offices' ? 'By Office' : 'By Ordinance Line'} icon={TrendingUp} bodyClassName="">
            {rows.length > 0 && (
              <div className="border-b border-border-muted p-4">
                <TableToolbar {...table.toolbarProps} searchPlaceholder="Search office or ordinance line…" />
              </div>
            )}
            {table.rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                {table.totalBeforeFilters === 0
                  ? 'No enacted appropriations for this fiscal year. Record the Appropriation Ordinance first.'
                  : 'Nothing matches your search or filters.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-sidebar">
                    <tr>
                      <SortableTh {...table.sortProps('label')}>
                        {view === 'offices' ? 'Office' : 'Ordinance Line'}
                      </SortableTh>
                      <SortableTh {...table.sortProps('appropriated')}>Appropriated</SortableTh>
                      <SortableTh {...table.sortProps('programmed')}>Programmed</SortableTh>
                      <SortableTh {...table.sortProps('obligated')}>Obligated</SortableTh>
                      <SortableTh {...table.sortProps('disbursed')}>Disbursed</SortableTh>
                      <SortableTh {...table.sortProps('unobligated')}>Unobligated</SortableTh>
                      <SortableTh {...table.sortProps('utilisationRate')}>Utilisation</SortableTh>
                      <SortableTh {...table.sortProps('severity')}>Risk</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {table.pageRows.map((row) => (
                      <tr key={row.id ?? row.departmentId} className="border-t border-border-muted">
                        <td className="px-4 py-3 text-[13px] text-navy">
                          {view === 'offices' ? (
                            <>
                              <span className="font-mono text-xs text-navy">{row.departmentCode}</span>
                              <p className="mt-0.5 text-xs text-text-secondary">{row.departmentName}</p>
                            </>
                          ) : (
                            <>
                              <span className="font-mono text-xs text-navy">{row.papCode ?? row.ordinanceNo}</span>
                              <p className="mt-0.5 max-w-xs text-xs text-text-secondary">{row.title}</p>
                              <p className="mt-0.5 text-[11px] text-text-faint">
                                {row.departmentCode} · {row.fund === 'generalFund' ? 'General Fund' : row.fund}
                              </p>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap text-navy">
                          {peso(row.appropriated)}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                          {peso(row.programmed)}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.obligated)}</td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.disbursed)}</td>
                        <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap text-warning">
                          {peso(row.unobligated)}
                        </td>
                        <td className="w-48 px-4 py-3">
                          <ProgressRow
                            label=""
                            value={percent(row.utilisationRate)}
                            percent={Math.round((row.utilisationRate ?? 0) * 100)}
                            tone={row.utilisationRate > 0.7 ? 'success' : 'navy'}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={SEVERITY_TONES[row.severity]}>{row.severity}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {table.rows.length > 0 && (
              <Pagination {...table.paginationProps} label={view === 'offices' ? 'offices' : 'lines'} />
            )}
          </Card>

          <div className="rounded-lg border border-border-muted bg-surface p-4">
            <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">
              How these figures relate
            </p>
            <p className="mt-2 text-xs leading-relaxed text-text-faint">
              <strong className="text-text-secondary">Appropriated</strong> is what the Sanggunian authorised by
              ordinance — the only real budget.{' '}
              <strong className="text-text-secondary">Programmed</strong> is what the Annual Procurement Plan
              intends to buy against it, which commits nothing.{' '}
              <strong className="text-text-secondary">Obligated</strong> is what certified Obligation Requests have
              committed, and <strong className="text-text-secondary">disbursed</strong> is what the Treasurer has
              actually released. Near year-end the unobligated balance is the figure that matters: what is not
              committed by December cannot realistically be spent, and reverts.
            </p>
          </div>
        </>
      )}
    </DashboardPage>
  )
}
