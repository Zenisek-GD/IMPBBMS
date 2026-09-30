import { currentFiscalYear } from '../../utils/fiscalYear'

export default function FiscalYearFilter({ value, onChange, allowAll = true }) {
  const current = currentFiscalYear()
  const years = [...new Set([current, ...Array.from({ length: 100 }, (_, index) => 2100 - index)])]
  return <label className="flex items-center gap-2 text-xs text-text-secondary">
    Fiscal year
    <select aria-label="Fiscal year" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-10 rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy">
      {allowAll && <option value="all">All fiscal years (combined)</option>}
      {years.map((year) => <option key={year} value={year}>FY {year}{year === current ? ' (current)' : ''}</option>)}
    </select>
  </label>
}
