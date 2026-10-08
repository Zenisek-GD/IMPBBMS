const inputClass = 'mt-1 min-h-11 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none'

export default function SolicitationInformationFields({ form, setForm, disabled = false }) {
  return <div className="space-y-3">
    {[['openingVenue', 'Bid opening venue / meeting details'], ['procurementContactPerson', 'Procurement contact person'], ['procurementContactEmail', 'Procurement contact email']].map(([key, label]) => <label key={key} className="block text-xs text-text-secondary">{label}<input disabled={disabled} type={key === 'procurementContactEmail' ? 'email' : 'text'} maxLength={255} value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={inputClass} /></label>)}
    <label className="block text-xs text-text-secondary">Required supplier documents / bidding document references<textarea disabled={disabled} rows={3} maxLength={8000} value={form.requiredSupplierDocuments ?? ''} onChange={(event) => setForm({ ...form, requiredSupplierDocuments: event.target.value })} className={inputClass} /></label>
    <p className="text-xs text-text-faint">Optional particulars describe this solicitation. The applicable eligibility, bid security and approval requirements still apply.</p>
  </div>
}
