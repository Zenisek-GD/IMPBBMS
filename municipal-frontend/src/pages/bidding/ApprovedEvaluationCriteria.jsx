import { useEffect, useState } from 'react'
import { fetchEvaluationPlan, saveEvaluationPlan, approveEvaluationPlan, requestCriteriaAmendment, approveCriteriaAmendment } from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import { useAuth } from '../../context/useAuth'
import Button from '../../components/ui/Button'
import BacAttendance from './BacAttendance'

const input = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm'
const initial = { qualityWeight: 75, financialWeight: 25, passingScore: 60, financialMethod: 'lowestResponsivePrice', criteria: [
  { key: 'experience', name: 'Experience', description: '', maxScore: 100, weight: 30, minimumScore: '' },
  { key: 'personnel', name: 'Qualification of personnel', description: '', maxScore: 100, weight: 30, minimumScore: '' },
  { key: 'methodology', name: 'Methodology and work plan', description: '', maxScore: 100, weight: 40, minimumScore: '' },
] }

export default function ApprovedEvaluationCriteria({ rfq, onChanged }) {
  const permissions = usePermissions()
  const { user } = useAuth()
  const [plan, setPlan] = useState(initial)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState('')
  const [amendments, setAmendments] = useState([])
  const [canAmend, setCanAmend] = useState(false)
  const [amending, setAmending] = useState(false)
  const [amendmentReason, setAmendmentReason] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [documentUrl, setDocumentUrl] = useState('')
  const [attendance, setAttendance] = useState({ attendingMemberIds: [], presidingMemberId: '' })
  useEffect(() => {
    let active = true
    fetchEvaluationPlan(rfq.id).then((data) => { if (active) { setSaved(data.plan); setPlan(data.plan ?? initial); setAmendments(data.amendments ?? []); setCanAmend(data.canAmend) } }).catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load evaluation criteria.') })
    return () => { active = false }
  }, [rfq.id])
  if (rfq.category !== 'consulting') return <p className="text-sm text-text-secondary">{rfq.category === 'infrastructure' ? 'Infrastructure' : 'Goods'} uses mandatory compliance checks and Pass / Fail decisions. Quality-price scoring does not apply.</p>
  const locked = rfq.status !== 'draft' || saved?.status === 'approved'
  const pendingAmendment = amendments.find((row) => row.status === 'submitted')
  const canPrepare = permissions.has('bidding.publish') && (!locked || amending)
  const unsavedChanges = saved && JSON.stringify(plan) !== JSON.stringify(saved)
  const act = async (fn) => {
    setBusy(true); setError(''); setMessage('')
    try { const data = await fn(); const refreshed = await fetchEvaluationPlan(rfq.id); setSaved(refreshed.plan); setPlan(refreshed.plan ?? initial); setAmendments(refreshed.amendments ?? []); setCanAmend(refreshed.canAmend); setAmending(false); setMessage(data.message); onChanged?.() }
    catch (err) { setError(err.response?.data?.message ?? 'Could not save evaluation criteria.') }
    finally { setBusy(false) }
  }
  const changeCriterion = (index, key, value) => setPlan({ ...plan, criteria: plan.criteria.map((criterion, i) => i === index ? { ...criterion, [key]: value } : criterion) })
  return <section className="space-y-4 rounded border border-border-muted p-4">
    <h3 className="font-semibold text-navy">Approved Consulting Evaluation Criteria</h3>
    <p className="text-sm text-text-secondary">Configure quality criteria before publication. Quality must outweigh price, and both weights must total 100%. BAC approval locks the criteria for the entire bidding attempt.</p>
    {locked && <p className="text-sm text-info">{saved?.status === 'approved' ? `Locked under approval ${saved.approvalReference}, revision ${saved.revision ?? 1}.` : 'Publication has locked this attempt. Its approved criteria must already be on record.'} Changes require an approved amendment before bids have been received; later changes require a new authorized attempt.</p>}
    {canAmend && !amending && !pendingAmendment && permissions.has('bidding.publish') && <Button variant="secondary" onClick={() => setAmending(true)}>Request criteria amendment</Button>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {message && <p role="status" className="text-sm text-success">{message}</p>}
    <fieldset disabled={!canPrepare || busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">{[['qualityWeight', 'Quality weight (%)'], ['financialWeight', 'Price weight (%)'], ['passingScore', 'Minimum quality score (%)']].map(([key, label]) => <label key={key} className="text-xs text-text-secondary">{label}<input type="number" min="0" max="100" step="0.01" value={plan[key]} onChange={(event) => setPlan({ ...plan, [key]: event.target.value })} className={input} /></label>)}</div>
      {plan.criteria.map((criterion, index) => <div key={index} className="space-y-3 rounded border border-border-muted p-3">
        <label className="block text-xs">Criterion name<input value={criterion.name} onChange={(event) => changeCriterion(index, 'name', event.target.value)} className={input} /></label>
        <label className="block text-xs">Description<textarea value={criterion.description} onChange={(event) => changeCriterion(index, 'description', event.target.value)} className={input} /></label>
        <div className="grid gap-3 sm:grid-cols-3">{[['maxScore', 'Maximum score'], ['weight', 'Quality criterion weight (%)'], ['minimumScore', 'Minimum score (optional)']].map(([key, label]) => <label key={key} className="text-xs">{label}<input type="number" min="0" step="0.01" value={criterion[key] ?? ''} onChange={(event) => changeCriterion(index, key, event.target.value)} className={input} /></label>)}</div>
        {canPrepare && plan.criteria.length > 1 && <Button variant="secondary" onClick={() => setPlan({ ...plan, criteria: plan.criteria.filter((_, i) => i !== index) })}>Remove criterion</Button>}
      </div>)}
      {canPrepare && <Button variant="secondary" onClick={() => setPlan({ ...plan, criteria: [...plan.criteria, { key: `criterion_${Date.now()}`, name: '', description: '', maxScore: 100, weight: '', minimumScore: '' }] })}>Add approved criterion</Button>}
    </fieldset>
    <p className="text-xs text-text-secondary">Approved financial method: lowest technically responsive price ÷ bidder price × 100. Financial scores are calculated when technical evaluation closes.</p>
    {canPrepare && !amending && <Button disabled={busy} onClick={() => act(() => saveEvaluationPlan(rfq.id, plan))}>Save criteria for BAC approval</Button>}
    {amending && <div className="space-y-3 rounded border border-border-muted p-3">
      <p className="text-sm">Edit the proposed criteria above. Current approved criteria remain in effect until BAC approval.</p>
      <label className="block text-xs">Amendment reason<textarea value={amendmentReason} onChange={(event) => setAmendmentReason(event.target.value)} className={input} /></label>
      <label className="block text-xs">Supporting document title<input value={documentName} onChange={(event) => setDocumentName(event.target.value)} className={input} /></label>
      <label className="block text-xs">Supporting document HTTPS link<input type="url" value={documentUrl} onChange={(event) => setDocumentUrl(event.target.value)} className={input} /></label>
      <div className="flex gap-2"><Button variant="secondary" onClick={() => { setAmending(false); setPlan(saved) }}>Cancel amendment</Button><Button disabled={busy || !amendmentReason.trim() || !documentName.trim() || !documentUrl.trim()} onClick={() => act(() => requestCriteriaAmendment(rfq.id, { plan, reason: amendmentReason, supportingDocuments: [{ name: documentName, url: documentUrl }] }))}>Submit amendment to BAC</Button></div>
    </div>}
    {!locked && saved && permissions.has('bidding.chairEvaluation') && saved.preparedById !== user?.id && <div className="space-y-3 border-t border-border-muted pt-4">
      <p className="text-sm text-text-secondary">Approval applies to the saved criteria above.</p>
      <label className="block text-xs">BAC approval / resolution reference<input value={reference} onChange={(event) => setReference(event.target.value)} className={input} /></label>
      <BacAttendance value={attendance} onChange={setAttendance} />
      {unsavedChanges && <p className="text-sm text-info">Save your changes before requesting approval. Another authorized officer must approve a draft you prepare.</p>}
      <Button disabled={busy || !reference.trim() || unsavedChanges} onClick={() => act(() => approveEvaluationPlan(rfq.id, { approvalReference: reference, ...attendance }))}>Approve and lock criteria</Button>
    </div>}
    {amendments.map((amendment) => <details key={amendment.id} className="rounded border border-border-muted p-3">
      <summary className="cursor-pointer text-sm font-medium">Criteria amendment #{amendment.id} — {amendment.status}</summary>
      <p className="mt-2 text-sm">{amendment.reason}</p>
      {amendment.approvalReference && <p className="text-xs">Approval: {amendment.approvalReference}; {new Date(amendment.approvedAt).toLocaleString('en-PH')}.</p>}
      {(amendment.supportingDocuments ?? []).map((document, index) => <a key={index} href={document.url} target="_blank" rel="noreferrer" className="mr-3 text-xs text-info underline">{document.name}</a>)}
      <p className="text-xs">Previous quality / price weights: {amendment.previousPlan.qualityWeight}% / {amendment.previousPlan.financialWeight}%. Proposed: {amendment.proposedPlan.qualityWeight}% / {amendment.proposedPlan.financialWeight}%.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{[['Previous criteria', amendment.previousPlan.criteria], ['Proposed criteria', amendment.proposedPlan.criteria]].map(([label, criteria]) => <div key={label}><p className="text-sm font-medium">{label}</p>{criteria.map((criterion) => <p key={criterion.key} className="text-xs">{criterion.name}: maximum {criterion.maxScore}, weight {criterion.weight}%, minimum {criterion.minimumScore ?? 'none'}</p>)}</div>)}</div>
      {amendment.status === 'submitted' && permissions.has('bidding.chairEvaluation') && amendment.requestedById !== user?.id && <div className="mt-3 space-y-3">
        <label className="block text-xs">BAC amendment approval / resolution reference<input value={reference} onChange={(event) => setReference(event.target.value)} className={input} /></label>
        <BacAttendance value={attendance} onChange={setAttendance} />
        <Button disabled={busy || !reference.trim()} onClick={() => act(() => approveCriteriaAmendment(amendment.id, { approvalReference: reference, ...attendance }))}>Approve criteria amendment</Button>
      </div>}
    </details>)}
  </section>
}
