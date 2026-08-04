import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Users, Gavel, AlertTriangle, Info } from 'lucide-react'
import * as insightsApi from '../../api/insights'
import { FLAG_TONES, FLAG_LABELS } from '../../api/insights'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import ProgressRow from '../../components/ui/ProgressRow'

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

export default function DssDashboard() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    insightsApi
      .fetchDss()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) {
    return (
      <DashboardPage>
        <p className="text-[13px] text-text-faint">Loading insights...</p>
      </DashboardPage>
    )
  }

  const maxItemValue = Math.max(...data.topItems.map((item) => item.value), 1)

  return (
    <DashboardPage>
      <PageHeader
        title="Decision Support"
        subtitle={`Fiscal year ${data.fiscalYear} — spending patterns, department flags, and competition health.`}
      />

      {/* Say plainly when there is too little history to read much into. */}
      {data.thin && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[13px] text-text-secondary">
            Only {data.sampleSize.requisitions} requisition(s) recorded so far. Trends and averages below are
            based on very little history and should not be read as patterns yet.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Allocated" value={peso(data.headline.totalAllocated)} icon={TrendingUp} />
        <StatCard
          label="Disbursed"
          value={peso(data.headline.totalDisbursed)}
          hint={`${(data.headline.utilisationRatio * 100).toFixed(1)}% utilised`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard label="Active Procurements" value={data.headline.activeProcurements} icon={Gavel} />
        <StatCard label="Awards Issued" value={data.headline.awardsIssued} icon={BarChart3} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Most Procured (by value)" icon={BarChart3}>
          {data.topItems.length === 0 ? (
            <p className="text-[13px] text-text-faint">No requisition lines recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.topItems.map((item) => (
                <ProgressRow
                  key={item.label}
                  label={item.label}
                  value={peso(item.value)}
                  percent={Math.round((item.value / maxItemValue) * 100)}
                  tone="navy"
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Cycle Times" icon={TrendingUp}>
          <div className="flex flex-col">
            {[
              ['Requisition preparation', data.cycleTimes.requisitionPreparationDays],
              ['Procurement to contract', data.cycleTimes.procurementToContractDays],
              ['Delivery inspection', data.cycleTimes.deliveryInspectionDays],
            ].map(([label, days]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-border-muted py-3 last:border-0"
              >
                <span className="text-[13px] text-text-secondary">{label}</span>
                <span className="text-sm font-bold text-navy">
                  {days === null ? 'No data' : `${days} days`}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-faint">
            Averages across completed stages. &ldquo;No data&rdquo; means nothing has reached that stage yet.
          </p>
        </Card>
      </div>

      <Card title="Department Allocation Flags" icon={AlertTriangle} bodyClassName="">
        {data.departmentFlags.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            No approved APP entries this fiscal year.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Department', 'Allocated', 'Committed', 'Utilisation', 'Flag'].map((head) => (
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
                {data.departmentFlags.map((row) => (
                  <tr key={row.departmentId} className="border-t border-border-muted">
                    <td className="px-4 py-3 text-[13px]">
                      <span className="font-mono text-xs text-navy">{row.code}</span>
                      <p className="text-xs text-text-secondary">{row.name}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.allocated)}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.committed)}</td>
                    <td className="px-4 py-3 text-[13px]">{(row.utilisationRatio * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3">
                      <Badge tone={FLAG_TONES[row.flag]}>{FLAG_LABELS[row.flag]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top Suppliers by Award Value" icon={Users}>
          {data.suppliers.length === 0 ? (
            <p className="text-[13px] text-text-faint">Nothing awarded yet.</p>
          ) : (
            <div className="flex flex-col">
              {data.suppliers.map((supplier) => (
                <div
                  key={supplier.name}
                  className="flex items-center justify-between border-b border-border-muted py-3 last:border-0"
                >
                  <div>
                    <p className="text-[13px] text-navy">{supplier.name}</p>
                    <p className="text-xs text-text-faint">{supplier.awards} award(s)</p>
                  </div>
                  <span className="text-sm font-bold text-navy">{peso(supplier.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Competition Health" icon={Gavel}>
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border-muted py-3">
              <span className="text-[13px] text-text-secondary">Average bidders per procurement</span>
              <span className="text-sm font-bold text-navy">
                {data.competition.averageBiddersPerProcurement ?? 'No data'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-text-secondary">Single-bidder procurements</span>
              <span
                className={`text-sm font-bold ${
                  data.competition.singleBidderProcurements > 0 ? 'text-warning' : 'text-success'
                }`}
              >
                {data.competition.singleBidderProcurements}
              </span>
            </div>
          </div>

          {/* A run of single-bidder procurements is the classic favouritism
              signal, so it is surfaced rather than left for someone to notice. */}
          {data.competition.note && (
            <div className="mt-3 flex items-start gap-2 rounded border border-warning/20 bg-warning/10 p-3">
              <Info size={14} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-xs text-text-secondary">{data.competition.note}</p>
            </div>
          )}
        </Card>
      </div>
    </DashboardPage>
  )
}
