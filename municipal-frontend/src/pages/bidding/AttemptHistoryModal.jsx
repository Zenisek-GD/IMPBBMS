import { useEffect, useState } from 'react'
import * as biddingApi from '../../api/bidding'
import * as governanceApi from '../../api/procurementGovernance'
import { fetchDocuments, downloadDocument } from '../../api/documents'
import { usePermissions } from '../../context/usePermissions'
import { useAuth } from '../../context/useAuth'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ResolutionNumberInput from '../../components/ui/ResolutionNumberInput'
import DocumentSlot from '../../components/ui/DocumentSlot'
import BacAttendance from './BacAttendance'
import ScheduleFields from './ScheduleFields'
import { localDateTime, schedulePayload } from './schedulePayload'
import ProcurementTimeline from './ProcurementTimeline'

const inputClass = 'mt-1 min-h-11 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none'
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH') : 'Not recorded'
const failureLabels = { draft: 'Draft Failure', submitted: 'Waiting for BAC Review', reviewed: 'Waiting for BAC Approval', approved: 'Approved - Failure of Bidding', rejected: 'Failure declaration rejected' }
const actionTitles = { schedule: 'Update draft schedule', prepare: 'Save draft failure documents', submitFailure: 'Submit failure documents to BAC', failureReview: 'Complete BAC failure review', failureVote: 'Record my BAC decision', failureDecision: 'Finalize BAC failure decision', rebid: 'Start Rebid', review: 'Submit negotiated procurement eligibility review', negotiatedReview: 'Complete BAC eligibility review', negotiatedVote: 'Record my eligibility decision', decision: 'Finalize BAC eligibility decision', negotiated: 'Start approved negotiated procurement' }

function EvidenceDocuments({ documents = [], onError }) {
  return <div className="mt-2 flex flex-wrap gap-3">{documents.map((doc, index) => doc.documentId
    ? <button key={index} type="button" className="max-w-full break-all text-left text-xs text-info underline" onClick={() => downloadDocument(doc.documentId, doc.name).catch((error) => onError(error.response?.data?.message ?? 'Could not download the supporting record.'))}>{doc.requirementKey ? `${doc.requirementKey}: ` : ''}{doc.name}</button>
    : /^https:\/\//i.test(doc.url ?? '') ? <a key={index} href={doc.url} target="_blank" rel="noreferrer" className="max-w-full break-all text-xs text-info underline">{doc.name}</a> : null)}</div>
}

function CommitteeRecord({ record }) {
  if (!record?.committeeReview) return null
  return <div className="mt-3 space-y-2 text-xs">
    <p>BAC review: {record.committeeReview.remarks}</p>
    <p>Resolution No. {record.committeeReview.resolution?.resolutionNo}</p>
    <ul className="space-y-1">{record.committeeReview.committee.map((member) => {
      const vote = record.votes?.find((item) => item.userId === member.id)
      const present = record.committeeReview.attendingMemberIds.includes(member.id)
      return <li key={member.id}>{member.position} - {member.name}: {present ? 'Present' : 'Absent'}; {vote ? `${vote.decision} (${dateTime(vote.votedAt)}) - ${vote.remarks}` : 'No personal decision recorded'}</li>
    })}</ul>
  </div>
}

export default function AttemptHistoryModal({ rfq, onClose, onChanged }) {
  const permissions = usePermissions()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [documents, setDocuments] = useState([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState('')
  const [form, setForm] = useState({ closingDate: localDateTime(rfq.closingDate), openingDate: localDateTime(rfq.openingDate), prebidAt: localDateTime(rfq.prebidAt), prebidRequired: rfq.prebidRequired ?? false, prebidVenue: rfq.prebidVenue ?? '', prebidRemarks: rfq.prebidRemarks ?? '', qualityWeight: rfq.qualityWeight ?? '', financialWeight: rfq.financialWeight ?? '', consultingPassingScore: rfq.consultingPassingScore ?? '', reason: '', category: 'noResponsiveBids', explanation: '', twgRecommendation: '', resolutionNo: '', resolutionDate: '', justification: '', legalBasis: '', remarks: '', decision: 'approved', attendingMemberIds: [], presidingMemberId: '' })
  const canPrepare = permissions.has('bidding.publish') || permissions.has('bidding.chairEvaluation')
  const isBac = ['bacChairperson', 'bacViceChairperson', 'bacMember'].includes(user?.role) && permissions.has('bidding.evaluate')
  const canFinalize = ['bacChairperson', 'bacViceChairperson'].includes(user?.role) && permissions.has('bidding.chairEvaluation')
  useEffect(() => {
    let active = true
    Promise.all([biddingApi.fetchAttempts(rfq.id), fetchDocuments('rfq', rfq.id)]).then(([history, files]) => { if (active) { setData(history); setDocuments(files) } })
      .catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load procurement attempt history.') })
    return () => { active = false }
  }, [rfq.id, version])
  const latest = data?.attempts?.at(-1)
  const current = data?.attempts?.find((attempt) => attempt.rfqId === rfq.id)
  const status = current?.rfqStatus ?? rfq.status
  const isLatest = !latest || latest.rfqId === rfq.id
  const failure = current?.failureRecords?.at(-1)
  const review = data?.negotiatedReview
  const applicableRequirements = (data?.policy?.negotiatedRequirements ?? []).filter((item) => !item.categories || item.categories.includes(rfq.category))
  const canVote = (record) => isBac && record?.committeeReview?.attendingMemberIds.includes(user.id) && !record.votes?.some((vote) => vote.userId === user.id)
  const decisionReady = (record) => record?.decisionReadiness?.ok || record?.votes?.filter((vote) => vote.decision === 'rejected').length >= Number(record?.committeeReview?.policy?.quorumCount ?? Infinity)
  const documentFor = (docType) => documents.findLast((doc) => doc.docType === docType)
  const startAction = (next) => {
    setAction(next); setError('')
    if (next === 'prepare') setForm((value) => ({ ...value, reason: failure?.reason ?? '', category: failure?.category ?? 'noResponsiveBids', explanation: failure?.explanation ?? '', twgRecommendation: failure?.twgRecommendation ?? '' }))
    if (['rebid', 'negotiated'].includes(next)) setForm((value) => ({ ...value, closingDate: '', openingDate: '', prebidAt: '', prebidVenue: '', prebidRequired: false }))
    if (['failureReview', 'negotiatedReview'].includes(next)) setForm((value) => ({ ...value, remarks: '', resolutionNo: '', resolutionDate: '', attendingMemberIds: [], presidingMemberId: '' }))
  }
  const field = (key, label, required = true, type = 'textarea') => <label className="block text-xs text-text-secondary">{label}{type === 'textarea' ? <textarea required={required} rows={3} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={inputClass} /> : <input type={type} required={required} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={inputClass} />}</label>
  const submit = async (event) => {
    event.preventDefault(); setError(''); setSaving(true)
    try {
      const supportingDocuments = documents.filter((doc) => doc.docType === 'procurementEvidence').map((doc) => doc.id)
      const meeting = { resolutionNo: form.resolutionNo.trim(), resolutionDate: form.resolutionDate, attendingMemberIds: form.attendingMemberIds, presidingMemberId: form.presidingMemberId, remarks: form.remarks }
      const decision = { decision: form.decision, remarks: form.remarks }
      let result
      if (action === 'schedule') result = await biddingApi.updateRfqSchedule(rfq.id, schedulePayload(form, rfq.category))
      if (action === 'prepare') result = await governanceApi.prepareFailure(rfq.id, { reason: form.reason, category: form.category, explanation: form.explanation, twgRecommendation: form.twgRecommendation, supportingDocuments })
      if (action === 'submitFailure') result = await governanceApi.submitFailure(rfq.id)
      if (action === 'failureReview') result = await governanceApi.reviewFailure(rfq.id, meeting)
      if (action === 'failureVote') result = await governanceApi.voteFailure(rfq.id, decision)
      if (action === 'failureDecision') result = await governanceApi.finalizeFailure(rfq.id, decision)
      if (action === 'rebid') result = await biddingApi.createRebid(rfq.id, schedulePayload(form, undefined))
      if (action === 'review') result = await biddingApi.submitNegotiatedReview(rfq.id, { justification: form.justification, legalBasis: form.legalBasis, supportingDocuments: applicableRequirements.flatMap((item) => { const document = documentFor(`negotiated_${item.key}`); return document ? [{ documentId: document.id, requirementKey: item.key }] : [] }) })
      if (action === 'negotiatedReview') result = await governanceApi.reviewNegotiated(rfq.id, meeting)
      if (action === 'negotiatedVote') result = await governanceApi.voteNegotiated(rfq.id, decision)
      if (action === 'decision') result = await biddingApi.decideNegotiatedReview(rfq.id, decision)
      if (action === 'negotiated') result = await biddingApi.startNegotiatedProcurement(rfq.id, schedulePayload(form, undefined))
      setMessage(result.message); setAction(''); setVersion((value) => value + 1); onChanged(result)
      if (['rebid', 'negotiated'].includes(action)) onClose()
    } catch (err) { setError(err.response?.data?.message ?? err.message ?? 'Could not complete the procurement action.') }
    finally { setSaving(false) }
  }
  return <Modal size="xl" title={`Procurement history - ${rfq.referenceNo}`} onClose={onClose}>
    <div className="space-y-4">
      <ProcurementTimeline rfq={{ ...rfq, status, attemptNumber: current?.attemptNumber ?? rfq.attemptNumber }} failure={failure} negotiatedReview={review} />
      {status === 'draft' && <p className="text-xs text-text-secondary">Use the procurement Schedule and Criteria actions to prepare and approve this draft before publication.</p>}
      {message && <p role="status" className="rounded border border-success/20 bg-success/5 p-3 text-sm text-success">{message}</p>}
      {!data && !error && <p className="text-sm text-text-faint">Loading attempt records...</p>}
      {(data?.attempts ?? []).map((attempt) => <details key={attempt.id} open={attempt.rfqId === rfq.id} className="rounded border border-border-muted p-4">
        <summary className="cursor-pointer break-words text-sm font-semibold text-navy">Attempt #{attempt.attemptNumber} - {attempt.referenceNo} <Badge tone={attempt.status === 'failed' ? 'danger' : attempt.status === 'successful' ? 'success' : 'info'}>{attempt.statusLabel ?? attempt.status}</Badge></summary>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)] [&_dd]:min-w-0 [&_dd]:break-words">
          <dt className="text-text-faint">Procurement project</dt><dd>{attempt.title}</dd>
          <dt className="text-text-faint">Procurement method</dt><dd>{attempt.method}</dd>
          <dt className="text-text-faint">Started</dt><dd>{dateTime(attempt.startedAt)}</dd>
          <dt className="text-text-faint">Submission deadline</dt><dd>{dateTime(attempt.closingDate)}</dd>
          <dt className="text-text-faint">Bid opening</dt><dd>{dateTime(attempt.openingDate)}</dd>
          <dt className="text-text-faint">Participating bidders</dt><dd>{attempt.participatingBidders?.map((bid) => `${bid.name} (${bid.status})`).join(', ') || 'No bidders recorded'}</dd>
          <dt className="text-text-faint">Evaluation result</dt><dd>{attempt.evaluationResult?.map((row) => `Bid #${row.bidId}: ${row.status}`).join('; ') || 'Pending / no completed evaluation'}</dd>
          <dt className="text-text-faint">Failure reason</dt><dd>{attempt.failureReason || 'Not recorded'}</dd>
          <dt className="text-text-faint">BAC resolution</dt><dd>{attempt.resolution ? `Resolution No. ${attempt.resolution.resolutionNo} - ${dateTime(attempt.resolution.resolvedAt)}` : 'Not recorded'}</dd>
          <dt className="text-text-faint">TWG recommendation</dt><dd>{attempt.twgRecommendations?.map((row) => `Bid #${row.bidId}: ${row.recommendation}`).join('; ') || 'Not recorded'}</dd>
          <dt className="text-text-faint">Next action</dt><dd>{attempt.nextAction || 'Continue current procurement stage'}</dd>
        </dl>
        {(attempt.failureRecords ?? []).map((record) => <section key={record.id} className="mt-3 break-words rounded border border-border-muted p-3 text-xs">
          <p className="font-semibold">Failure No. {record.failureNumber} - {failureLabels[record.status] ?? record.status}</p>
          <p className="mt-2">Category: {record.category}. Reason: {record.reason}</p><p>{record.explanation}</p>
          {record.twgRecommendation && <p>TWG recommendation: {record.twgRecommendation}</p>}
          <p>Prepared by User #{record.createdById} on {dateTime(record.createdAt)}. Submitted: {dateTime(record.submittedAt)}</p>
          {record.approvedById && <p>Final BAC decision by User #{record.approvedById} on {dateTime(record.approvedAt)}: {record.decisionRemarks}</p>}
          <EvidenceDocuments documents={record.supportingDocuments} onError={setError} />
          <CommitteeRecord record={record} />
        </section>)}
        {(attempt.supportingDocuments ?? []).map((doc, index) => doc.documentId ? <button key={index} type="button" className="mr-3 mt-3 max-w-full break-all text-left text-xs text-info underline" onClick={() => downloadDocument(doc.documentId, doc.name).catch((err) => setError(err.response?.data?.message ?? 'Could not download the supporting record.'))}>{doc.name}</button> : /^https:\/\//i.test(doc.url ?? '') ? <a key={index} href={doc.url} target="_blank" rel="noreferrer" className="mr-3 mt-3 inline-block max-w-full break-all text-xs text-info underline">{doc.name}</a> : null)}
      </details>)}
      {status === 'failed' && <div className="space-y-2 rounded border border-warning/20 bg-warning/5 p-3 text-xs">
        <p className="font-medium text-navy">Negotiated Procurement requirements</p>
        {(data?.attempts ?? []).filter((attempt) => attempt.status === 'failed').map((attempt) => <p key={attempt.id}>{attempt.failureRecords?.some((record) => record.status === 'approved') ? 'Complete' : 'Missing approval'}: Failure of Bidding Attempt #{attempt.attemptNumber}</p>)}
        {!data?.eligibility?.eligible && <ul className="list-disc space-y-1 pl-4 text-warning">{data?.eligibility?.missing?.map((item) => <li key={item}>{item}</li>)}</ul>}
        {data?.eligibility?.eligible && <>
          {(data.negotiatedReadiness?.checklist ?? []).map((item) => <p key={item.key}>{item.complete ? 'Complete' : item.required ? 'Missing' : 'Optional'}: {item.label}</p>)}
          <p>{data.negotiatedReadiness?.eligible ? 'The required documents and BAC approvals are complete.' : 'Negotiated Procurement cannot begin yet.'}</p>
          {review && <><p>Review status: {review.status}</p><p>End-user justification: {review.justification}</p><p>Legal / policy basis: {review.legalBasis}</p><EvidenceDocuments documents={review.supportingDocuments} onError={setError} /><CommitteeRecord record={review} /><p>{data.negotiatedReadiness?.decision?.message}</p></>}
        </>}
      </div>}
      {(isLatest || status === 'failed') && <div className="flex flex-wrap gap-2">
        {canPrepare && ['closed', 'opened', 'evaluated', 'failed'].includes(status) && (!failure || ['draft', 'rejected'].includes(failure.status)) && <Button variant="secondary" onClick={() => startAction('prepare')}>{failure?.status === 'draft' ? 'Edit draft failure documents' : 'Prepare Failure Documents'}</Button>}
        {canPrepare && failure?.status === 'draft' && <Button onClick={() => startAction('submitFailure')}>Submit to BAC</Button>}
        {isBac && failure?.status === 'submitted' && failure.createdById !== user.id && <Button onClick={() => startAction('failureReview')}>BAC failure review</Button>}
        {failure?.status === 'reviewed' && canVote(failure) && <Button onClick={() => startAction('failureVote')}>Record my failure decision</Button>}
        {canFinalize && failure?.status === 'reviewed' && failure.createdById !== user.id && decisionReady(failure) && <Button onClick={() => startAction('failureDecision')}>Finalize BAC failure decision</Button>}
        {isLatest && canPrepare && status === 'failed' && failure?.status === 'approved' && (!review || review.status === 'rejected') && <Button variant="secondary" onClick={() => startAction('rebid')}>Start Rebid</Button>}
        {isLatest && canPrepare && status === 'failed' && data?.eligibility?.eligible && !review && <Button variant="secondary" onClick={() => startAction('review')}>Review for Negotiated Procurement</Button>}
        {isLatest && isBac && review?.status === 'pending' && !review.committeeReview && review.reviewerId !== user.id && <Button onClick={() => startAction('negotiatedReview')}>BAC eligibility review</Button>}
        {isLatest && review?.status === 'pending' && canVote(review) && <Button onClick={() => startAction('negotiatedVote')}>Record my eligibility decision</Button>}
        {isLatest && canFinalize && review?.status === 'pending' && review.reviewerId !== user.id && (data?.negotiatedReadiness?.decision?.ok || decisionReady(review)) && <Button onClick={() => startAction('decision')}>Finalize BAC eligibility decision</Button>}
        {isLatest && canPrepare && review?.status === 'approved' && data?.negotiatedReadiness?.eligible && !review.resultingRfqId && <Button onClick={() => startAction('negotiated')}>Start negotiated procurement</Button>}
      </div>}
      {failure?.status === 'reviewed' && !failure.decisionReadiness?.ok && <p role="status" className="text-xs text-warning">{failure.decisionReadiness?.message}</p>}
      {action && <form onSubmit={submit} className="space-y-4 rounded border border-border-muted p-4">
        <h3 className="text-sm font-semibold text-navy">{actionTitles[action]}</h3>
        {['schedule', 'rebid', 'negotiated'].includes(action) && <ScheduleFields form={form} setForm={setForm} category={action === 'schedule' ? rfq.category : undefined} />}
        {action === 'prepare' && <>
          {field('reason', 'Failure reason')}
          <label className="block text-xs text-text-secondary">Failure category<select className={inputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="noBids">No bids received</option><option value="noResponsiveBids">No responsive bids received</option><option value="failedEligibility">Failed eligibility / technical requirements</option><option value="failedPostQualification">Failed post-qualification</option><option value="insufficientOffers">Insufficient offers under the approved procurement method</option><option value="other">Other</option></select></label>
          {field('explanation', 'Detailed explanation (required for every failure)')}{field('twgRecommendation', 'TWG recommendation, where applicable', false)}
          <DocumentSlot entityRef="rfq" entityId={rfq.id} docType="procurementEvidence" label="Official failure supporting record" existing={documentFor('procurementEvidence')} onChanged={() => setVersion((value) => value + 1)} />
        </>}
        {action === 'submitFailure' && <p className="text-sm text-text-secondary">Submit the saved failure documents for BAC review. Submission locks the documents and awaits the committee's official decision.</p>}
        {action === 'review' && <>{field('justification', 'Eligibility review and end-user justification')}{field('legalBasis', 'Applicable legal / policy basis')}
          {applicableRequirements.map((item) => <DocumentSlot key={item.key} entityRef="rfq" entityId={rfq.id} docType={`negotiated_${item.key}`} label={`${item.label}${item.required ? ' (required)' : ' (optional)'}`} existing={documentFor(`negotiated_${item.key}`)} onChanged={() => setVersion((value) => value + 1)} />)}
        </>}
        {['failureReview', 'negotiatedReview'].includes(action) && <>
          {field('remarks', 'BAC review findings')}<label className="block text-xs text-text-secondary">BAC resolution number<ResolutionNumberInput required value={form.resolutionNo} onChange={(event) => setForm({ ...form, resolutionNo: event.target.value })} /></label>{field('resolutionDate', 'Resolution date', true, 'date')}
          <BacAttendance value={form} onChange={setForm} /><p className="text-xs text-text-secondary">Attendance records participation in the meeting. Each official records approval, rejection or abstention using their own account after this review.</p>
        </>}
        {['failureVote', 'failureDecision', 'negotiatedVote', 'decision'].includes(action) && <>
          <label className="block text-xs text-text-secondary">{action.endsWith('Vote') ? 'My personal BAC decision' : 'Final BAC decision'}<select value={form.decision} onChange={(event) => setForm({ ...form, decision: event.target.value })} className={inputClass}><option value="approved">Approve</option><option value="rejected">Reject</option>{action.endsWith('Vote') && <option value="abstained">Abstain</option>}</select></label>{field('remarks', 'Decision remarks')}
          {action.endsWith('Vote') && <p className="text-xs text-text-secondary">This decision is recorded under your account and is locked after submission.</p>}
        </>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button className="w-full sm:w-auto" variant="secondary" onClick={() => setAction('')}>Cancel action</Button><Button className="w-full sm:w-auto" type="submit" disabled={saving}>{saving ? 'Saving...' : actionTitles[action]}</Button></div>
      </form>}
      {error && <p role="alert" className="rounded border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  </Modal>
}
