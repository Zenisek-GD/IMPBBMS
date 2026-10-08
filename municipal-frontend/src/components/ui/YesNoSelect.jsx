export default function YesNoSelect({ label, value, onChange }) {
  return <label className="block text-xs font-medium text-text-secondary">{label}
    <select value={value == null ? '' : value ? 'yes' : 'no'} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'yes')} className="mt-1 min-h-11 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none">
      <option value="">Select a response</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
  </label>
}
