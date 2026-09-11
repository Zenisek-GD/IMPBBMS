import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Download, Printer, RefreshCw, ArrowDown, ArrowUp, FileText } from 'lucide-react'
import { fetchReportCatalog, fetchReport, exportReportCsv } from '../../api/reports'
import { useAuth } from '../../context/useAuth'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Pagination from '../../components/ui/Pagination'

const fieldClass = 'w-full rounded-md border border-border-muted bg-surface px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none'
const FILTER_LABELS = { year: 'Year', category: 'Procurement category', method: 'Procurement method', status: 'Status', department: 'Office / department', bidder: 'Bidder', action: 'BAC action', attempt: 'Procurement attempt', outcome: 'Outcome' }
const label = (value) => String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase())
const display = (value, column) => {
  if (value == null || value === '') return '—'
  if (column.type === 'number') return Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })
  if (['date', 'deadline', 'opening', 'declaredAt', 'completion'].includes(column.key)) return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
  return String(value)
}
const errorMessage = async (error) => {
  if (error.response?.data instanceof Blob) {
    try { return JSON.parse(await error.response.data.text()).message } catch { /* use fallback */ }
  }
  return error.response?.data?.message || 'The report could not be loaded. Please try again.'
}

function buildPrintDocument(printWindow, report, user, filters) {
  const doc = printWindow.document
  doc.title = report.title
  doc.body.replaceChildren()
  const style = doc.createElement('style')
  style.textContent = '@page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#172b4d;font-size:10px}h1{font-size:19px}p{line-height:1.5}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bcc6d1;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#eef2f6}thead{display:table-header-group}tr{break-inside:avoid}button{margin:12px 0;padding:9px 16px}@media print{button{display:none}}'
  doc.head.append(style)
  const addText = (tag, text, parent = doc.body) => { const node = doc.createElement(tag); node.textContent = text; parent.append(node); return node }
  addText('p', 'Municipal Procurement and Bidding Management System')
  addText('h1', report.title)
  addText('p', `Generated ${new Date(report.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Asia/Manila) · Prepared by ${user?.name || 'Authorized user'} · ${report.total} records`)
  const active = Object.entries(filters).filter(([key, value]) => value && !['sort', 'direction', 'page', 'pageSize'].includes(key))
  addText('p', active.length ? `Filters: ${active.map(([key, value]) => `${FILTER_LABELS[key] || label(key)}: ${value}`).join(' · ')}` : 'Filters: All authorized records')
  const print = addText('button', 'Print / Save as PDF')
  print.onclick = () => printWindow.print()
  const table = doc.createElement('table')
  const head = doc.createElement('thead')
  const header = doc.createElement('tr')
  report.columns.forEach((column) => addText('th', column.label, header))
  head.append(header)
  table.append(head)
  const body = doc.createElement('tbody')
  report.rows.forEach((row) => {
    const tr = doc.createElement('tr')
    report.columns.forEach((column) => addText('td', display(row[column.key], column), tr))
    body.append(tr)
  })
  table.append(body)
  doc.body.append(table)
  printWindow.focus()
  printWindow.print()
}

export default function Reports() {
  const { user } = useAuth()
  const { reportType } = useParams()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState(null)
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState({})
  const [query, setQuery] = useState({ page: 1, pageSize: 25, direction: 'desc' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const selected = catalog?.find((report) => report.key === reportType) || (!reportType ? catalog?.[0] : null)

  useEffect(() => {
    const controller = new AbortController()
    fetchReportCatalog(controller.signal).then(setCatalog).catch(async (issue) => { if (!controller.signal.aborted) { setError(await errorMessage(issue)); setLoading(false) } })
    return () => controller.abort()
  }, [user?.id])

  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    fetchReport(selected.key, query, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setData(result); setLoading(false) } })
      .catch(async (issue) => { if (!controller.signal.aborted) { setError(await errorMessage(issue)); setLoading(false) } })
    return () => controller.abort()
  }, [selected, query, refresh])

  const updateQuery = (next) => { setLoading(true); setError(''); setQuery(next) }
  const changeReport = (key) => { setDraft({}); setData(null); updateQuery({ page: 1, pageSize: 25, direction: 'desc' }); navigate(`/reports/${key}`) }
  const sortBy = (key) => updateQuery({ ...query, page: 1, sort: key, direction: query.sort === key && query.direction === 'asc' ? 'desc' : 'asc' })
  const doExport = async (format) => {
    if (!selected) return
    setError(''); setExporting(true)
    const printWindow = format === 'print' ? window.open('', '_blank') : null
    try {
      if (format === 'print') {
        if (!printWindow) throw new Error('Allow popups to open the print-friendly report.')
        printWindow.document.body.textContent = 'Preparing all filtered records for printing…'
        const report = await fetchReport(selected.key, { ...query, format: 'print' })
        buildPrintDocument(printWindow, report, user, query)
      } else {
        const blob = await exportReportCsv(selected.key, query)
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url; link.download = `${selected.key}-${new Date().toISOString().slice(0, 10)}.csv`
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (issue) {
      printWindow?.close()
      setError(issue.response ? await errorMessage(issue) : issue.message)
    } finally { setExporting(false) }
  }

  return (
    <DashboardPage>
      <PageHeader title="Reports" subtitle="Detailed procurement records and official report generation. Each report follows your account’s access permissions." actions={
        <>
          <Button variant="secondary" icon={RefreshCw} disabled={!selected || loading} onClick={() => { setLoading(true); setError(''); setRefresh((value) => value + 1) }}>Refresh</Button>
          <Button variant="secondary" icon={Printer} disabled={!selected?.canExport || exporting || loading} onClick={() => doExport('print')}>Print / PDF</Button>
          <Button icon={Download} disabled={!selected?.canExport || exporting || loading} onClick={() => doExport('csv')}>{exporting ? 'Preparing report…' : 'Export CSV'}</Button>
        </>
      } />
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
      {catalog?.length === 0 && <p className="rounded-lg border border-border-muted bg-surface p-5 text-sm text-text-secondary">There are no reports available for your current permissions.</p>}
      {catalog?.length > 0 && <>
        <form onSubmit={(event) => { event.preventDefault(); updateQuery({ ...draft, page: 1, pageSize: query.pageSize, sort: query.sort, direction: query.direction }) }} className="rounded-lg border border-border-muted bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-xs text-text-secondary sm:col-span-2">Report
              <select value={selected?.key || ''} onChange={(event) => changeReport(event.target.value)} className={fieldClass}>
                {!selected && <option value="">Select an authorized report</option>}
                {catalog.map((report) => <option key={report.key} value={report.key}>{report.title}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-text-secondary">From date<input type="date" value={draft.from || ''} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={fieldClass} /></label>
            <label className="flex flex-col gap-1.5 text-xs text-text-secondary">To date<input type="date" min={draft.from || undefined} value={draft.to || ''} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={fieldClass} /></label>
            <label className="flex flex-col gap-1.5 text-xs text-text-secondary sm:col-span-2">Search records<input type="search" placeholder="Search visible report details…" value={draft.search || ''} onChange={(event) => setDraft({ ...draft, search: event.target.value })} className={fieldClass} /></label>
            {Object.entries(data?.key === selected?.key ? data.filters : {}).map(([key, options]) => <label key={key} className="flex flex-col gap-1.5 text-xs text-text-secondary">{FILTER_LABELS[key]}
              <select value={draft[key] || ''} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className={fieldClass}>
                <option value="">All</option>{options.map((value) => <option key={value} value={value}>{label(value)}</option>)}
              </select>
            </label>)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!selected}>Apply filters</Button>
            <Button variant="ghost" onClick={() => { setDraft({}); updateQuery({ page: 1, pageSize: 25, direction: 'desc' }) }}>Reset</Button>
            <p className="text-xs text-text-faint">Dates use Philippine time (UTC+8). Exports include every filtered row, up to 10,000 records.</p>
          </div>
        </form>
        {!selected && <p role="alert" className="text-sm text-danger">This report is unavailable for your current permissions. Select an available report.</p>}
        {selected && <section className="overflow-hidden rounded-lg border border-border-muted bg-surface" aria-busy={loading}>
          <div className="flex items-center gap-2 border-b border-border-muted px-4 py-3"><FileText size={17} className="text-navy" /><h2 className="font-semibold text-navy">{selected.title}</h2></div>
          {loading ? <p role="status" className="p-5 text-sm text-text-secondary">Loading report…</p> : data?.key === selected.key && <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-canvas text-text-secondary"><tr>{data.columns.map((column) => <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3" aria-sort={query.sort === column.key ? (query.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="flex items-center gap-1" onClick={() => sortBy(column.key)}>{column.label}{query.sort === column.key && (query.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}</tr></thead>
                <tbody>{data.rows.map((row) => <tr key={row.id} className="border-t border-border-muted hover:bg-canvas/70">{data.columns.map((column) => <td key={column.key} className="min-w-28 max-w-96 px-4 py-3 align-top text-text-secondary">{display(row[column.key], column)}</td>)}</tr>)}</tbody>
              </table>
              {!data.rows.length && <p className="p-6 text-center text-sm text-text-faint">No authorized records match these filters.</p>}
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} totalItems={data.total} label="records" onPageChange={(page) => updateQuery({ ...query, page })} onPageSizeChange={(pageSize) => updateQuery({ ...query, page: 1, pageSize })} />
            <p className="border-t border-border-muted px-4 py-2 text-[11px] text-text-faint">Generated {new Date(data.generatedAt).toLocaleString('en-PH')} · CSV opens in Excel. Use Print / PDF to save a PDF from your browser.</p>
          </>}
        </section>}
      </>}
    </DashboardPage>
  )
}
