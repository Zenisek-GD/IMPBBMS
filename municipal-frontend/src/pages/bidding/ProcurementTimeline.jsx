const stages = ['Planning', 'Secretariat Review', 'Bidding', 'TWG Evaluation', 'BAC Evaluation', 'Post-Qualification', 'Award']

export default function ProcurementTimeline({ rfq, bids = [], twgComplete = false }) {
  let current = 2
  if (rfq.status === 'opened') current = twgComplete ? 4 : 3
  if (rfq.status === 'evaluated') current = 5
  if (rfq.status === 'awarded' || bids.some((bid) => bid.status === 'awarded')) current = 6
  const failed = rfq.status === 'failed' || String(rfq.status).startsWith('failed')
  const cancelled = rfq.status === 'cancelled'
  return (
    <div className="rounded border border-border-muted bg-surface p-4">
      <p className="mb-3 text-xs font-medium text-text-secondary">Procurement progress · Attempt #{rfq.attemptNumber ?? 1}</p>
      <ol className="flex flex-wrap gap-2" aria-label="Procurement progress">
        {stages.map((stage, index) => (
          <li key={stage} aria-current={index === current ? 'step' : undefined}
            className={`rounded border px-3 py-2 text-xs ${index === current && (failed || cancelled) ? 'border-danger/30 bg-danger/10 text-danger' : index < current || (index === 6 && rfq.status === 'awarded') ? 'border-success/20 bg-success/5 text-success' : index === current ? 'border-info/30 bg-info/10 text-info' : 'border-border-muted text-text-faint'}`}>
            {stage} {index < current || (index === 6 && rfq.status === 'awarded') ? '✓' : index === current ? failed ? '— Failed' : cancelled ? '— Cancelled' : '→' : '· Pending'}
          </li>
        ))}
      </ol>
    </div>
  )
}
