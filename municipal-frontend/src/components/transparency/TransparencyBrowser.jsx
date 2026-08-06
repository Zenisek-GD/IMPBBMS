import { useEffect, useState } from 'react'
import { Globe, ClipboardList, Gavel, Award, Lock } from 'lucide-react'
import * as transparencyApi from '../../api/transparency'
import Card from '../ui/Card'
import StatCard from '../ui/StatCard'
import Badge from '../ui/Badge'
import Pagination from '../ui/Pagination'
import TableToolbar from '../ui/TableToolbar'
import SortableTh from '../ui/SortableTh'
import { useTableControls } from '../ui/useTableControls'

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

// Search, filters and sort accessors per tab. The three tabs are three
// different record shapes sharing one screen, so the controls have to change
// with the tab rather than being declared once.
const TABLE_CONFIG = {
  awards: {
    placeholder: 'Search NOA, project or supplier…',
    searchKeys: ['noaNumber', 'projectTitle', 'awardedTo', 'contractNo'],
    filters: [
      { key: 'mode', label: 'All modes' },
      { key: 'awardedTo', label: 'All suppliers' },
    ],
    accessors: {
      amount: (row) => Number(row.amount ?? 0),
      abc: (row) => Number(row.abc ?? 0),
    },
  },
  procurements: {
    placeholder: 'Search reference or title…',
    searchKeys: ['referenceNo', 'title', 'mode'],
    filters: [
      { key: 'mode', label: 'All modes' },
      { key: 'status', label: 'All statuses' },
    ],
    accessors: {
      abc: (row) => Number(row.abc ?? 0),
      bidsReceived: (row) => Number(row.bidsReceived ?? 0),
    },
  },
  app: {
    placeholder: 'Search project or implementing unit…',
    searchKeys: ['projectTitle', 'implementingUnit', 'procurementMode'],
    filters: [
      { key: 'procurementMode', label: 'All modes' },
      { key: 'implementingUnit', label: 'All offices' },
    ],
    accessors: { abc: (row) => Number(row.abc ?? 0) },
  },
}

// Mounted with `key={tab}` by the browser below, so switching tab gives a fresh
// set of controls. Without that, a filter chosen on one tab would carry over to
// the next and silently hide every row, because the three tabs do not share
// field names.
function PublishedTable({ tab, rows }) {
  const config = TABLE_CONFIG[tab]
  const table = useTableControls(rows, {
    searchKeys: config.searchKeys,
    filters: config.filters,
    accessors: config.accessors,
  })

  return (
    <>
      {rows.length > 0 && (
        <div className="border-b border-border-muted p-4">
          <TableToolbar {...table.toolbarProps} searchPlaceholder={config.placeholder} />
        </div>
      )}

      {table.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-text-faint">
          {table.totalBeforeFilters === 0
            ? 'Nothing published yet.'
            : 'No records match your search or filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          {tab === 'awards' && (
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('noaNumber')}>NOA</SortableTh>
                  <SortableTh {...table.sortProps('projectTitle')}>Project</SortableTh>
                  <SortableTh {...table.sortProps('awardedTo')}>Awarded To</SortableTh>
                  <SortableTh {...table.sortProps('amount')}>Amount</SortableTh>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <SortableTh {...table.sortProps('mode')}>Mode</SortableTh>
                  <SortableTh {...table.sortProps('contractNo')}>Contract</SortableTh>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((row) => (
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
                  <SortableTh {...table.sortProps('referenceNo')}>Reference</SortableTh>
                  <SortableTh {...table.sortProps('title')}>Title</SortableTh>
                  <SortableTh {...table.sortProps('mode')}>Mode</SortableTh>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <SortableTh {...table.sortProps('closingDate')}>Closed</SortableTh>
                  <SortableTh {...table.sortProps('bidsReceived')}>Bids</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((row) => (
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
                  <SortableTh {...table.sortProps('projectTitle')}>Project</SortableTh>
                  <SortableTh {...table.sortProps('implementingUnit')}>Implementing Unit</SortableTh>
                  <SortableTh {...table.sortProps('procurementMode')}>Mode</SortableTh>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <SortableTh {...table.sortProps('targetStartQuarter')}>Schedule</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((row) => (
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

      <Pagination {...table.paginationProps} label="records" />
    </>
  )
}

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
        <PublishedTable key={tab} tab={tab} rows={rows} />
      </Card>
    </>
  )
}
