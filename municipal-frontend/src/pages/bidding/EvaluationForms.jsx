import { useEffect, useState } from 'react'
import { EVALUATION_RUBRIC, saveTwgAssessment } from '../../api/bidding'
import { fetchDocuments } from '../../api/documents'
import Modal from '../../components/ui/Modal'
import LargeFormPage from '../../components/ui/LargeFormPage'
import Button from '../../components/ui/Button'
import DocumentSlot from '../../components/ui/DocumentSlot'
import BacAttendance from './BacAttendance'

const inputClass = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none'
const complianceOptions = [['compliant', 'Compliant'], ['nonCompliant', 'Non-Compliant'], ['needsClarification', 'Needs Clarification']]

export function BidEvaluationModal({ bid, consulting, weights, onClose, onSubmit }) {
  const [noConflict, setNoConflict] = useState(false)
  const [scores, setScores] = useState(Object.fromEntries(EVALUATION_RUBRIC.map((criterion) => [criterion.key, ''])))
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const values = Object.values(scores)
  const completed = values.every((value) => value !== '')
  const quality = completed && consulting ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null
  const verdict = values.every((value) => value === 'compliant') ? 'passed' : 'failed'
  // Item 12: bid evaluation is a long workflow form — a full page with
  // sections, not a scroll-heavy modal.
  return (
    <LargeFormPage
      title={`${consulting ? 'Quality evaluation' : 'Compliance evaluation'} — ${bid.vendorName ?? bid.blindLabel}`}
      purpose={consulting ? `Quality weight: ${weights.qualityWeight}%; financial weight: ${weights.financialWeight}%. Financial and combined scores are calculated after technical evaluation closes.` : 'All mandatory technical requirements must be compliant before a bidder advances to financial ranking. Needs Clarification prevents advancement until resolved.'}
      onBack={onClose}
      backLabel="Back to evaluation"
      error={error}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="bid-evaluation-form" disabled={saving || !completed || !noConflict}>{saving ? 'Submitting…' : 'Submit final evaluation'}</Button>
        </>
      }
    >
      <form id="bid-evaluation-form" onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true); setError('')
        try {
          const breakdown = consulting ? Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Number(value)])) : scores
          await onSubmit(breakdown, remarks, consulting ? undefined : verdict)
          onClose()
        } catch (err) { setError(err.response?.data?.message ?? 'Could not submit the evaluation.') }
        finally { setSaving(false) }
      }}>
        <div className="flex flex-col gap-4">
          <LargeFormPage.Section
            title="Criteria"
            description="Review the Technical Working Group (TWG) assessment before submitting."
          >
            <div className="flex flex-col gap-3">
              {EVALUATION_RUBRIC.map((criterion) => <label key={criterion.key} className="block text-xs text-text-secondary">{criterion.label}
                {consulting ? <input type="number" min="0" max="100" step="0.01" required value={scores[criterion.key]} onChange={(event) => setScores({ ...scores, [criterion.key]: event.target.value })} className={inputClass} />
                  : <select required value={scores[criterion.key]} onChange={(event) => setScores({ ...scores, [criterion.key]: event.target.value })} className={inputClass}>
                    <option value="">Select compliance finding</option>{complianceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>}
              </label>)}
            </div>
          </LargeFormPage.Section>
          <LargeFormPage.Section title="Findings">
            <div className="flex flex-col gap-3">
              <label className="block text-xs text-text-secondary">Evaluation findings / remarks
                <textarea required={!consulting && verdict === 'failed'} rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} className={inputClass} />
              </label>
              {quality !== null && <p className="text-sm text-navy">Quality score: {quality.toFixed(2)} / 100 · Weighted quality contribution: {(quality * Number(weights.qualityWeight) / 100).toFixed(2)}</p>}
              {!consulting && completed && <p className="text-sm text-navy">Technical result: {verdict === 'passed' ? 'Compliant; eligible for financial evaluation' : 'Not compliant; cannot advance to financial ranking'}</p>}
            </div>
          </LargeFormPage.Section>
          <LargeFormPage.Section title="Declaration">
            <label className="flex min-h-[44px] items-start gap-2 text-sm text-text-secondary"><input type="checkbox" required checked={noConflict} onChange={(event) => setNoConflict(event.target.checked)} />I declare that I have no conflict of interest with any bidder participating in this procurement.</label>
          </LargeFormPage.Section>
        </div>
      </form>
    </LargeFormPage>
  )
}

export function TwgAssessmentModal({ bid, assessment, onClose, onSaved }) {
  const empty = { requirement: '', complianceStatus: '', findings: '', remarks: '', supportingInformation: '', documents: [] }
  const [record, setRecord] = useState(assessment)
  const [requirements, setRequirements] = useState(assessment?.requirements?.length ? assessment.requirements : [{ ...empty }])
  const [recommendation, setRecommendation] = useState(assessment?.recommendation ?? '')
  const [remarks, setRemarks] = useState(assessment?.remarks ?? '')
  const [documents, setDocuments] = useState([])
  const [fileVersion, setFileVersion] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!record?.id) return
    let active = true
    fetchDocuments('twgAssessment', record.id).then((data) => { if (active) setDocuments(data) })
      .catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load supporting documents.') })
    return () => { active = false }
  }, [record?.id, fileVersion])
  const setRequirement = (index, key, value) => setRequirements((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item))
  const save = async (status) => {
    setError(''); setMessage(''); setSaving(true)
    try {
      if (status === 'submitted' && (!recommendation || !remarks.trim() || requirements.some((item) => !item.requirement.trim() || !item.complianceStatus || !item.findings.trim()))) throw new Error('Complete each technical requirement, compliance finding, recommendation and written justification before submitting.')
      const result = await saveTwgAssessment(bid.id, { requirements: requirements.map((item, index) => ({ ...item, documents: documents.filter((doc) => doc.docType === `requirement_${index}`).map((doc) => doc.id) })), recommendation, remarks, status })
      setRecord(result.assessment ?? result)
      onSaved(status)
      if (status === 'submitted') onClose()
      else setMessage('TWG assessment saved as draft. Attach supporting files and complete the recommendation before submitting to the BAC.')
    } catch (err) { setError(err.response?.data?.message ?? err.message ?? 'Could not save the TWG assessment.') }
    finally { setSaving(false) }
  }
  return (
    // Item 12: a TWG assessment with dynamic requirements and supporting
    // documents is a long workflow form — a full page, not a modal.
    <LargeFormPage
      title={`TWG technical assessment — ${bid.vendorName ?? bid.blindLabel}`}
      purpose="Your conflict-of-interest declaration is recorded with this assessment. Save a draft to attach supporting documents. Submitted assessments are retained for BAC review."
      onBack={onClose}
      backLabel="Back to evaluation"
      error={error}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" disabled={saving} onClick={() => save('draft')}>Save draft</Button>
          <Button disabled={saving} onClick={() => save('submitted')}>{saving ? 'Saving…' : 'Submit to BAC'}</Button>
        </>
      }
    >
      {message && <p role="status" className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{message}</p>}
      <LargeFormPage.Section title="Technical requirements">
        <div className="flex flex-col gap-3">
          {requirements.map((item, index) => <fieldset key={index} className="space-y-2 rounded border border-border-muted p-3">
            <legend className="px-1 text-xs font-medium text-navy">Requirement {index + 1}</legend>
            <label className="block text-xs text-text-secondary">Requirement<input value={item.requirement} onChange={(event) => setRequirement(index, 'requirement', event.target.value)} className={inputClass} /></label>
            <label className="block text-xs text-text-secondary">Compliance status<select value={item.complianceStatus} onChange={(event) => setRequirement(index, 'complianceStatus', event.target.value)} className={inputClass}><option value="">Select status</option>{complianceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {[['findings', 'Technical findings'], ['remarks', 'Remarks'], ['supportingInformation', 'Supporting information / document reference']].map(([key, label]) => <label key={key} className="block text-xs text-text-secondary">{label}<textarea rows={2} value={item[key] ?? ''} onChange={(event) => setRequirement(index, key, event.target.value)} className={inputClass} /></label>)}
            {record?.id && <DocumentSlot entityRef="twgAssessment" entityId={record.id} docType={`requirement_${index}`} label={item.requirement || `Requirement ${index + 1}`} existing={documents.find((doc) => doc.docType === `requirement_${index}`)} onChanged={() => setFileVersion((value) => value + 1)} />}
          </fieldset>)}
          <div>
            <Button variant="secondary" onClick={() => setRequirements([...requirements, { ...empty }])}>Add requirement</Button>
          </div>
        </div>
      </LargeFormPage.Section>
      <LargeFormPage.Section
        title="Recommendation"
        description="What the Technical Working Group (TWG) recommends to the BAC, with written justification."
      >
        <div className="flex flex-col gap-3">
          <label className="block text-xs text-text-secondary">Technical Working Group (TWG) recommendation<select value={recommendation} onChange={(event) => setRecommendation(event.target.value)} className={inputClass}>
            <option value="">Select recommendation</option>
            <option value="furtherEvaluation">Recommend for further evaluation</option><option value="postQualification">Recommend for final supplier verification (post-qualification)</option><option value="compliant">Recommend as compliant</option><option value="nonCompliant">Recommend as non-compliant</option><option value="disqualification">Recommend disqualification</option>
          </select></label>
          <label className="block text-xs text-text-secondary">Written justification / recommendation remarks<textarea rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} className={inputClass} /></label>
        </div>
      </LargeFormPage.Section>
    </LargeFormPage>
  )
}

export function CommitteeActionModal({ title, description, onClose, onSubmit, resolution = false }) {
  const [attendance, setAttendance] = useState({ attendingMemberIds: [], presidingMemberId: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return <Modal title={title} onClose={onClose}><div className="space-y-4">
    <p className="text-sm text-text-secondary">{description}</p>
    <BacAttendance value={attendance} onChange={setAttendance} />
    {resolution && <p className="text-xs text-text-secondary">The participating members and their BAC positions are retained with the decision.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || attendance.attendingMemberIds.length === 0} onClick={async () => {
      setError(''); setSaving(true)
      try { await onSubmit(attendance); onClose() } catch (err) { setError(err.response?.data?.message ?? 'Could not finalize the BAC action.') } finally { setSaving(false) }
    }}>{saving ? 'Finalizing…' : 'Finalize BAC action'}</Button></div>
  </div></Modal>
}

export function PostQualificationModal({ bid, onClose, onSubmit }) {
  const [checklist, setChecklist] = useState({ legal: '', technical: '', financial: '' })
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return <Modal title={`Final supplier verification (post-qualification) — ${bid.vendorName}`} onClose={onClose}><form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault(); setError(''); setSaving(true)
    try { await onSubmit({ result: Object.values(checklist).every((value) => value === 'ok') ? 'passed' : 'failed', checklist, remarks }); onClose() } catch (err) { setError(err.response?.data?.message ?? 'Could not record the verification.') } finally { setSaving(false) }
  }}>
    {Object.entries(checklist).map(([key, value]) => <label key={key} className="block text-sm capitalize text-text-secondary">{key} verification<select required value={value} onChange={(event) => setChecklist({ ...checklist, [key]: event.target.value })} className={inputClass}><option value="">Select result</option><option value="ok">Verified and compliant</option><option value="failed">Failed verification</option></select></label>)}
    <label className="block text-xs text-text-secondary">Verification findings<textarea required rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} className={inputClass} /></label>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record verification'}</Button></div>
  </form></Modal>
}
