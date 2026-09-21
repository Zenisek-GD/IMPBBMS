import { useEffect, useState } from 'react'
import * as api from '../../api/procurementSchedule'
import { updateRfqSchedule } from '../../api/bidding'
import { fetchDocuments, uploadDocument, downloadDocument, ACCEPTED_EXTENSIONS } from '../../api/documents'
import { usePermissions } from '../../context/usePermissions'
import { useAuth } from '../../context/useAuth'
import LargeFormPage from '../../components/ui/LargeFormPage'
import Button from '../../components/ui/Button'
import ScheduleFields from './ScheduleFields'
import ApprovedEvaluationCriteria from './ApprovedEvaluationCriteria'
import { localDateTime, schedulePayload } from './schedulePayload'

const dateKeys = ['closingDate', 'openingDate', 'prebidAt', 'procurementStartAt', 'publicationStartAt', 'publicationEndAt', 'evaluationStartAt', 'evaluationEndAt', 'postQualificationStartAt', 'postQualificationEndAt', 'expectedAwardAt']
const labels = { closingDate: 'Submission deadline', openingDate: 'Bid opening', prebidAt: 'Pre-bid conference', prebidRequired: 'Pre-bid required', prebidVenue: 'Pre-bid venue / meeting details', prebidRemarks: 'Pre-bid remarks', procurementStartAt: 'Procurement start', publicationStartAt: 'Publication start', publicationEndAt: 'Publication end', evaluationStartAt: 'Evaluation start', evaluationEndAt: 'Evaluation end', postQualificationStartAt: 'Post-qualification start', postQualificationEndAt: 'Post-qualification end', expectedAwardAt: 'Expected award' }
const formatted = (key, value) => dateKeys.includes(key) ? value ? new Date(value).toLocaleString('en-PH') : 'Not scheduled' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : value || 'Not recorded'
const input = 'mt-1 w-full rounded border border-border-muted px-3 py-2 text-sm'

export default function ScheduleWorkspace({ rfq, onClose, onChanged }) {
  const permissions = usePermissions()
  const { user } = useAuth()
  const canPrepare = permissions.has('bidding.publish')
  const canApprove = permissions.has('bidding.chairEvaluation') && ['bacChairperson', 'bacViceChairperson'].includes(user?.role ?? user?.Role?.key)
  const [data, setData] = useState(null)
  const [form, setForm] = useState({})
  const [documents, setDocuments] = useState([])
  const [documentId, setDocumentId] = useState('')
  const [reason, setReason] = useState('')
  const [remarks, setRemarks] = useState({})
  const [amending, setAmending] = useState(false)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([api.fetchSchedule(rfq.id), fetchDocuments('rfq', rfq.id)]).then(([schedule, files]) => {
      if (!active) return
      setData(schedule); setDocuments(files)
      setForm({ ...schedule, ...Object.fromEntries(dateKeys.map((key) => [key, localDateTime(schedule[key])])) })
    }).catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load the official schedule.') })
    return () => { active = false }
  }, [rfq.id, version])
  const run = async (fn, { refresh = true } = {}) => {
    setBusy(true); setError(''); setMessage('')
    try { const result = await fn(); setMessage(result.message ?? 'Schedule updated.'); if (refresh) { setVersion((v) => v + 1); onChanged(result) } return true }
    catch (err) { setError(err.response?.data?.message ?? err.message ?? 'The schedule action could not be completed.'); return false }
    finally { setBusy(false) }
  }
  const editable = canPrepare && data && (!data.locked || amending)
  return <LargeFormPage title={`Schedule / Criteria — ${rfq.referenceNo}`} purpose="Approve the official dates before publication. Published dates change through a documented amendment and independent BAC approval." onBack={onClose} backLabel="Back to procurements" error={error} actions={<Button variant="secondary" onClick={onClose}>Close</Button>}>
    {message && <p role="status" className="rounded border border-success/30 p-3 text-sm text-success">{message}</p>}
    {!data ? <p>Loading official schedule…</p> : <>
      <LargeFormPage.Section title={amending ? 'Proposed revised schedule' : 'Official procurement schedule'} description={`${data.approvedAt ? `Approved ${new Date(data.approvedAt).toLocaleString('en-PH')}.` : 'Schedule approval pending.'} ${data.locked ? 'Published dates are protected by the amendment process.' : 'Editing the draft requires a fresh schedule approval.'}`}>
        <ScheduleFields form={form} setForm={setForm} disabled={!editable || busy} />
        {canPrepare && !data.locked && <Button className="mt-4" disabled={busy} onClick={() => run(() => updateRfqSchedule(rfq.id, schedulePayload(form)))}>Save draft schedule</Button>}
        {canApprove && !data.locked && !data.approvedAt && Number(data.preparedById) !== user?.id && <Button className="mt-4 ml-2" disabled={busy} onClick={() => run(() => api.approveSchedule(rfq.id))}>Approve official schedule</Button>}
        {canPrepare && data.locked && !['failed', 'awarded', 'cancelled'].includes(data.status) && !amending && <Button className="mt-4" disabled={busy} onClick={() => setAmending(true)}>Request Schedule Amendment</Button>}
      </LargeFormPage.Section>
      {amending && <LargeFormPage.Section title="Schedule amendment request" description="State the reason and attach the official supporting document. Review the proposed dates above before creating the request.">
        <label className="block text-xs">Reason for amendment<textarea required value={reason} onChange={(event) => setReason(event.target.value)} className={input} /></label>
        <label className="mt-3 block text-xs">Supporting document<select required value={documentId} onChange={(event) => setDocumentId(event.target.value)} className={input}><option value="">Select a procurement document</option>{documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.label || doc.filename}</option>)}</select></label>
        <label className="mt-3 block text-xs">Upload supporting document<input disabled={busy} type="file" accept={ACCEPTED_EXTENSIONS} className={input} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) run(async () => { const doc = await uploadDocument({ file, entityRef: 'rfq', entityId: rfq.id, docType: 'scheduleAmendment', label: file.name }); setDocumentId(String(doc.id)); setDocuments((files) => [...files, doc]); return { message: 'Supporting document attached. Complete the amendment request.' } }, { refresh: false }) }} /></label>
        <div className="mt-4 flex gap-2"><Button disabled={busy || !reason.trim() || !documentId} onClick={async () => { const ok = await run(() => api.requestAmendment(rfq.id, { schedule: schedulePayload(form), reason, supportingDocumentId: Number(documentId) })); if (ok) { setAmending(false); setReason('') } }}>Create amendment draft</Button><Button variant="secondary" disabled={busy} onClick={() => { setAmending(false); setVersion((v) => v + 1) }}>Cancel request</Button></div>
      </LargeFormPage.Section>}
      <LargeFormPage.Section title="Schedule amendment history" description="Previous dates, revised dates, reasons, evidence, and the responsible officials remain in the procurement record.">
        {data.amendments.length === 0 ? <p className="text-sm text-text-faint">No schedule amendments recorded.</p> : data.amendments.map((amendment) => <article key={amendment.id} className="mb-4 space-y-3 rounded border border-border-muted p-4">
          <p className="font-semibold text-navy">{amendment.referenceNo} · {amendment.status === 'applied' ? 'Approved and applied' : amendment.status}</p>
          <p className="text-sm">{amendment.reason}</p>
          <p className="text-xs text-text-secondary">Requested by {amendment.requestedBy?.name} on {new Date(amendment.requestedAt).toLocaleString('en-PH')}{amendment.approvedBy && ` · Reviewed by ${amendment.approvedBy.name} on ${new Date(amendment.reviewedAt).toLocaleString('en-PH')}`}</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Date / field</th><th className="p-2">Previous</th><th className="p-2">Proposed / revised</th></tr></thead><tbody>{amendment.changedFields.map((key) => <tr key={key} className="border-t border-border-muted"><td className="p-2">{labels[key] ?? key}</td><td className="p-2">{formatted(key, amendment.previousSchedule[key])}</td><td className="p-2">{formatted(key, amendment.proposedSchedule[key])}</td></tr>)}</tbody></table></div>
          {amendment.supportingDocument && <Button variant="secondary" size="sm" onClick={() => downloadDocument(amendment.supportingDocument.id, amendment.supportingDocument.filename).catch(() => setError('Could not download the supporting document.'))}>View supporting document</Button>}
          {amendment.decisionRemarks && <p className="text-sm">Review remarks: {amendment.decisionRemarks}</p>}
          {canPrepare && amendment.status === 'draft' && <Button disabled={busy} onClick={() => run(() => api.submitAmendment(rfq.id, amendment.id))}>Submit to BAC for review</Button>}
          {canApprove && amendment.status === 'submitted' && amendment.requestedById !== user?.id && <div className="space-y-3"><label className="block text-xs">Review remarks (required for rejection)<textarea value={remarks[amendment.id] ?? ''} onChange={(event) => setRemarks({ ...remarks, [amendment.id]: event.target.value })} className={input} /></label><div className="flex gap-2"><Button disabled={busy} onClick={() => run(() => api.decideAmendment(rfq.id, amendment.id, 'approve', remarks[amendment.id]))}>Approve and apply amendment</Button><Button variant="secondary" disabled={busy || !remarks[amendment.id]?.trim()} onClick={() => run(() => api.decideAmendment(rfq.id, amendment.id, 'reject', remarks[amendment.id]))}>Reject amendment</Button></div></div>}
        </article>)}
      </LargeFormPage.Section>
      <LargeFormPage.Section title="Evaluation method and approved criteria"><ApprovedEvaluationCriteria rfq={rfq} onChanged={onChanged} /></LargeFormPage.Section>
    </>}
  </LargeFormPage>
}
