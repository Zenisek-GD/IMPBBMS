import { useEffect, useState } from 'react'
import * as biddingApi from '../../api/bidding'
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

const inputClass = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none'
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH') : 'Not recorded'
const actionTitles = { evidence: 'Complete missing failure evidence', schedule: 'Update draft schedule', fail: 'Declare failed procurement', rebid: 'Initiate rebid / next attempt', review: 'Negotiated procurement eligibility review', decision: 'BAC eligibility decision', negotiated: 'Start approved negotiated procurement' }

export default function AttemptHistoryModal({ rfq, onClose, onChanged }) {
  const permissions = usePermissions()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [documents, setDocuments] = useState([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState(rfq.status === 'draft' ? 'schedule' : '')
  const [form, setForm] = useState({ closingDate: localDateTime(rfq.closingDate), openingDate: localDateTime(rfq.openingDate), prebidAt: localDateTime(rfq.prebidAt), qualityWeight: rfq.qualityWeight ?? '', financialWeight: rfq.financialWeight ?? '', consultingPassingScore: rfq.consultingPassingScore ?? '', reason: '', resolutionNo: '', resolutionDate: '', justification: '', legalBasis: '', remarks: '', decision: 'approved', supportingName: '', supportingUrl: '', attendingMemberIds: [], presidingMemberId: '' })
  const canPublish = permissions.has('bidding.publish')
  const canBac = permissions.has('bidding.chairEvaluation')
  useEffect(() => {
    let active = true
    Promise.all([biddingApi.fetchAttempts(rfq.id), fetchDocuments('rfq', rfq.id)]).then(([history, files]) => { if (active) { setData(history); setDocuments(files) } })
      .catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load procurement attempt history.') })
    return () => { active = false }
  }, [rfq.id, version])
  const latest = data?.attempts?.at(-1)
  const needsResolution = action !== 'evidence' || !data?.attempts?.find((attempt) => attempt.rfqId === rfq.id)?.resolution
  const isLatest = !latest || latest.rfqId === rfq.id
  const review = data?.negotiatedReview
  const field = (key, label, required = true, type = 'textarea') => <label className="block text-xs text-text-secondary">{label}{type === 'textarea' ? <textarea required={required} rows={3} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={inputClass} /> : <input type={type} required={required} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={inputClass} />}</label>
  const submit = async (event) => {
    event.preventDefault(); setError(''); setSaving(true)
    try {
      const supportingDocuments = documents.filter((doc) => doc.docType === 'procurementEvidence').map((doc) => doc.id)
      if (form.supportingUrl.trim()) supportingDocuments.push({ name: form.supportingName.trim(), url: form.supportingUrl.trim() })
      const decisionFields = { resolutionNo: form.resolutionNo.trim(), resolutionDate: form.resolutionDate, attendingMemberIds: form.attendingMemberIds, presidingMemberId: form.presidingMemberId }
      let result
      if (action === 'schedule') result = await biddingApi.updateRfqSchedule(rfq.id, schedulePayload(form, rfq.category))
      if (action === 'evidence') result = await biddingApi.recordAttemptEvidence(rfq.id, { reason: form.reason, ...decisionFields, supportingDocuments })
      if (action === 'fail') result = await biddingApi.declareFailureOfBidding(rfq.id, { reason: form.reason, ...decisionFields, supportingDocuments })
      if (action === 'rebid') result = await biddingApi.createRebid(rfq.id, schedulePayload(form))
      if (action === 'review') result = await biddingApi.submitNegotiatedReview(rfq.id, { justification: form.justification, legalBasis: form.legalBasis, supportingDocuments })
      if (action === 'decision') result = await biddingApi.decideNegotiatedReview(rfq.id, { decision: form.decision, remarks: form.remarks, ...decisionFields })
      if (action === 'negotiated') result = await biddingApi.startNegotiatedProcurement(rfq.id, schedulePayload(form))
      onChanged(result); onClose()
    } catch (err) { setError([err.response?.data?.message ?? err.message ?? 'Could not complete the procurement action.', ...(err.response?.data?.missing ?? [])].join(' ')) }
    finally { setSaving(false) }
  }
  return <Modal size="xl" title={`Procurement history — ${rfq.referenceNo}`} onClose={onClose}>
    <div className="space-y-4">
      <ProcurementTimeline rfq={rfq} />
      {!data && !error && <p className="text-sm text-text-faint">Loading attempt records…</p>}
      {(data?.attempts ?? []).map((attempt) => <details key={attempt.id} open={attempt.rfqId === rfq.id} className="rounded border border-border-muted p-4">
        <summary className="cursor-pointer text-sm font-semibold text-navy">Attempt #{attempt.attemptNumber} · {attempt.referenceNo} <Badge tone={attempt.status === 'failed' ? 'danger' : attempt.status === 'successful' ? 'success' : 'info'}>{attempt.statusLabel ?? attempt.status}</Badge></summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-text-faint">Procurement project</dt><dd>{attempt.title}</dd>
          <dt className="text-text-faint">Procurement method</dt><dd>{attempt.method}</dd>
          <dt className="text-text-faint">Started</dt><dd>{dateTime(attempt.startedAt)}</dd>
          <dt className="text-text-faint">Submission deadline</dt><dd>{dateTime(attempt.closingDate)}</dd>
          <dt className="text-text-faint">Bid opening</dt><dd>{dateTime(attempt.openingDate)}</dd>
          <dt className="text-text-faint">Participating bidders</dt><dd>{attempt.participatingBidders?.map((bid) => `${bid.name} (${bid.status})`).join(', ') || 'No bidders recorded'}</dd>
          <dt className="text-text-faint">Evaluation result</dt><dd>{attempt.evaluationResult?.map((row) => `Bid #${row.bidId}: ${row.status}`).join('; ') || 'Pending / no completed evaluation'}</dd>
          <dt className="text-text-faint">Failure reason</dt><dd>{attempt.failureReason || '—'}</dd>
          <dt className="text-text-faint">BAC resolution</dt><dd>{attempt.resolution ? `Resolution No. ${attempt.resolution.resolutionNo} · ${dateTime(attempt.resolution.resolvedAt)}` : 'Not recorded'}</dd>
          <dt className="text-text-faint">TWG recommendation</dt><dd>{attempt.twgRecommendations?.map((row) => `Bid #${row.bidId}: ${row.recommendation}`).join('; ') || 'Not recorded'}</dd>
          <dt className="text-text-faint">BAC decision</dt><dd>{typeof attempt.bacDecision === 'string' ? attempt.bacDecision : attempt.bacDecision ? JSON.stringify(attempt.bacDecision) : 'Pending'}</dd>
          <dt className="text-text-faint">Next action</dt><dd>{attempt.nextAction || 'Continue current procurement stage'}</dd>
          <dt className="text-text-faint">Responsible user</dt><dd>{attempt.responsibleUser?.name ?? 'Not recorded'} · {dateTime(attempt.completedAt ?? attempt.startedAt)}</dd>
        </dl>
        {attempt.resolution?.members?.length > 0 && <ul className="mt-3 space-y-1 text-xs">{attempt.resolution.members.map((member) => <li key={member.userId}>{member.position} — {member.name} — {member.present ? 'Present' : 'Absent'}</li>)}</ul>}
        {(attempt.supportingDocuments ?? []).map((doc, index) => (doc.id || doc.documentId) ? <button key={index} type="button" className="mr-3 mt-3 text-xs text-info underline" onClick={() => downloadDocument(doc.id || doc.documentId, doc.filename ?? doc.name).catch((err) => setError(err.response?.data?.message ?? 'Could not download the supporting record.'))}>{doc.filename ?? doc.name ?? 'Supporting record'}</button> : /^(https:\/\/|\/api\/documents\/)/i.test(doc.url ?? '') ? <a key={index} href={doc.url} target="_blank" rel="noreferrer" className="mr-3 mt-3 inline-block text-xs text-info underline">{doc.name}</a> : null)}
      </details>)}
      {rfq.status === 'failed' && <div className="space-y-2 rounded border border-warning/20 bg-warning/5 p-3 text-xs">
        <p className="font-medium text-navy">Negotiated procurement eligibility</p>
        {data?.eligibility?.eligible ? <p>Required failure records are complete. An authorized review and BAC decision are still required before starting negotiated procurement.</p> : <ul className="list-disc space-y-1 pl-4 text-warning">{data?.eligibility?.missing?.map((item) => <li key={item}>{item}</li>)}</ul>}
        {review && <><p>Review status: {review.status}</p><p>Justification: {review.justification}</p><p>Legal / policy basis: {review.legalBasis}</p>{review.decisionRemarks && <p>BAC decision remarks: {review.decisionRemarks}</p>}</>}
      </div>}
      {rfq.status === 'failed' && (canPublish || canBac) && <Button variant="secondary" onClick={() => setAction('evidence')}>Complete missing failure evidence</Button>}
      {isLatest && <div className="flex flex-wrap gap-2">
        {canPublish && rfq.status === 'draft' && <Button variant="secondary" onClick={() => setAction('schedule')}>Edit schedule / evaluation settings</Button>}
        {(canPublish || canBac) && ['closed', 'opened', 'evaluated'].includes(rfq.status) && <Button variant="danger" onClick={() => setAction('fail')}>Declare failed</Button>}
        {(canPublish || canBac) && rfq.status === 'failed' && (!review || review.status === 'rejected') && <Button variant="secondary" onClick={() => { setAction('rebid'); setForm({ ...form, closingDate: '', openingDate: '', prebidAt: '' }) }}>Initiate rebid</Button>}
        {(canPublish || canBac) && rfq.status === 'failed' && data?.eligibility?.eligible && !review && <Button variant="secondary" onClick={() => setAction('review')}>Submit eligibility review</Button>}
        {canBac && review?.status === 'pending' && review.reviewerId !== user?.id && <Button onClick={() => setAction('decision')}>BAC review / decision</Button>}
        {(canPublish || canBac) && review?.status === 'approved' && !review.resultingRfqId && <Button onClick={() => { setAction('negotiated'); setForm({ ...form, closingDate: '', openingDate: '' }) }}>Start negotiated procurement</Button>}
      </div>}
      {action && (isLatest || action === 'evidence') && <form onSubmit={submit} className="space-y-4 rounded border border-border-muted p-4">
        <h3 className="text-sm font-semibold text-navy">{actionTitles[action]}</h3>
        {['schedule', 'rebid', 'negotiated'].includes(action) && <ScheduleFields form={form} setForm={setForm} category={action === 'schedule' ? rfq.category : undefined} />}
        {['fail', 'evidence'].includes(action) && field('reason', 'Official failure reason', action === 'fail')}
        {action === 'review' && <>{field('justification', 'Eligibility review and written justification')}{field('legalBasis', 'Applicable legal / policy basis')}</>}
        {action === 'decision' && <><label className="block text-xs text-text-secondary">BAC decision<select value={form.decision} onChange={(event) => setForm({ ...form, decision: event.target.value })} className={inputClass}><option value="approved">Approve eligibility</option><option value="rejected">Reject eligibility</option></select></label>{field('remarks', 'BAC decision remarks')}</>}
        {['fail', 'decision', 'evidence'].includes(action) && <>{needsResolution ? <><label className="block text-xs text-text-secondary">Official BAC resolution<ResolutionNumberInput required value={form.resolutionNo} onChange={(event) => setForm({ ...form, resolutionNo: event.target.value })} /></label>{field('resolutionDate', 'Resolution date', true, 'date')}</> : <p className="text-xs text-text-secondary">The existing official resolution is retained with this evidence.</p>}<BacAttendance value={form} onChange={setForm} /></>}
        {['fail', 'review', 'evidence'].includes(action) && <fieldset className="space-y-3 rounded border border-border-muted p-3"><legend className="px-1 text-xs font-medium">Supporting records</legend>
          <DocumentSlot entityRef="rfq" entityId={rfq.id} docType="procurementEvidence" label="Procurement failure / eligibility supporting record" existing={documents.find((doc) => doc.docType === 'procurementEvidence')} onChanged={() => setVersion((value) => value + 1)} />
          {field('supportingName', 'Additional official record name', false, 'text')}{field('supportingUrl', 'Additional official record link (HTTPS)', false, 'url')}
        </fieldset>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAction('')}>Cancel action</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : actionTitles[action]}</Button></div>
      </form>}
      {error && <p role="alert" className="rounded border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  </Modal>
}
