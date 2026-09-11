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
import { useTableControls } from '../../components/ui/useTableControls'
import { BidEvaluationModal, TwgAssessmentModal, CommitteeActionModal, PostQualificationModal } from './EvaluationForms'
import ProcurementTimeline from './ProcurementTimeline'

const peso = (value) => value == null ? 'Sealed' : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const score = (value) => value == null ? '—' : Number(value).toFixed(2)
const recommendationLabels = { furtherEvaluation: 'Recommend for further evaluation', postQualification: 'Recommend for post-qualification', compliant: 'Recommend as compliant', nonCompliant: 'Recommend as non-compliant', disqualification: 'Recommend disqualification' }

export default function EvaluationWorkspace() {
  const permissions = usePermissions()
  const { user } = useAuth()
  const [rfqs, setRfqs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [bidData, setBidData] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [twg, setTwg] = useState(null)
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
    Promise.all([biddingApi.fetchBids(selectedId), biddingApi.fetchTwg(selectedId)]).then(([bids, assessments]) => {
      if (active) { setBidData(bids); setTwg(assessments); setLoadedId(selectedId) }
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
  return <DashboardPage>
    <PageHeader title={canTwg && !canEvaluate ? 'TWG Evaluation' : 'Evaluation Workspace'} subtitle="Technical assessment, BAC review, financial ranking, post-qualification and award recommendation." />
    {actionError && <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{actionError}</p>}
    {message && <p role="status" className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{message}</p>}
    <Card bodyClassName="p-4">
      <TableToolbar {...rfqTable.toolbarProps} searchPlaceholder="Search reference or title…" />
      <div className="mt-3 flex flex-wrap gap-2">
        {rfqTable.rows.length === 0 && <p className="text-sm text-text-faint">No procurements match the current evaluation queue.</p>}
        {rfqTable.pageRows.map((rfq) => <button key={rfq.id} type="button" onClick={() => { setSelectedId(rfq.id); setBidData(null); setTwg(null); setActionError(''); setMessage(''); setDeclaring(false) }} className={`rounded border px-4 py-2 text-left text-xs ${selectedId === rfq.id ? 'border-navy bg-accent text-accent-fg' : 'border-border-muted bg-surface text-text-secondary'}`}>{rfq.referenceNo}<span className="ml-2 opacity-70">{RFQ_STATUS_LABELS[rfq.status]}</span></button>)}
      </div>
      <Pagination {...rfqTable.paginationProps} label="procurements" />
    </Card>
    {selected && bidData && loadedId === selectedId && <>
      <ProcurementTimeline rfq={selected} bids={bidData.bids} twgComplete={twgComplete} />
      {canTwg && selected.status === 'opened' && <Card title="Conflict-of-interest declaration">
        {twg?.declaration?.noConflictDeclared ? <p className="text-sm text-success">No conflict of interest declared by {user?.name} on {new Date(twg.declaration.declaredAt).toLocaleString('en-PH')}. You may prepare your technical assessment.</p> : <div className="space-y-3">
          <p className="text-sm text-text-secondary">I confirm that I have no conflict of interest with any bidder participating in this procurement.</p>
          <label className="flex items-center gap-2 text-sm text-navy"><input type="checkbox" checked={declaring} onChange={(event) => setDeclaring(event.target.checked)} />I declare that I have no conflict of interest.</label>
          <Button disabled={!declaring} onClick={() => run(() => biddingApi.declareNoConflict(selected.id), 'Declaration recorded. You may now prepare the TWG technical assessment.').catch((err) => setActionError(err.response?.data?.message ?? 'Could not record the declaration.'))}>Record declaration</Button>
        </div>}
      </Card>}
      <Card title={`${selected.referenceNo} — ${selected.title}`} icon={bidData.blind ? EyeOff : Eye} action={<Badge tone={RFQ_STATUS_TONES[selected.status]}>{RFQ_STATUS_LABELS[selected.status]}</Badge>} bodyClassName="">
        <div className="space-y-2 border-b border-border-muted bg-sidebar px-4 py-3 text-xs text-text-secondary">
          <p>{bidData.blindNotice ?? 'Technical evaluation is closed. Financial envelopes are available for technically compliant bidders.'}</p>
          <p>{consulting ? `Consulting Services: quality ${bidData.qualityWeight ?? selected.qualityWeight}% + financial ${bidData.financialWeight ?? selected.financialWeight}%. Financial score = lowest eligible price ÷ bidder price × 100; combined score applies the approved weights.` : 'Goods / Infrastructure: preliminary examination → technical compliance → financial evaluation → lowest responsive bid ranking → post-qualification. A failed mandatory requirement prevents award recommendation.'}</p>
        </div>
        <div className="p-4"><TableToolbar {...bidTable.toolbarProps} searchPlaceholder="Search bidder or status…" /></div>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-sidebar"><tr>
          <SortableTh {...bidTable.sortProps('vendorName')}>Bidder</SortableTh>
          {consulting ? <><SortableTh {...bidTable.sortProps('averageScore')}>Quality</SortableTh><Th>Financial score</Th><SortableTh {...bidTable.sortProps('combinedScore')}>Combined</SortableTh></> : <Th>Technical compliance</Th>}
          <Th>Evaluations</Th><SortableTh {...bidTable.sortProps('totalBidPrice')}>Bid price</SortableTh><SortableTh {...bidTable.sortProps('status')}>Status</SortableTh><Th>Actions</Th>
        </tr></thead><tbody>{bidTable.pageRows.map((bid) => {
          const own = ownAssessment(bid.id)
          const submitted = assessmentsFor(bid.id).some((row) => row.status === 'submitted')
          const evaluatedByMe = (bid.evaluations ?? []).some((row) => (row.evaluatorId ?? row.memberId) === user?.id)
          return <tr key={bid.id} className="border-t border-border-muted">
            <td className="px-4 py-3 text-sm text-navy">{bid.vendorName ?? bid.blindLabel}</td>
            {consulting ? <><td className="px-4 py-3 text-sm">{score(bid.qualityScore ?? bid.averageScore)}</td><td className="px-4 py-3 text-sm">{score(bid.financialScore)}</td><td className="px-4 py-3 text-sm font-semibold">{score(bid.combinedScore)}</td></> : <td className="px-4 py-3 text-xs">{['technicalPassed', 'postQualified', 'awarded'].includes(bid.status) ? 'Compliant' : ['technicalFailed', 'disqualified'].includes(bid.status) ? 'Non-Compliant' : 'Awaiting technical decision'}</td>}
            <td className="px-4 py-3 text-xs">{bid.evaluationCount ?? 0} BAC<br />{assessmentsFor(bid.id).filter((row) => row.status === 'submitted').length} TWG</td>
            <td className="whitespace-nowrap px-4 py-3 text-sm">{peso(bid.totalBidPrice)}</td>
            <td className="px-4 py-3"><Badge tone={bid.status === 'awarded' ? 'success' : /failed|disqual/i.test(bid.status) ? 'danger' : 'info'}>{bid.status}</Badge></td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
              {selected.status === 'opened' && canTwg && own?.status !== 'submitted' && <Button size="sm" variant="secondary" disabled={!twg?.declaration?.noConflictDeclared} onClick={() => setModal({ type: 'twg', bid, assessment: own })}>{own ? 'Continue TWG draft' : 'TWG assessment'}</Button>}
              {selected.status === 'opened' && canEvaluate && !own && !evaluatedByMe && <Button size="sm" variant="secondary" disabled={twg?.required !== false && !submitted} onClick={() => setModal({ type: 'evaluate', bid })}>{consulting ? 'Score quality' : 'Evaluate compliance'}</Button>}
              {(canChair || canEvaluate) && selected.status === 'evaluated' && bid.status === 'technicalPassed' && <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'postQualification', bid })}>Post-qualify</Button>}
              {canChair && !rfqAlreadyAwarded && bid.status === 'postQualified' && <Button size="sm" onClick={() => setModal({ type: 'recommend', bid })}>Recommend award</Button>}
            </div></td>
          </tr>
        })}</tbody></table></div>
        {bidTable.rows.length === 0 && <p className="p-6 text-sm text-text-faint">No bids match this selection.</p>}
        <Pagination {...bidTable.paginationProps} label="bids" />
        {selected.status === 'opened' && canChair && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted p-4"><p className="max-w-xl text-xs text-text-secondary">Complete TWG assessments and BAC evaluations before closing. Closing reveals identities and opens financial envelopes only for technically compliant bidders.</p><Button disabled={twg?.required !== false && !twgComplete} onClick={() => setModal({ type: 'close' })}>Close technical evaluation</Button></div>}
        {!bidData.blind && permissions.has('bidding.award') && <p className="border-t border-border-muted p-4 text-xs text-text-secondary">Award approval is available in the Awards queue. The BAC recommends and the authorized approving officer reviews.</p>}
      </Card>
      <Card title="BAC evaluation breakdown">
        {bidData.bids.flatMap((bid) => (bid.evaluations ?? []).map((evaluation) => <details key={evaluation.id} className="border-b border-border-muted py-3 last:border-0">
          <summary className="cursor-pointer text-sm font-medium text-navy">{bid.vendorName ?? bid.blindLabel} · {evaluation.evaluatorName ?? `Evaluator #${evaluation.evaluatorId}`} · {consulting ? `Quality ${score(evaluation.score)} / 100` : Number(evaluation.score) === 100 ? 'Compliant' : 'Non-Compliant'}</summary>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">{Object.entries(evaluation.criteriaBreakdown?.requirementsExamined ?? evaluation.criteriaBreakdown ?? {}).filter(([key]) => key !== 'verdict').map(([key, value]) => <div key={key}><dt className="text-text-faint">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{String(value)}</dd></div>)}</dl>
          {evaluation.remarks && <p className="mt-2 text-sm text-text-secondary">Remarks: {evaluation.remarks}</p>}
        </details>))}
        {!bidData.bids.some((bid) => bid.evaluations?.length) && <p className="text-sm text-text-faint">Submitted BAC evaluations and their criterion results will appear here.</p>}
      </Card>
      <Card title="TWG assessments available for BAC review">
        {(twg?.assessments ?? []).filter((row) => row.status === 'submitted').length === 0 && <p className="text-sm text-text-faint">Submitted technical assessments will appear here before BAC review.</p>}
        {(twg?.assessments ?? []).filter((row) => row.status === 'submitted').map((assessment) => <details key={assessment.id} className="border-b border-border-muted py-3 last:border-0">
          <summary className="cursor-pointer text-sm font-medium text-navy">{bidData.bids.find((bid) => bid.id === assessment.bidId)?.vendorName ?? `Bid ${assessment.bidId}`} · {assessment.memberName} · {recommendationLabels[assessment.recommendation] ?? assessment.recommendation}</summary>
          <p className="mt-2 text-xs text-text-secondary">No conflict declared: {assessment.noConflictDeclared ? new Date(assessment.declaredAt).toLocaleString('en-PH') : 'Not recorded'} · Submitted: {assessment.submittedAt ? new Date(assessment.submittedAt).toLocaleString('en-PH') : '—'}</p>
          <p className="mt-2 text-sm text-navy">Justification: {assessment.remarks}</p>
          {(assessment.requirements ?? []).map((item, index) => <div key={index} className="mt-3 rounded border border-border-muted p-3 text-sm">
            <p className="font-medium text-navy">{item.requirement} — {item.complianceStatus}</p><p className="mt-1 text-text-secondary">{item.findings}</p>{item.remarks && <p className="mt-1 text-text-secondary">Remarks: {item.remarks}</p>}{item.supportingInformation && <p className="mt-1 text-text-secondary">Supporting information: {item.supportingInformation}</p>}
            {(item.documents ?? []).map((doc) => <button key={typeof doc === 'object' ? doc.id : doc} className="mr-3 mt-2 text-xs text-info underline" onClick={() => downloadDocument(typeof doc === 'object' ? doc.id : doc, doc.filename ?? `TWG-support-${index + 1}.pdf`).catch((err) => setActionError(err.response?.data?.message ?? 'Could not download supporting document.'))}>Download supporting document</button>)}
          </div>)}
        </details>)}
      </Card>
    </>}
    {modal?.type === 'twg' && <TwgAssessmentModal bid={modal.bid} assessment={modal.assessment} onClose={() => setModal(null)} onSaved={(status) => { setMessage(status === 'submitted' ? 'TWG technical evaluation successfully submitted. The evaluation is now available for BAC review.' : 'TWG evaluation saved as draft. Complete the assessment before submitting to the BAC.'); refresh() }} />}
    {modal?.type === 'evaluate' && <BidEvaluationModal bid={modal.bid} consulting={consulting} weights={{ qualityWeight: bidData?.qualityWeight ?? selected?.qualityWeight, financialWeight: bidData?.financialWeight ?? selected?.financialWeight }} onClose={() => setModal(null)} onSubmit={(criteria, remarks, verdict) => run(() => biddingApi.submitEvaluation(modal.bid.id, criteria, remarks, verdict), 'BAC evaluation recorded. The Chairperson may close evaluation after all required reviews are complete.')} />}
    {modal?.type === 'postQualification' && <PostQualificationModal bid={modal.bid} onClose={() => setModal(null)} onSubmit={(payload) => run(() => biddingApi.submitPostQualification(modal.bid.id, payload), 'Post-qualification recorded. Compliant bidders may proceed to BAC award recommendation.')} />}
    {(modal?.type === 'close' || modal?.type === 'recommend') && <CommitteeActionModal title={modal.type === 'close' ? 'Close technical evaluation' : 'BAC award recommendation'} description={modal.type === 'close' ? 'Confirm the attending BAC members. This decision closes technical evaluation and calculates the eligible financial ranking.' : 'Confirm BAC participation before forwarding the recommendation for award approval.'} onClose={() => setModal(null)} onSubmit={(payload) => modal.type === 'close' ? run(() => biddingApi.closeEvaluation(selected.id, payload), 'Technical evaluation closed. Review financial ranking and proceed to post-qualification.') : run(() => biddingApi.recommendAward(modal.bid.id, payload), 'BAC award recommendation recorded and forwarded to the approving officer.')} />}
    {(permissions.has('bidding.award') || canChair || permissions.has('bidding.view')) && <AwardQueue version={refreshToken} onChanged={refresh} />}
  </DashboardPage>
}
