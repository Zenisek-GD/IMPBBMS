import { useEffect, useState } from 'react'
import { APP_STATUS_LABELS, fetchAppEvidence, updateAppEvidence } from '../../api/appEntries'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

const field = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy'
const evidenceStatuses = ['Reported / unverified', 'Pending', 'Not Available']
const walkthroughSourceLabels = {
  planning: ['Approved Budget for the Contract', 'Recommended Procurement Mode', 'Appropriation Reference for Final APP'],
  requisition: ['Purchase Requisition Purpose', 'Item Description', 'Technical Specifications'],
  solicitation: ['Solicitation Title', 'Closing Date', 'Bid Opening Date', 'Pre-Bid Conference'],
  supplier: ['Registered Business Name', 'Award Recommended Supplier', 'Signed Quotation or Bid Document'],
  evaluation: ['Overall Result', 'Findings', 'Post-Qualification Overall Result'],
  award: ['BAC Resolution Number', 'Existing Notice of Award Number', 'Notice of Award Date', 'Supplier Receipt Date'],
}

function EvidenceForm({ entryId, stage, saved, canEdit, onSaved, acceptsClientConfirmation = false }) {
  const reported = stage.key === 'reported-status'
  const [primary, setPrimary] = useState(saved?.[reported ? 'value' : 'status'] ?? '')
  const [detail, setDetail] = useState(saved?.[reported ? 'source' : 'note'] ?? '')
  const [source, setSource] = useState(saved?.source ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const options = [...evidenceStatuses, ...(stage.allowNotApplicable ? ['Not Applicable', 'None'] : []), ...(acceptsClientConfirmation ? ['Client-confirmed'] : [])]
  const confirmed = primary === 'Client-confirmed'
  const attribution = saved?.recordedAt && <p className="mt-1 text-xs text-text-secondary">Recorded by {saved.recordedBy} on {new Date(saved.recordedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} Philippine time. Source {saved.source}.</p>

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await updateAppEvidence(entryId, stage.key, reported ? { value: primary, source: detail } : { status: primary, note: detail, ...(confirmed ? { source } : {}) })
      onSaved(data)
      setMessage('Worksheet entry saved.')
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not save the worksheet entry.')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) return <div className="mt-2 text-sm text-text-secondary"><p>{primary || 'No worksheet entry'}</p>{detail && <p className="mt-1 whitespace-pre-wrap">{detail}</p>}{attribution}</div>

  return <form onSubmit={save} className="mt-3 space-y-3">
    {reported
      ? <label className="block text-sm">Client-reported status<input className={field} maxLength={200} value={primary} onChange={(event) => setPrimary(event.target.value)} /></label>
      : <label className="block text-sm">Evidence status<select className={field} value={primary} onChange={(event) => setPrimary(event.target.value)}><option value="">Unrecorded</option>{options.map((status) => <option key={status}>{status}</option>)}</select></label>}
    <label className="block text-sm">{reported ? 'Source reference' : confirmed ? 'Client-confirmed field and value' : 'Evidence or missing information'}
      <textarea className={field} rows={2} maxLength={reported ? 500 : 4000} value={detail} onChange={(event) => setDetail(event.target.value)} />
    </label>
    {confirmed && <label className="block text-sm">Client confirmation reference
      <input className={field} maxLength={500} required value={source} onChange={(event) => setSource(event.target.value)} />
    </label>}
    {attribution}
    <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Save worksheet entry'}</Button>
    {message && <p role="status" className="text-sm text-success">{message}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </form>
}

export default function ProcurementEvidence({ entryId, canEdit, sourceFields = [] }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState(null)
  useEffect(() => {
    let active = true
    fetchAppEvidence(entryId).then((result) => {
      if (!Array.isArray(result?.stages) || !result.entries) throw new Error('Invalid procurement worksheet')
      if (active) setData(result)
    })
      .catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load the procurement worksheet.') })
    return () => { active = false }
  }, [entryId])

  if (error) return <Card bodyClassName="p-5"><p role="alert" className="text-sm text-danger">{error}</p></Card>
  if (!data) return <Card bodyClassName="p-5"><p role="status">Loading procurement evidence…</p></Card>

  const reported = data.entries['reported-status']
  const walkthroughStages = data.stages.filter((stage) => stage.key !== 'contacts')
  const current = step == null ? null : walkthroughStages[step]
  const currentSourceFields = current ? sourceFields.filter(({ label }) => walkthroughSourceLabels[current.key]?.includes(label)) : []
  const sourceFund = sourceFields.find(({ label }) => label === 'Fund Source')?.value
  const sourceExpense = sourceFields.find(({ label }) => label === 'Expense Class')?.value
  const fundingConflict = data.acceptsClientConfirmation && sourceFund?.includes('MOOE') && sourceExpense === 'Capital Outlay'
  return <Card bodyClassName="p-5">
    <section aria-labelledby="procurement-evidence-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="procurement-evidence-title" className="text-lg font-semibold text-navy">Procurement evidence</h2>
          <p className="mt-1 text-sm text-text-secondary">Plan workflow status: {APP_STATUS_LABELS[data.officialStatus] ?? data.officialStatus}</p>
        </div>
        <Button variant="secondary" onClick={() => setStep(current ? null : 0)}>{current ? 'Exit walkthrough' : 'Start historical walkthrough'}</Button>
      </div>
      {data.sourceStatus && <p className="text-sm text-text-secondary">Imported client status: <strong>{data.sourceStatus}</strong>{data.sourceReference && ` (${data.sourceReference})`}. Supporting records may still need verification.</p>}
      {data.hasRecoveryHold && <p className="text-sm text-warning">The original planning and funding approvals still need verification.</p>}
      {data.supplierMismatch && <p className="text-sm text-warning">The source names different suppliers for bidding and award. Confirm the legal identity using the original documents.</p>}
      {fundingConflict && <p className="text-sm text-warning">The client form lists {sourceFund} as the fund source and {sourceExpense} as the expense class. The appropriation classification needs confirmation.</p>}
      {data.hasHistoricalCompletionScenario && <p className="text-sm text-text-secondary">The client form ends at receipt of the Notice of Award. Contract, delivery and payment evidence is unavailable.</p>}
      {current ? <section aria-label="Historical walkthrough" className="space-y-3 rounded border border-border-muted p-4">
        <p className="text-sm font-semibold text-navy">Historical walkthrough · read only</p>
        <p className="text-sm text-text-secondary">Use these steps to review the lifecycle in one session. Navigating this walkthrough records no dates, approvals or transactions.</p>
        <h3 className="font-semibold text-navy">{step + 1} of {walkthroughStages.length} · {current.label}</h3>
        <p className="text-sm text-text-secondary">System screen: {current.screen}</p>
        <p className="text-sm">{current.requirement}</p>
        {currentSourceFields.length > 0 && <div className="space-y-2">
          <h4 className="text-sm font-semibold text-navy">Client form excerpts</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            {currentSourceFields.map(({ label, value }) => <div key={label} className="min-w-0 rounded border border-border-muted p-2">
              <dt className="text-xs font-medium text-text-secondary">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</dd>
            </div>)}
          </dl>
        </div>}
        <p className="text-sm text-text-secondary">{data.entries[current.key]?.status ?? 'No worksheet entry'}</p>
        {data.entries[current.key]?.note && <p className="whitespace-pre-wrap text-sm">{data.entries[current.key].note}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Previous stage</Button>
          <Button size="sm" onClick={() => setStep(step + 1 < walkthroughStages.length ? step + 1 : null)}>{step + 1 < walkthroughStages.length ? 'Next stage' : 'Finish walkthrough'}</Button>
        </div>
      </section> : <>
        <details className="rounded border border-border-muted p-4">
          <summary className="cursor-pointer font-medium text-navy">Client-reported status{reported?.value ? ` · ${reported.value}` : ''}</summary>
          <p className="mt-2 text-sm text-text-secondary">Record the wording from the client and where it appears. This entry is a source claim awaiting verification.</p>
          <EvidenceForm entryId={entryId} stage={{ key: 'reported-status' }} saved={reported} canEdit={canEdit} onSaved={setData} />
        </details>
        {data.stages.map((stage) => <details key={stage.key} className="rounded border border-border-muted p-4">
          <summary className="cursor-pointer font-medium text-navy">{stage.label}<span className="ml-2 text-sm font-normal text-text-secondary">{data.entries[stage.key]?.status ?? 'Unrecorded'}</span></summary>
          <p className="mt-2 text-sm text-text-secondary">{stage.requirement}</p>
          {stage.key === 'supplier' && data.conflictingSupplierNames && <dl className="mt-2 space-y-1 text-sm text-text-secondary">
            <div><dt className="inline font-medium">Registered supplier</dt> <dd className="inline">{data.conflictingSupplierNames.registered ?? 'Not available'}</dd></div>
            <div><dt className="inline font-medium">Recommended supplier</dt> <dd className="inline">{data.conflictingSupplierNames.recommended ?? 'Not available'}</dd></div>
          </dl>}
          <EvidenceForm entryId={entryId} stage={stage} saved={data.entries[stage.key]} canEdit={canEdit} onSaved={setData} acceptsClientConfirmation={data.acceptsClientConfirmation} />
        </details>)}
      </>}
    </section>
  </Card>
}
