const inputClass = 'mt-1 min-h-11 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none'
const milestones = [['procurementStartAt', 'Procurement start'], ['publicationStartAt', 'Publication start'], ['publicationEndAt', 'Publication end'], ['evaluationStartAt', 'Evaluation start'], ['evaluationEndAt', 'Evaluation end'], ['postQualificationStartAt', 'Post-qualification start'], ['postQualificationEndAt', 'Post-qualification end'], ['expectedAwardAt', 'Expected award']]

export default function ScheduleFields({ form, setForm, disabled = false }) {
  const invalidSchedule = form.closingDate && form.openingDate && new Date(form.openingDate) <= new Date(form.closingDate)
  const invalidPrebid = form.prebidRequired && form.prebidAt && new Date(form.prebidAt) >= new Date(form.closingDate)
  const field = (key, label, required = false) => <label key={key} className="block text-xs text-text-secondary">{label}<input type="datetime-local" required={required} disabled={disabled} value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={inputClass} /></label>
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">{field('closingDate', 'Bid submission deadline', true)}{field('openingDate', 'Bid opening date and time', true)}</div>
    <label className="block text-xs text-text-secondary">Pre-Bid Conference Required?
      <select disabled={disabled} value={form.prebidRequired ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, prebidRequired: event.target.value === 'yes' })} className={inputClass}><option value="no">No</option><option value="yes">Yes</option></select>
    </label>
    <p className="text-xs text-text-faint">Select Yes when the procurement requires a conference. The configured procurement rules also validate this requirement.</p>
    {form.prebidRequired && <div className="space-y-3 rounded border border-border-muted p-3">
      {field('prebidAt', 'Pre-bid conference date and time', true)}
      <label className="block text-xs text-text-secondary">Venue / Online Meeting Details<input disabled={disabled} required value={form.prebidVenue ?? ''} onChange={(event) => setForm({ ...form, prebidVenue: event.target.value })} className={inputClass} /></label>
      <label className="block text-xs text-text-secondary">Conference remarks<textarea disabled={disabled} value={form.prebidRemarks ?? ''} onChange={(event) => setForm({ ...form, prebidRemarks: event.target.value })} className={inputClass} /></label>
    </div>}
    <p className={`text-xs ${invalidSchedule || invalidPrebid ? 'text-danger' : 'text-text-faint'}`} role={invalidSchedule || invalidPrebid ? 'alert' : undefined}>{invalidPrebid ? 'The pre-bid conference must be scheduled before the bid submission deadline.' : invalidSchedule ? 'Bid opening must be scheduled after the bid submission deadline.' : 'Dates use your local time zone. The approved schedule supplies announcements, bid controls, and the procurement timeline.'}</p>
    <details><summary className="cursor-pointer text-sm font-medium text-navy">Other procurement milestones</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{milestones.map(([key, label]) => field(key, label))}</div></details>
  </div>
}
