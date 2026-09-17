import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, BellRing, CalendarClock, Landmark } from 'lucide-react'
import * as financeApi from '../../api/finance'
import { SEVERITY_TONES } from '../../api/finance'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ProgressRow from '../../components/ui/ProgressRow'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

// The monitor reads enacted Appropriation Ordinance lines. The APP is shown as
// programmed work; it is not authority to spend or a financial commitment.
const peso = (value) => `\u20B1${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
const percent = (ratio) => `${Math.round((ratio ?? 0) * 100)}%`

const VIEWS = [
  { key: 'offices', label: 'By Office' },
  { key: 'lines', label: 'By Ordinance Line' },
]

export default function UnexpendedMonitor() {
  const permissions = usePermissions()
  const [data, setData] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState('offices')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => {
    setLoadError('')
    setRefreshToken((token) => token + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    financeApi.fetchBudgetMonitor()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setLoadError('')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.response?.data?.message ?? 'The budget utilisation monitor could not be loaded.')
      })
    return () => { cancelled = true }
  }, [refreshToken])

  const canDispatch = permissions.has('budget.certify')
  const inAlertWindow = data && data.daysToYearEnd <= data.alertWindowDays
  const rows = data ? (view === 'offices' ? data.offices : data.lines) : []
  const highRiskLines = data?.lines.filter((line) => line.severity === 'high').length ?? 0
  const mediumRiskLines = data?.lines.filter((line) => line.severity === 'medium').length ?? 0
  const appropriated = Number(data?.totals.appropriated ?? 0)
  const programmedRate = appropriated > 0 ? (Number(data?.totals.programmed ?? 0) / appropriated) * 100 : 0
  const obligationRate = appropriated > 0 ? (Number(data?.totals.obligated ?? 0) / appropriated) * 100 : 0
  const disbursementRate = appropriated > 0 ? (Number(data?.totals.disbursed ?? 0) / appropriated) * 100 : 0

  const table = useTableControls(rows, {
    searchKeys: ['departmentCode', 'departmentName', 'title', 'papCode', 'ordinanceNo'],
    filters: [{ key: 'severity', label: 'All risk levels' }, { key: 'departmentCode', label: 'All offices' }],
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

  const dispatchAlerts = async () => {
    const result = await financeApi.dispatchAlerts().catch(() => null)
    setNotice(result
      ? {
          tone: result.dispatched > 0 ? 'success' : 'info',
          text: result.dispatched > 0 ? `${result.dispatched} alert(s) sent to budget certifiers.` : (result.message ?? 'No alerts were due.'),
        }
      : { tone: 'danger', text: 'Could not dispatch alerts. Please try again.' })
    refresh()
  }

  const noticeClass = notice?.tone === 'danger'
    ? 'border-danger/20 bg-danger/10 text-danger'
    : notice?.tone === 'success'
      ? 'border-success/20 bg-success/10 text-success'
      : 'border-navy/20 bg-chip/40 text-text-secondary'

  return (
    <DashboardPage>
      <PageHeader
        title="Budget Utilisation Monitor"
        subtitle="Appropriated, programmed, obligated and disbursed, as fiscal year-end approaches."
        meta={data ? [
          { label: 'Fiscal year', value: `FY${data.fiscalYear}` },
          {
            label: 'Needs attention',
            value: highRiskLines > 0
              ? `${highRiskLines} high-risk line${highRiskLines === 1 ? '' : 's'}`
              : `${mediumRiskLines} monitored line${mediumRiskLines === 1 ? '' : 's'}`,
          },
        ] : []}
        actions={canDispatch && <Button icon={BellRing} onClick={dispatchAlerts}>SEND ALERTS</Button>}
      />

      {notice && <p role={notice.tone === 'danger' ? 'alert' : 'status'} className={`rounded border px-4 py-3 text-sm ${noticeClass}`}>{notice.text}</p>}

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>RETRY</Button>
        </div>
      )}

      {!data && !loadError ? (
        <p className="text-[13px] text-text-faint">Loading budget utilisation...</p>
      ) : !data ? null : (
        <>
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${inAlertWindow ? 'border-warning/30 bg-warning/10' : 'border-border-muted bg-chip/40'}`}>
            <CalendarClock size={16} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-[13px] text-text-secondary">
              <strong className="text-navy">{data.daysToYearEnd} days</strong> to the end of FY{data.fiscalYear}.
              {inAlertWindow ? ' Recurring maturity alerts are active.' : ` Alerts begin within ${data.alertWindowDays} days of year-end.`}
            </p>
          </div>

          {/* These are one financial position, not seven equal-weight tiles:
              authority and planning, execution and liabilities, then the only
              balance that needs immediate year-end attention. */}
          <Card title="Budget Position" icon={Landmark} bodyClassName="p-0">
            <div className="grid divide-y divide-border-muted lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              <section className="p-5">
                <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">Authority & planning</p>
                <p className="mt-1 text-xl font-semibold text-navy">{peso(data.totals.appropriated)}</p>
                <p className="text-xs text-text-faint">Authorised by ordinance</p>
                <div className="mt-4 space-y-3">
                  <ProgressRow label="Programmed in the APP" value={percent(programmedRate / 100)} percent={programmedRate} />
                  <p className="text-xs text-text-faint">{peso(data.totals.programmed)} planned procurement; this is not yet a commitment.</p>
                </div>
              </section>
              <section className="p-5">
                <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">Execution & liabilities</p>
                <p className="mt-1 text-xl font-semibold text-navy">{peso(data.totals.obligated)}</p>
                <p className="text-xs text-text-faint">Committed by certified ORS</p>
                <div className="mt-4 space-y-3">
                  <ProgressRow label="Released from treasury" value={percent(disbursementRate / 100)} percent={disbursementRate} tone="success" />
                  <ProgressRow label="Committed" value={percent(obligationRate / 100)} percent={obligationRate} />
                  <p className="text-xs text-text-faint">{peso(data.totals.disbursed)} disbursed; {peso(data.totals.unpaid)} still unpaid.</p>
                </div>
              </section>
              <section className="bg-warning/5 p-5">
                <p className="text-[11px] font-medium tracking-[0.03em] text-warning uppercase">Requires attention</p>
                <p className="mt-1 text-xl font-semibold text-warning">{peso(data.totals.unobligated)}</p>
                <p className="text-xs text-text-secondary">Uncommitted; it may revert at year-end.</p>
                <div className="mt-4 border-t border-warning/20 pt-3 text-xs text-text-secondary">
                  <p><span className="font-semibold text-navy">{highRiskLines}</span> high-risk and <span className="font-semibold text-navy">{mediumRiskLines}</span> monitored ordinance line{highRiskLines + mediumRiskLines === 1 ? '' : 's'}.</p>
                  <p className="mt-2">{peso(data.totals.unexpended)} remains unexpended, including committed but unpaid obligations.</p>
                </div>
              </section>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            {VIEWS.map((item) => (
              <button key={item.key} type="button" onClick={() => setView(item.key)} aria-pressed={view === item.key}
                className={`rounded border px-4 py-2 text-[11px] font-medium tracking-[0.03em] uppercase ${view === item.key ? 'border-navy bg-accent text-accent-fg' : 'border-border-muted bg-surface text-text-secondary'}`}>
                {item.label}
              </button>
            ))}
          </div>

          <Card title={view === 'offices' ? 'By Office' : 'By Ordinance Line'} icon={TrendingUp} bodyClassName="">
            {rows.length > 0 && <div className="border-b border-border-muted p-4"><TableToolbar {...table.toolbarProps} searchPlaceholder="Search office or ordinance line..." /></div>}
            {table.rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                {table.totalBeforeFilters === 0 ? 'No enacted appropriations for this fiscal year. Record the Appropriation Ordinance first.' : 'Nothing matches your search or filters.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-sidebar"><tr>
                    <SortableTh {...table.sortProps('label')}>{view === 'offices' ? 'Office' : 'Ordinance Line'}</SortableTh>
                    <SortableTh {...table.sortProps('appropriated')}>Appropriated</SortableTh>
                    <SortableTh {...table.sortProps('programmed')}>Programmed</SortableTh>
                    <SortableTh {...table.sortProps('obligated')}>Obligated</SortableTh>
                    <SortableTh {...table.sortProps('disbursed')}>Disbursed</SortableTh>
                    <SortableTh {...table.sortProps('unobligated')}>Unobligated</SortableTh>
                    <SortableTh {...table.sortProps('utilisationRate')}>Utilisation</SortableTh>
                    <SortableTh {...table.sortProps('severity')}>Risk</SortableTh>
                  </tr></thead>
                  <tbody>
                    {table.pageRows.map((row) => (
                      <tr key={row.id ?? row.departmentId} className="border-t border-border-muted">
                        <td className="px-4 py-3 text-[13px] text-navy">
                          {view === 'offices' ? <><span className="font-mono text-xs text-navy">{row.departmentCode}</span><p className="mt-0.5 text-xs text-text-secondary">{row.departmentName}</p></> : <><span className="font-mono text-xs text-navy">{row.papCode ?? row.ordinanceNo}</span><p className="mt-0.5 max-w-xs text-xs text-text-secondary">{row.title}</p><p className="mt-0.5 text-[11px] text-text-faint">{row.departmentCode} - {row.fund === 'generalFund' ? 'General Fund' : row.fund}</p></>}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap text-navy">{peso(row.appropriated)}</td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">{peso(row.programmed)}</td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.obligated)}</td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.disbursed)}</td>
                        <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap text-warning">{peso(row.unobligated)}</td>
                        <td className="w-48 px-4 py-3"><ProgressRow label="" value={percent(row.utilisationRate)} percent={Math.round((row.utilisationRate ?? 0) * 100)} tone={row.utilisationRate > 0.7 ? 'success' : 'navy'} /></td>
                        <td className="px-4 py-3"><Badge tone={SEVERITY_TONES[row.severity]}>{row.severity}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {table.rows.length > 0 && <Pagination {...table.paginationProps} label={view === 'offices' ? 'offices' : 'lines'} />}
          </Card>

          <div className="rounded-lg border border-border-muted bg-surface p-4">
            <p className="text-[11px] font-medium tracking-[0.03em] text-text-secondary uppercase">How these figures relate</p>
            <p className="mt-2 text-xs leading-relaxed text-text-faint">
              <strong className="text-text-secondary">Appropriated</strong> is what the Sanggunian authorised by ordinance - the real budget.{' '}
              <strong className="text-text-secondary">Programmed</strong> is what the Annual Procurement Plan intends to buy, which commits nothing.{' '}
              <strong className="text-text-secondary">Obligated</strong> is what certified Obligation Requests have committed, and{' '}
              <strong className="text-text-secondary">disbursed</strong> is what the Treasurer has released. Near year-end, unobligated balance is the figure that needs action.
            </p>
          </div>
        </>
      )}
    </DashboardPage>
  )
}
