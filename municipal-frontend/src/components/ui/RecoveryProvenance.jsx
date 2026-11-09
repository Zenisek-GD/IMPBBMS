export default function RecoveryProvenance({ recovery, showFields = true }) {
  if (!recovery) return null
  const imported = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(recovery.importedAt))
  return (
    <section className="space-y-5" aria-label="Recovery provenance">
      {showFields && <dl className="divide-y divide-border-muted rounded border border-border-muted">
        {recovery.sourceFields.map((field) => (
          <div key={field.label} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(180px,1fr)_2fr]">
            <dt className="text-xs font-medium text-text-secondary">{field.label}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-navy">{field.value}</dd>
          </div>
        ))}
      </dl>}
      <details className="rounded border border-border-muted p-4">
        <summary className="cursor-pointer text-sm font-medium text-navy">Source and record history</summary>
        <p className="mt-3 text-xs text-text-secondary">Source: {recovery.source.filename}</p>
        <p className="mt-2 text-xs text-text-secondary">Recovery recorded: {imported} (Philippine time)</p>
        <p className="mt-1 text-xs text-text-secondary">Original entry timestamps: not verified.</p>
        <p className="mt-2 text-sm text-navy">Restoration ends at Item Description. This draft awaits the missing supporting information before it can proceed.</p>
        <p className="mt-4 text-sm font-medium text-navy">Information requiring verification</p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-relaxed text-text-secondary">
          {recovery.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      {recovery.reconstructedProgression?.length > 0 && <details className="mt-4 rounded border border-border-muted p-4">
        <summary className="cursor-pointer text-sm font-medium text-navy">Reconstructed progression · September 25–October 9, 2026</summary>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">Dates below organize the recovered fields within the reported entry period. They are reconstructed dates, not verified historical activity. The recovery was recorded at the import time shown above.</p>
        <ol className="mt-4 space-y-3">
          {recovery.reconstructedProgression.map((event) => <li key={event.activityDate} className="grid gap-1 sm:grid-cols-[110px_1fr]"><span className="text-xs font-medium text-navy">{event.activityDate}</span><span className="text-xs leading-relaxed text-text-secondary">{event.sourceFields.map((field) => field.label).join(', ')} · Reconstructed</span></li>)}
        </ol>
      </details>}
      </details>
    </section>
  )
}
