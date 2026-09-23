import { useEffect, useState, useCallback } from 'react'
import { EyeOff, Eye } from 'lucide-react'
import AwardQueue from './AwardQueue'
import * as biddingApi from '../../api/bidding'
import { RFQ_STATUS_LABELS, RFQ_STATUS_TONES } from '../../api/bidding'
import { downloadDocument } from '../../api/documents'
import { usePermissions } from '../../context/usePermissions'
import { useAuth } from '../../context/useAuth'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import NextStep from '../../components/ui/NextStep'
import { rfqNext } from '../../config/nextSteps'
import { useTableControls } from '../../components/ui/useTableControls'
import { BidEvaluationModal, TwgAssessmentModal, CommitteeActionModal, PostQualificationModal } from './EvaluationForms'
import ProcurementTimeline from './ProcurementTimeline'

const peso = (value) => value == null ? 'Sealed' : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const score = (value) => value == null ? '—' : Number(value).toFixed(2)
const recommendationLabels = { furtherEvaluation: 'Recommend for further evaluation', postQualification: 'Recommend for final supplier verification (post-qualification)', compliant: 'Recommend as compliant', nonCompliant: 'Recommend as non-compliant', disqualification: 'Recommend disqualification' }

export default function EvaluationWorkspace() {
  const permissions = usePermissions()
  const { user } = useAuth()
  const [rfqs, setRfqs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [bidData, setBidData] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [twg, setTwg] = useState(null)
  const [administration, setAdministration] = useState(null)
  const [modal, setModal] = useState(null)
  const [declaring, setDeclaring] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])
  const canTwg = permissions.has('bidding.technicalInput')
  const canEvaluate = permissions.has('bidding.evaluate')
  const canChair = permissions.has('bidding.chairEvaluation')
  const selected = rfqs.find((rfq) => rfq.id === selectedId)
  const consulting = selected?.category === 'consulting'
  const evaluationOpen = selected?.status === 'opened' && !administration?.failureReviewPending

  useEffect(() => {
    let active = true
    biddingApi.fetchRfqs().then((data) => {
      if (!active) return
      const relevant = data.filter((rfq) => ['opened', 'evaluated', 'awarded'].includes(rfq.status))
      setRfqs(relevant)
      setSelectedId((id) => relevant.some((rfq) => rfq.id === id) ? id : relevant[0]?.id ?? null)
    }).catch((err) => { if (active) setActionError(err.response?.data?.message ?? 'Could not load procurements awaiting evaluation.') })
    return () => { active = false }
  }, [refreshToken])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    Promise.all([biddingApi.fetchBids(selectedId), biddingApi.fetchTwg(selectedId), biddingApi.fetchEvaluationAdministration(selectedId)]).then(([bids, assessments, administrationData]) => {
      if (active) { setBidData(bids); setTwg(assessments); setAdministration(administrationData); setLoadedId(selectedId) }
    }).catch((err) => { if (active) { setBidData(null); setTwg(null); setActionError(err.response?.data?.message ?? 'Could not load bid and TWG evaluation records.') } })
    return () => { active = false }
  }, [selectedId, refreshToken])

  const run = async (fn, success) => {
    setActionError(''); setMessage('')
    const result = await fn()
    setMessage(result?.message ?? success)
    refresh()
    return result
  }
  const assessmentsFor = (bidId) => (twg?.assessments ?? []).filter((row) => row.bidId === bidId)
  const ownAssessment = (bidId) => assessmentsFor(bidId).find((row) => row.memberId === user?.id)
  const twgComplete = Boolean(bidData?.bids?.length) && bidData.bids.every((bid) => assessmentsFor(bid.id).some((row) => row.status === 'submitted'))
  const rfqAlreadyAwarded = selected?.status === 'awarded' || bidData?.bids?.some((bid) => bid.status === 'awarded')
  const rfqTable = useTableControls(rfqs, { searchKeys: ['referenceNo', 'title'], filters: [{ key: 'status', label: 'All stages', options: Object.entries(RFQ_STATUS_LABELS).map(([value, label]) => ({ value, label })) }] })
  const bidTable = useTableControls(bidData?.bids, { searchKeys: ['vendorName', 'blindLabel', 'status'], filters: [{ key: 'status', label: 'All bid statuses' }], accessors: { totalBidPrice: (bid) => bid.totalBidPrice == null ? null : Number(bid.totalBidPrice), averageScore: (bid) => bid.averageScore == null ? null : Number(bid.averageScore), combinedScore: (bid) => bid.combinedScore == null ? null : Number(bid.combinedScore) } })

  // Item 12: TWG assessment and BAC evaluation are long workflow forms — full
  // pages, not modals over the workspace. Post-qualification (a short
  // checklist) and committee attendance confirmations stay modals.
  if (modal?.type === 'twg') {
    return <DashboardPage>
      <TwgAssessmentModal bid={modal.bid} assessment={modal.assessment} onClose={() => setModal(null)} onSaved={(status) => { setMessage(status === 'submitted' ? 'TWG technical evaluation successfully submitted. The evaluation is now available for BAC review.' : 'TWG evaluation saved as draft. Complete the assessment before submitting to the BAC.'); refresh() }} />
    </DashboardPage>
  }
  if (modal?.type === 'evaluate') {
    return <DashboardPage>
      <BidEvaluationModal bid={modal.bid} rfq={selected} plan={bidData?.evaluationPlan} requirements={bidData?.complianceRequirements} onClose={() => setModal(null)} onSubmit={(payload) => run(() => biddingApi.submitEvaluation(modal.bid.id, payload), 'BAC evaluation recorded. The Chairperson may close evaluation after all required reviews are complete.')} />
    </DashboardPage>
  }
  return <DashboardPage>
    <PageHeader title={canTwg && !canEvaluate ? 'Technical Working Group (TWG) Evaluation' : 'Evaluation Workspace'} subtitle="Technical assessment, Bids and Awards Committee (BAC) review, financial ranking, final supplier verification (post-qualification) and award recommendation." />
    {actionError && <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{actionError}</p>}
    {message && <p role="status" className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{message}</p>}
    <Card bodyClassName="p-4">
      <TableToolbar {...rfqTable.toolbarProps} searchPlaceholder="Search reference or title…" />
      <div className="mt-3 flex flex-wrap gap-2">
        {rfqTable.rows.length === 0 && <p className="text-sm text-text-faint">No procurements match the current evaluation queue.</p>}
        {rfqTable.pageRows.map((rfq) => <button key={rfq.id} type="button" onClick={() => { setSelectedId(rfq.id); setBidData(null); setTwg(null); setActionError(''); setMessage(''); setDeclaring(false) }} className={`min-h-11 max-w-full rounded border px-4 py-2 text-left text-xs ${selectedId === rfq.id ? 'border-navy bg-accent text-accent-fg' : 'border-border-muted bg-surface text-text-secondary'}`}>{rfq.referenceNo}<span className="ml-2 opacity-70">{RFQ_STATUS_LABELS[rfq.status]}</span></button>)}
      </div>
      <Pagination {...rfqTable.paginationProps} label="procurements" />
    </Card>
    {selected && bidData && loadedId === selectedId && <>
      <ProcurementTimeline rfq={selected} bids={bidData.bids} twgComplete={twgComplete} />
      {administration?.failureReviewPending && <p role="status" className="rounded border border-border-muted p-4 text-sm text-info">Failure of Bidding is under BAC review. Evaluation evidence is locked until the recorded committee decision is complete.</p>}
      {(canTwg || canEvaluate) && evaluationOpen && <Card title="Conflict-of-interest declaration">
        {administration?.declaration?.noConflictDeclared === false ? <p role="alert" className="text-sm text-danger">You reported a conflict of interest. Evaluation is blocked and administrative reassignment is required.</p> : (administration?.declaration ?? twg?.declaration)?.noConflictDeclared ? <p className="text-sm text-success">No conflict of interest declared by {user?.name} on {new Date((administration?.declaration ?? twg.declaration).declaredAt).toLocaleString('en-PH')}. You may prepare your evaluation.</p> : <div className="space-y-3">
          <p className="text-sm text-text-secondary">I confirm that I have no conflict of interest with any bidder participating in this procurement.</p>
          <label className="flex min-h-11 items-center gap-2 text-sm text-navy"><input type="checkbox" checked={declaring} onChange={(event) => setDeclaring(event.target.checked)} />I declare that I have no conflict of interest.</label>
          <Button disabled={!declaring} onClick={() => run(() => biddingApi.declareEvaluatorConflict(selected.id, true), 'Declaration recorded. You may now prepare your evaluation.').catch((err) => setActionError(err.response?.data?.message ?? 'Could not record the declaration.'))}>Record declaration</Button>
        </div>}
        {administration?.declaration?.noConflictDeclared !== false && <div className="mt-3 space-y-2"><p className="text-xs text-text-secondary">If you have a conflict with any participating bidder, record it here. Your participation will be blocked for reassignment.</p><Button variant="secondary" onClick={() => run(() => biddingApi.declareEvaluatorConflict(selected.id, false), 'Conflict recorded; reassignment required.').catch((err) => setActionError(err.response?.data?.message ?? 'Could not record the conflict.'))}>I have a conflict of interest</Button></div>}
      </Card>}
      {canChair && administration?.conflicts?.length > 0 && <Card title="Evaluator reassignment required">{administration.conflicts.map((row) => <p key={row.id} className="text-sm text-danger">{row.user?.name} ({row.role}) reported a conflict on {new Date(row.declaredAt).toLocaleString('en-PH')}. Assign another authorized evaluator; this user is blocked from participation.</p>)}</Card>}
      <Card title={`${selected.referenceNo} — ${selected.title}`} icon={bidData.blind ? EyeOff : Eye} action={<Badge tone={RFQ_STATUS_TONES[selected.status]}>{RFQ_STATUS_LABELS[selected.status]}</Badge>} bodyClassName="">
        <div className="border-b border-border-muted px-4 py-3">
          <NextStep next={rfqNext(selected)} tone={RFQ_STATUS_TONES[selected.status]} />
        </div>
        <div className="space-y-2 border-b border-border-muted bg-sidebar px-4 py-3 text-xs text-text-secondary">
          <p>{bidData.blindNotice ?? 'Technical evaluation is closed. Financial envelopes are available for technically compliant bidders.'}</p>
          <p>{consulting ? `Consulting Services: quality ${bidData.qualityWeight ?? selected.qualityWeight}% + financial ${bidData.financialWeight ?? selected.financialWeight}%. Financial score = lowest eligible price ÷ bidder price × 100; combined score applies the approved weights.` : 'Goods / Infrastructure: preliminary examination → technical compliance → financial evaluation → lowest responsive bid ranking → final supplier verification (post-qualification). A failed mandatory requirement prevents award recommendation.'}</p>
        </div>
        <div className="p-4"><TableToolbar {...bidTable.toolbarProps} searchPlaceholder="Search bidder or status…" /></div>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-sidebar"><tr>
          <SortableTh {...bidTable.sortProps('vendorName')}>Bidder</SortableTh>
          {consulting ? <><SortableTh {...bidTable.sortProps('averageScore')}>Quality</SortableTh><Th>Financial score</Th><SortableTh {...bidTable.sortProps('combinedScore')}>Combined</SortableTh></> : <Th>Technical compliance</Th>}
          <Th>Evaluations</Th><SortableTh {...bidTable.sortProps('totalBidPrice')}>Bid price</SortableTh><SortableTh {...bidTable.sortProps('status')}>Status</SortableTh><Th>Actions</Th>
        </tr></thead><tbody>{bidTable.pageRows.map((bid) => {
          const own = ownAssessment(bid.id)
          const submitted = assessmentsFor(bid.id).some((row) => row.status === 'submitted')
          const evaluatedByMe = (bid.evaluations ?? []).some((row) => (row.evaluatorId ?? row.memberId) === user?.id && (!row.status || row.status === 'submitted'))
          return <tr key={bid.id} className="border-t border-border-muted">
            <td className="px-4 py-3 text-sm text-navy">{bid.vendorName ?? bid.blindLabel}</td>
            {consulting ? <><td className="px-4 py-3 text-sm">{score(bid.qualityScore ?? bid.averageScore)}</td><td className="px-4 py-3 text-sm">{score(bid.financialScore)}</td><td className="px-4 py-3 text-sm font-semibold">{score(bid.combinedScore)}</td></> : <td className="px-4 py-3 text-xs">{['technicalPassed', 'postQualified', 'awarded'].includes(bid.status) ? 'Compliant' : ['technicalFailed', 'disqualified'].includes(bid.status) ? 'Non-Compliant' : 'Awaiting technical decision'}</td>}
            <td className="px-4 py-3 text-xs" title="Bids and Awards Committee (BAC) evaluations / Technical Working Group (TWG) assessments">{bid.evaluationCount ?? 0} BAC<br />{assessmentsFor(bid.id).filter((row) => row.status === 'submitted').length} TWG</td>
            <td className="whitespace-nowrap px-4 py-3 text-sm">{peso(bid.totalBidPrice)}</td>
            <td className="px-4 py-3"><Badge tone={bid.status === 'awarded' ? 'success' : /failed|disqual/i.test(bid.status) ? 'danger' : 'info'}>{bid.status}</Badge></td>
            <td className="px-4 py-3 whitespace-nowrap"><div className="flex w-max items-center gap-2">
              {evaluationOpen && canTwg && own?.status !== 'submitted' && <Button size="table" variant="secondary" disabled={!twg?.declaration?.noConflictDeclared} title={twg?.declaration?.noConflictDeclared ? undefined : 'Record your conflict-of-interest declaration above first'} onClick={() => setModal({ type: 'twg', bid, assessment: own })}>{own ? 'Continue TWG draft' : 'TWG assessment'}</Button>}
              {evaluationOpen && canEvaluate && !own && !evaluatedByMe && <Button size="table" variant="secondary" disabled={administration?.declaration?.noConflictDeclared === false || (twg?.required !== false && !submitted) || (consulting && bidData?.evaluationPlan?.status !== 'approved')} title={twg?.required !== false && !submitted ? 'Available after the TWG submits its technical assessment' : undefined} onClick={() => setModal({ type: 'evaluate', bid })}>{consulting ? 'Evaluate Quality and Price' : 'Evaluate compliance'}</Button>}
              {(canChair || canEvaluate) && selected.status === 'evaluated' && bid.status === 'technicalPassed' && <Button size="table" variant="secondary" title="Final supplier verification (post-qualification): check the lowest responsive bidder's documents and capability" onClick={() => setModal({ type: 'postQualification', bid })}>Verify supplier</Button>}
              {canChair && !rfqAlreadyAwarded && bid.status === 'postQualified' && <Button size="table" onClick={() => setModal({ type: 'recommend', bid })}>Recommend award</Button>}
            </div></td>
          </tr>
        })}</tbody></table></div>
        {bidTable.rows.length === 0 && <p className="p-6 text-sm text-text-faint">No bids match this selection.</p>}
        <Pagination {...bidTable.paginationProps} label="bids" />
        {evaluationOpen && canChair && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted p-4"><p className="max-w-xl text-xs text-text-secondary">Complete TWG assessments and BAC evaluations before closing. Closing reveals identities and opens financial envelopes only for technically compliant bidders.</p><Button disabled={twg?.required !== false && !twgComplete} onClick={() => setModal({ type: 'close' })}>Close technical evaluation</Button></div>}
        {!bidData.blind && permissions.has('bidding.award') && <p className="border-t border-border-muted p-4 text-xs text-text-secondary">Award approval is available in the Awards queue. The BAC recommends and the authorized approving officer reviews.</p>}
      </Card>
      <Card title="BAC evaluation breakdown">
        {bidData.bids.flatMap((bid) => (bid.evaluations ?? []).map((evaluation) => <details key={evaluation.id} className="border-b border-border-muted py-3 last:border-0">
          <summary className="cursor-pointer break-words text-sm font-medium text-navy">{bid.vendorName ?? bid.blindLabel} · {evaluation.evaluatorName ?? `Evaluator #${evaluation.evaluatorId}`} · {consulting ? `Quality ${score(evaluation.score)} / 100` : Number(evaluation.score) === 100 ? 'Compliant' : 'Non-Compliant'}</summary>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 [&_dd]:break-words">{Object.entries(evaluation.criteriaBreakdown?.requirementsExamined ?? evaluation.criteriaBreakdown ?? {}).filter(([key]) => key !== 'verdict').map(([key, value]) => <div key={key}><dt className="text-text-faint">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{String(value)}</dd></div>)}</dl>
          {evaluation.remarks && <p className="mt-2 text-sm text-text-secondary">Remarks: {evaluation.remarks}</p>}
          <p className="mt-2 text-xs text-text-faint">Status: {evaluation.status ?? 'submitted'}; submitted {new Date(evaluation.submittedAt).toLocaleString('en-PH')}. Conflict declaration: {evaluation.noConflictDeclared ? new Date(evaluation.declaredAt).toLocaleString('en-PH') : 'Missing'}.</p>
          {evaluation.failureReason && <p className="mt-2 text-sm text-danger">Failure: {evaluation.failureReason}. {evaluation.failureExplanation}</p>}
          {evaluation.recommendation && <p className="mt-2 text-sm">Recommendation: {evaluation.recommendation}</p>}
          {Object.entries(evaluation.requirementRemarks ?? {}).filter(([, value]) => value).map(([key, value]) => <p key={key} className="mt-1 text-xs">{key}: {value}</p>)}
          {(evaluation.supportingDocuments ?? []).map((document, index) => <a key={index} className="mr-3 inline-block max-w-full break-all text-xs text-info underline" href={document.url} target="_blank" rel="noreferrer">{document.name}</a>)}
          {canChair && evaluationOpen && evaluation.status === 'submitted' && evaluation.evaluatorId !== user?.id && <Button size="table" variant="secondary" onClick={() => setModal({ type: 'return', kind: 'bac', evaluation })}>Return evaluation for correction</Button>}
        </details>))}
        {!bidData.bids.some((bid) => bid.evaluations?.length) && <p className="text-sm text-text-faint">Submitted BAC evaluations and their criterion results will appear here.</p>}
      </Card>
      <Card title="TWG assessments available for BAC review">
        {(twg?.assessments ?? []).filter((row) => row.status === 'submitted').length === 0 && <p className="text-sm text-text-faint">Submitted technical assessments will appear here before BAC review.</p>}
        {(twg?.assessments ?? []).filter((row) => ['submitted', 'recused'].includes(row.status)).map((assessment) => <details key={assessment.id} className="border-b border-border-muted py-3 last:border-0">
          <summary className="cursor-pointer text-sm font-medium text-navy">{bidData.bids.find((bid) => bid.id === assessment.bidId)?.vendorName ?? `Bid ${assessment.bidId}`} · {assessment.memberName} · {recommendationLabels[assessment.recommendation] ?? assessment.recommendation}</summary>
          <p className="mt-2 text-xs text-text-secondary">No conflict declared: {assessment.noConflictDeclared ? new Date(assessment.declaredAt).toLocaleString('en-PH') : 'Not recorded'} · Submitted: {assessment.submittedAt ? new Date(assessment.submittedAt).toLocaleString('en-PH') : '—'}</p>
          <p className="mt-2 text-sm text-navy">{assessment.status === 'recused' ? 'Excluded following conflict of interest. ' : ''}Justification: {assessment.remarks}</p>
          {canChair && evaluationOpen && assessment.status === 'submitted' && assessment.memberId !== user?.id && <Button size="table" variant="secondary" onClick={() => setModal({ type: 'return', kind: 'twg', evaluation: assessment })}>Return assessment for correction</Button>}
          {(assessment.requirements ?? []).map((item, index) => <div key={index} className="mt-3 rounded border border-border-muted p-3 text-sm">
            <p className="font-medium text-navy">{item.requirement} — {item.complianceStatus}</p><p className="mt-1 text-text-secondary">{item.findings}</p>{item.remarks && <p className="mt-1 text-text-secondary">Remarks: {item.remarks}</p>}{item.supportingInformation && <p className="mt-1 text-text-secondary">Supporting information: {item.supportingInformation}</p>}
            {(item.documents ?? []).map((doc) => <button key={typeof doc === 'object' ? doc.id : doc} className="mr-3 mt-2 text-xs text-info underline" onClick={() => downloadDocument(typeof doc === 'object' ? doc.id : doc, doc.filename ?? `TWG-support-${index + 1}.pdf`).catch((err) => setActionError(err.response?.data?.message ?? 'Could not download supporting document.'))}>Download supporting document</button>)}
          </div>)}
        </details>)}
      </Card>
      {administration?.returns?.length > 0 && <Card title="Evaluation correction history">{administration.returns.map((correction) => <details key={correction.id} className="border-b border-border-muted py-3"><summary className="cursor-pointer text-sm">{correction.targetType === 'evaluation' ? 'BAC evaluation' : 'TWG assessment'} #{correction.targetId}: {correction.correctedAt ? 'Corrected' : 'Awaiting correction'}</summary><p className="mt-2 text-sm">Returned by {correction.returnedBy?.name} on {new Date(correction.returnedAt).toLocaleString('en-PH')}: {correction.reason}</p><div className="mt-2 grid gap-3 sm:grid-cols-2">{[['Previous submission', correction.previousSubmission], ['Updated submission', correction.updatedSubmission]].map(([label, submission]) => <div key={label}><p className="text-sm font-medium">{label}</p>{submission ? <><p className="text-xs">{submission.submittedAt ? new Date(submission.submittedAt).toLocaleString('en-PH') : ''} {submission.score != null ? `Score: ${submission.score}` : ''}</p><p className="text-xs">{submission.remarks}</p><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(submission.criteriaBreakdown ?? submission.requirements, null, 2)}</pre></> : <p className="text-xs">Pending evaluator resubmission</p>}</div>)}</div></details>)}</Card>}
    </>}
    {modal?.type === 'postQualification' && <PostQualificationModal bid={modal.bid} onClose={() => setModal(null)} onSubmit={(payload) => run(() => biddingApi.submitPostQualification(modal.bid.id, payload), 'Final supplier verification (post-qualification) recorded. Compliant bidders may proceed to BAC award recommendation.')} />}
    {modal?.type === 'return' && <CommitteeActionModal title="Return evaluation for correction" description="State the correction required. The original submission and this BAC action will be retained in the permanent history." reasonRequired onClose={() => setModal(null)} onSubmit={(payload) => run(() => biddingApi.returnEvaluation(modal.kind, modal.evaluation.id, payload), 'Evaluation returned for correction.')} />}
    {(modal?.type === 'close' || modal?.type === 'recommend') && <CommitteeActionModal title={modal.type === 'close' ? 'Close technical evaluation' : 'BAC award recommendation'} description={modal.type === 'close' ? 'Confirm the attending BAC members. This decision closes technical evaluation and calculates the eligible financial ranking.' : 'Confirm BAC participation before forwarding the recommendation for award approval.'} onClose={() => setModal(null)} onSubmit={(payload) => modal.type === 'close' ? run(() => biddingApi.closeEvaluation(selected.id, payload), 'Technical evaluation closed. Review financial ranking and proceed to post-qualification.') : run(() => biddingApi.recommendAward(modal.bid.id, payload), 'BAC award recommendation recorded and forwarded to the approving officer.')} />}
    {(permissions.has('bidding.award') || canChair || permissions.has('bidding.view')) && <AwardQueue version={refreshToken} onChanged={refresh} />}
  </DashboardPage>
}
