const inputClass = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none'

export default function ScheduleFields({ form, setForm, category = form.category }) {
  const invalidSchedule = form.closingDate && form.openingDate && new Date(form.openingDate).getTime() <= new Date(form.closingDate).getTime()
  const quality = Number(form.qualityWeight)
  const financial = Number(form.financialWeight)
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs text-text-secondary">Bid submission deadline<input type="datetime-local" required value={form.closingDate} onChange={(event) => setForm({ ...form, closingDate: event.target.value })} className={inputClass} /></label>
      <label className="block text-xs text-text-secondary">Bid opening date and time<input type="datetime-local" required value={form.openingDate} onChange={(event) => setForm({ ...form, openingDate: event.target.value })} className={inputClass} /></label>
    </div>
    <label className="block text-xs text-text-secondary">Pre-bid conference date and time, when required<input type="datetime-local" value={form.prebidAt ?? ''} onChange={(event) => setForm({ ...form, prebidAt: event.target.value })} className={inputClass} /></label>
    <p className={`text-xs ${invalidSchedule ? 'text-danger' : 'text-text-faint'}`} role={invalidSchedule ? 'alert' : undefined}>{invalidSchedule ? 'Bid opening must be scheduled after the bid submission deadline.' : 'Same-day bid opening is allowed when the opening time is later than the submission deadline. Times use your local time zone.'}</p>
    {category === 'consulting' && <fieldset className="space-y-3 rounded border border-border-muted p-3">
      <legend className="px-1 text-xs font-semibold text-navy">Consulting Services — approved quality and financial weights</legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-text-secondary">Quality weight (%)<input type="number" required min="0" max="100" step="0.01" value={form.qualityWeight ?? ''} onChange={(event) => setForm({ ...form, qualityWeight: event.target.value })} className={inputClass} /></label>
        <label className="block text-xs text-text-secondary">Financial / price weight (%)<input type="number" required min="0" max="100" step="0.01" value={form.financialWeight ?? ''} onChange={(event) => setForm({ ...form, financialWeight: event.target.value })} className={inputClass} /></label>
      </div>
      <label className="block text-xs text-text-secondary">Minimum passing quality score<input type="number" required min="0.01" max="100" step="0.01" value={form.consultingPassingScore ?? ''} onChange={(event) => setForm({ ...form, consultingPassingScore: event.target.value })} className={inputClass} /></label>
      {(form.qualityWeight !== '' && form.financialWeight !== '') && <p className={`text-xs ${quality <= financial || Math.abs(quality + financial - 100) > 0.001 ? 'text-danger' : 'text-success'}`}>{quality <= financial ? 'Quality weighting must be higher than the financial/price weighting.' : Math.abs(quality + financial - 100) > 0.001 ? 'Quality and financial weights must total 100%.' : 'Weights total 100%; quality has the higher weighting.'}</p>}
    </fieldset>}
  </div>
}
