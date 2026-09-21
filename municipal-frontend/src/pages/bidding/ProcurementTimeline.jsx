const normalStages = ['Planning', 'Secretariat Review', 'Published / Bidding', 'Technical Evaluation', 'BAC Review', 'Post-Qualification', 'Award']
const failureStages = ['Failure Documents Being Prepared', 'For BAC Failure Review', 'For BAC Failure Approval', 'Failure Approved']

export default function ProcurementTimeline({ rfq, bids = [], twgComplete = false, failure, negotiatedReview }) {
  let stages = normalStages
  let current = rfq.status === 'draft' ? 1 : 2
  if (rfq.status === 'opened') current = twgComplete ? 4 : 3
  if (rfq.status === 'evaluated') current = 5
  if (rfq.status === 'awarded' || bids.some((bid) => bid.status === 'awarded')) current = 6
  if (failure && failure.status !== 'rejected') {
    stages = [...failureStages, failure.nextAction || 'Next authorized action']
    current = ({ draft: 0, submitted: 1, reviewed: 2, approved: 3 })[failure.status] ?? 0
  }
  if (rfq.status === 'failed' && !failure) { stages = ['Historical failed attempt', 'Official failure evidence and BAC approval required']; current = 1 }
  if (negotiatedReview) {
    stages = ['Required Failed Attempts Approved', 'Negotiated Procurement Eligibility Review', 'BAC Review', 'Negotiated Procurement Approved', 'Negotiated Procurement']
    current = negotiatedReview.status === 'started' ? 4 : negotiatedReview.status === 'approved' ? 3 : negotiatedReview.committeeReview ? 2 : 1
  }
  return <div className="rounded border border-border-muted bg-surface p-4">
    <p className="mb-3 text-xs font-medium text-text-secondary">Procurement progress - Attempt #{rfq.attemptNumber ?? 1}{rfq.status === 'cancelled' ? ' - Cancelled' : ''}</p>
    <ol className="flex flex-wrap gap-2" aria-label="Procurement progress">
      {stages.map((stage, index) => <li key={stage} aria-current={index === current ? 'step' : undefined} className={`rounded border px-3 py-2 text-xs ${index < current ? 'border-success/20 bg-success/5 text-success' : index === current ? 'border-info/30 bg-info/10 text-info' : 'border-border-muted text-text-faint'}`}>
        {stage}{index < current ? ' - Complete' : index === current ? ' - Current' : ' - Pending'}
      </li>)}
    </ol>
  </div>
}
