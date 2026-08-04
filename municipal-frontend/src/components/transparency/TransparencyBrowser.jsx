import { useEffect, useState } from 'react'
import { Globe, ClipboardList, Gavel, Award, Lock } from 'lucide-react'
import * as transparencyApi from '../../api/transparency'
import Card from '../ui/Card'
import StatCard from '../ui/StatCard'
import Badge from '../ui/Badge'
import Pagination from '../ui/Pagination'
import { usePagination } from '../ui/usePagination'

// The published-records browser, shared by the signed-in portal and the public
// page. Extracted rather than duplicated so a citizen and a staff member are
// always looking at exactly the same records — if the two drifted apart, the
// portal would stop being evidence of anything.

const peso = (value) =>
  value === null || value === undefined
    ? '—'
    : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

const TABS = [
  { key: 'awards', label: 'Awarded Contracts', icon: Award },
  { key: 'procurements', label: 'Procurements', icon: Gavel },
  { key: 'app', label: 'Annual Procurement Plan', icon: ClipboardList },
]

// `renderHeader` receives the overview once it loads, so each page can title
// itself without fetching the overview a second time.
export default function TransparencyBrowser({ renderHeader }) {
  const [overview, setOverview] = useState(null)
  const [tab, setTab] = useState('awards')
  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancelled = false
    transparencyApi
      .fetchTransparencyOverview()
      .then((result) => {
        if (!cancelled) setOverview(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetcher =
      tab === 'awards'
        ? transparencyApi.fetchPublishedAwards
        : tab === 'procurements'
          ? transparencyApi.fetchPublishedProcurements
          : transparencyApi.fetchPublishedApp

    fetcher()
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  // One hook for all three tabs: they share the `rows` array, and switching
  // tab replaces it, which resets the page automatically.
  const { pageRows, paginationProps } = usePagination(rows)

  return (
    <>
      {renderHeader?.(overview)}

      <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
        <Lock size={16} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-[13px] text-text-secondary">
          This view shows approved and published records only. Drafts, internal remarks, evaluator scores, and
          pre-award data are never exposed here.
        </p>
      </div>

      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Published APP Entries" value={overview.publishedAppEntries} icon={ClipboardList} />
          <StatCard label="Procurements" value={overview.publishedProcurements} icon={Gavel} />
          <StatCard label="Awarded Contracts" value={overview.awardedContracts} icon={Award} tone="success" />
          <StatCard label="Total Awarded" value={peso(overview.totalAwardedValue)} icon={Globe} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-2 rounded border px-4 py-2 text-[11px] font-medium tracking-[0.03em] ${
              tab === item.key
                ? 'border-navy bg-accent text-accent-fg'
                : 'border-border-muted bg-surface text-text-secondary'
            }`}
          >
            <item.icon size={13} />
            {item.label.toUpperCase()}
          </button>
        ))}
      </div>

      <Card title={TABS.find((t) => t.key === tab).label} icon={Globe} bodyClassName="">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Nothing published yet.</p>
        ) : (
          <div className="overflow-x-auto">
            {tab === 'awards' && (
              <table className="w-full text-left">
                <thead className="bg-sidebar">
                  <tr>
                    {['NOA', 'Project', 'Awarded To', 'Amount', 'ABC', 'Mode', 'Contract'].map((head) => (
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
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-border-muted">
                      <td className="px-4 py-3 font-mono text-xs text-navy">
                        {row.noaNumber}
                        <p className="mt-0.5 text-[11px] text-text-faint">{row.noaDate}</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-navy">{row.projectTitle}</td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.awardedTo}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.amount)}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                        {peso(row.abc)}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.mode}</td>
                      <td className="px-4 py-3 text-[13px]">
                        {row.contractNo ? (
                          <Badge tone={row.contractStatus === 'completed' ? 'success' : 'info'}>
                            {row.contractNo}
                          </Badge>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'procurements' && (
              <table className="w-full text-left">
                <thead className="bg-sidebar">
                  <tr>
                    {['Reference', 'Title', 'Mode', 'ABC', 'Closed', 'Bids', 'Status'].map((head) => (
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
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-border-muted">
                      <td className="px-4 py-3 font-mono text-xs text-navy">{row.referenceNo}</td>
                      <td className="px-4 py-3 text-[13px] text-navy">{row.title}</td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.mode}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.abc)}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                        {new Date(row.closingDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.bidsReceived}</td>
                      <td className="px-4 py-3">
                        <Badge tone={row.status === 'awarded' ? 'success' : 'info'}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'app' && (
              <table className="w-full text-left">
                <thead className="bg-sidebar">
                  <tr>
                    {['Project', 'Implementing Unit', 'Mode', 'ABC', 'Schedule', 'Status'].map((head) => (
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
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-border-muted">
                      <td className="px-4 py-3 text-[13px] text-navy">{row.projectTitle}</td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.implementingUnit}</td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.procurementMode}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(row.abc)}</td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                        {row.targetStartQuarter} → {row.targetCompletionQuarter}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="success">{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <Pagination {...paginationProps} label="records" />
      </Card>
    </>
  )
}
