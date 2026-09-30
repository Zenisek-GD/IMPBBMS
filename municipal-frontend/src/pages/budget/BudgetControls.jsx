import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, Plus, RefreshCw } from 'lucide-react'
import * as financeApi from '../../api/finance'
import { fetchDocuments } from '../../api/documents'
import { fetchOfficeDirectory } from '../../api/departments'
import { useAuth } from '../../context/useAuth'
import { usePermissions } from '../../context/usePermissions'
import { useActionQueue } from '../../context/useActionQueue'
import useFormRecovery from '../../hooks/useFormRecovery'
import DraftRecoveryNotice from '../../components/ui/DraftRecoveryNotice'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import LargeFormPage from '../../components/ui/LargeFormPage'
import DocumentSlot from '../../components/ui/DocumentSlot'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import { useTableControls } from '../../components/ui/useTableControls'

const KINDS = { allocation: 'Project allocation', transfer: 'Transfer / realignment', closeout: 'Financial closeout', correction: 'Appropriation correction', migration: 'Documented appropriation migration', reenactment: 'Reenacted budget' }
const CLASSES = { contractSavings: 'Contract savings', unusedAppropriation: 'Unused appropriation', cancelledObligation: 'Cancelled obligation', outstandingRetention: 'Outstanding retention', revertedAmount: 'Reverted amount', other: 'Other documented balance' }
const STATUS = { draft: 'neutral', submitted: 'warning', approved: 'success', rejected: 'danger' }
const currency = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value ?? 0))
const yearNow = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date()))
const human = value => String(value ?? '—').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase())
const dateTime = value => value ? new Date(value).toLocaleString('en-PH') : '—'
const requestAmount = request => request.kind === 'reenactment' && request.status !== 'approved' ? (request.payload?.reenactmentLines ?? []).reduce((total, line) => total + Math.round(Number(line.amount || 0) * 100), 0) / 100 : request.amount
const fieldClass = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy'
const METRICS = { allocated: 'Approved allocation', obligated: 'Obligations', grossExpenses: 'Gross expenses', supplierPaid: 'Supplier payments', taxesWithheld: 'Taxes withheld', retention: 'Retention held', unpaid: 'Unpaid obligations', remainingFunds: 'Remaining project funds', recognizedSavings: 'Approved savings' }

function Field({ label, children }) {
  return <label className="block text-sm text-text-secondary">{label}{children}</label>
}

function Position({ position, title }) {
  if (!position) return null
  return <div><h3 className="mb-2 text-sm font-medium text-navy">{title}</h3><dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
    {Object.entries(METRICS).filter(([key]) => position[key] != null).map(([key, label]) => <div key={key}><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 font-medium text-navy">{currency(position[key])}</dd></div>)}
  </dl></div>
}

function RequestedChanges({ request, data }) {
  const payload = request.payload ?? {}
  const confirmations = request.kind === 'closeout' ? { finalAccountsConfirmed: 'Final accounts reconciled', liabilitiesReviewed: 'Outstanding liabilities reviewed', cancelExcessObligations: 'Cancel excess obligations after settlement', reuseAuthorized: 'Authority permits reuse of unused appropriation' } : request.kind === 'transfer' ? { savingsAuthorityConfirmed: 'Authority permits savings augmentation' } : {}
  return <section className="space-y-3"><h3 className="text-sm font-medium">Proposed financial action</h3>
    {['correction', 'migration'].includes(request.kind) && <dl className="grid gap-3 text-sm sm:grid-cols-2">{['title', 'ordinanceNo', 'ordinanceDate', 'type', 'fund', 'expenseClass', 'departmentId', 'papCode', 'uacsCode'].map(key => <div key={key}><dt className="text-xs text-text-secondary">{human(key)}</dt><dd>{human(payload[key])}</dd></div>)}</dl>}
    {request.kind === 'correction' && <p className="text-sm">Current appropriation: {currency(data.appropriations.find(row => Number(row.id) === Number(request.sourceAppropriationId))?.amount)} · Proposed total: {currency(request.amount)}</p>}
    {request.kind === 'reenactment' && <><p className="text-sm">Reviewed recurring income: {currency(payload.recurringIncomeAmount)} · Income review confirmed: {payload.incomeEstimatesReviewed ? 'Yes' : 'No'}</p><ul className="space-y-2 text-sm">{(payload.reenactmentLines ?? []).map(line => <li key={line.sourceAppropriationId}>Prior appropriation #{line.sourceAppropriationId}: {currency(line.amount)} · {human(line.eligibility)}</li>)}</ul></>}
    {Object.entries(confirmations).map(([key, label]) => <p key={key} className="text-sm">{label}: <strong>{payload[key] === true ? 'Yes' : 'No'}</strong></p>)}
    {request.status !== 'approved' && [request.sourceProjectId, request.destinationProjectId].filter(Boolean).map(id => {
      const project = data.projects.find(row => Number(row.id) === Number(id))
      return project && <div key={id} className="space-y-2 rounded border border-border-muted p-3"><Position title={project.projectTitle} position={project.financials} /><p className="text-xs text-text-secondary">{project.departmentName} · {human(project.fund)} · {human(project.expenseClass)} · {human(project.sector)} · Appropriation #{project.appropriationId}</p><p className="text-sm">Approved available for transfer: {currency(project.approvedTransferable)}</p></div>
    })}
  </section>
}

function BudgetActionForm({ existing, defaults, data, fiscalYear, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ kind: existing?.kind ?? defaults?.kind ?? 'allocation', fiscalYear: existing?.fiscalYear ?? defaults?.fiscalYear ?? (fiscalYear === 'all' ? yearNow() : fiscalYear), amount: existing?.amount ?? '',
    sourceProjectId: existing?.sourceProjectId ?? defaults?.sourceProjectId ?? '', destinationProjectId: existing?.destinationProjectId ?? '', sourceAppropriationId: existing?.sourceAppropriationId ?? '',
    classification: existing?.classification ?? 'unusedAppropriation', reason: existing?.reason ?? '', authorityReference: existing?.authorityReference ?? '',
    payload: { type: 'annual', fund: 'generalFund', expenseClass: 'mooe', reenactmentLines: [], ...existing?.payload } }))
  const [departments, setDepartments] = useState([])
  const [options, setOptions] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const recovery = useFormRecovery(`budget-control-${existing?.id ?? 'new'}`, form, setForm)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const payload = (key, value) => setForm(current => ({ ...current, payload: { ...current.payload, [key]: value } }))
  const isProjectAction = ['allocation', 'transfer', 'closeout'].includes(form.kind)
  const isOrdinance = ['correction', 'migration'].includes(form.kind)
  const projects = data.projects.filter(project => Number(project.fiscalYear) === Number(form.fiscalYear))
  const source = projects.find(project => Number(project.id) === Number(form.sourceProjectId))
  const destination = projects.find(project => Number(project.id) === Number(form.destinationProjectId))
  const appropriations = (data.appropriations ?? []).filter(row => Number(row.fiscalYear) === Number(form.fiscalYear))
  const priorLines = (fiscalYear === 'all' ? data.appropriations : data.priorYearAppropriations ?? []).filter(row => Number(row.fiscalYear) === Number(form.fiscalYear) - 1 && row.status === 'enacted' && ['annual', 'supplemental'].includes(row.type))
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchOfficeDirectory(), financeApi.fetchAppropriationOptions()]).then(([offices, values]) => {
      if (!cancelled) { setDepartments(offices); setOptions(values) }
    }).catch(() => { if (!cancelled) setError('Could not load budget classifications. Please reopen the form.') })
    return () => { cancelled = true }
  }, [])
  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      const request = { ...form, amount: Number(form.amount || 0), fiscalYear: Number(form.fiscalYear),
        sourceProjectId: isProjectAction ? form.sourceProjectId || null : null,
        destinationProjectId: form.kind === 'transfer' ? form.destinationProjectId || null : null,
        sourceAppropriationId: form.kind === 'correction' ? form.sourceAppropriationId || null : null,
        classification: form.kind === 'closeout' ? form.classification : null }
      const row = existing ? await financeApi.updateBudgetControl(existing.id, request) : await financeApi.createBudgetControl(request)
      recovery.clearDraft(); onSaved(row)
    } catch (err) { setError(err.response?.data?.message ?? 'Could not save this budget request.') }
    finally { setSaving(false) }
  }
  return <LargeFormPage title={existing ? `Edit budget request #${existing.id}` : 'New budget request'} purpose="Save a draft, attach the supporting documents, then submit it to an independent approving officer. Annual appropriations continue through Budget Preparation."
    onBack={onClose} backLabel="Back to allocations and transfers" error={error}
    actions={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || !form.reason.trim() || !form.authorityReference.trim()} onClick={save}>{saving ? 'Saving…' : 'Save draft'}</Button></>}>
    <DraftRecoveryNotice draft={recovery} />
    <LargeFormPage.Section title="Budget action"><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Action"><select className={fieldClass} disabled={Boolean(existing)} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value, sourceProjectId: '', destinationProjectId: '', sourceAppropriationId: '', amount: '', payload: { type: 'annual', fund: 'generalFund', expenseClass: 'mooe', reenactmentLines: [] } }))}>{Object.entries(KINDS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field>
      <Field label="Fiscal year"><input type="number" min="2000" max="2100" className={fieldClass} value={form.fiscalYear} disabled={fiscalYear !== 'all'} onChange={event => setForm(current => ({ ...current, fiscalYear: Number(event.target.value), sourceProjectId: '', destinationProjectId: '', sourceAppropriationId: '' }))} /></Field>
      {form.kind !== 'reenactment' && <Field label={form.kind === 'correction' ? 'Corrected total appropriation (PHP)' : 'Amount (PHP)'}><input type="number" min={form.kind === 'closeout' ? '0' : '0.01'} step="0.01" className={fieldClass} value={form.amount} onChange={event => set('amount', event.target.value)} /></Field>}
      {form.kind === 'closeout' && <Field label="Balance classification"><select className={fieldClass} value={form.classification} onChange={event => set('classification', event.target.value)}>{Object.entries(CLASSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>}
    </div></LargeFormPage.Section>
    {isProjectAction && <LargeFormPage.Section title={form.kind === 'transfer' ? 'Source and destination' : 'Project and its budget'} description="APP amounts describe the procurement plan. Only an approved allocation reserves project funds.">
      <div className="grid gap-4 sm:grid-cols-2"><Field label={form.kind === 'transfer' ? 'Source project' : 'Project'}><select className={fieldClass} value={form.sourceProjectId} onChange={event => set('sourceProjectId', event.target.value)}><option value="">Select a project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.projectTitle}</option>)}</select></Field>
        {form.kind === 'transfer' && <Field label="Destination project"><select className={fieldClass} value={form.destinationProjectId} onChange={event => set('destinationProjectId', event.target.value)}><option value="">Select a different project</option>{projects.filter(project => Number(project.id) !== Number(form.sourceProjectId)).map(project => <option key={project.id} value={project.id}>{project.projectTitle}</option>)}</select></Field>}
      </div>
      {[source, destination].filter(Boolean).map(project => <div key={project.id} className="mt-4 rounded border border-border-muted p-3"><p className="mb-2 text-sm font-medium">{project.projectTitle}</p><p className="mb-3 text-xs text-text-secondary">Appropriation #{project.appropriationId} · {human(project.fund ?? project.appropriation?.fund)} · {human(project.expenseClass ?? project.appropriation?.expenseClass)} · {human(project.sector)}</p><Position position={project.financials} title="Current financial position" />{project.approvedTransferable != null && <p className="mt-3 text-sm">Approved available for transfer: <strong>{currency(project.approvedTransferable)}</strong></p>}</div>)}
      {form.kind === 'transfer' && <label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={Boolean(form.payload.savingsAuthorityConfirmed)} onChange={event => payload('savingsAuthorityConfirmed', event.target.checked)} />The supporting authority permits this augmentation from approved savings. Both projects meet the permitted fund, category and office rules.</label>}
    </LargeFormPage.Section>}
    {isOrdinance && <LargeFormPage.Section title="Authorized ordinance record" description="Use only for a supported correction or migration of an existing enacted authority. Prepare a new annual budget through Budget Preparation.">
      {form.kind === 'correction' && <Field label="Appropriation to correct"><select className={fieldClass} value={form.sourceAppropriationId} onChange={event => {
        const line = appropriations.find(row => Number(row.id) === Number(event.target.value))
        setForm(current => ({ ...current, sourceAppropriationId: event.target.value, amount: line?.amount ?? '', payload: { ...current.payload, ...Object.fromEntries(['title', 'ordinanceNo', 'ordinanceDate', 'fund', 'expenseClass', 'type', 'departmentId', 'papCode', 'uacsCode', 'remarks'].map(key => [key, line?.[key] ?? ''])) } }))
      }}><option value="">Select an appropriation</option>{appropriations.map(line => <option key={line.id} value={line.id}>{line.ordinanceNo} — {line.title}</option>)}</select></Field>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {['title', 'ordinanceNo', 'ordinanceDate', 'papCode', 'uacsCode'].map(key => <Field key={key} label={human(key)}><input className={fieldClass} type={key === 'ordinanceDate' ? 'date' : 'text'} value={form.payload[key] ?? ''} onChange={event => payload(key, event.target.value)} /></Field>)}
        <Field label="Fund"><select className={fieldClass} value={form.payload.fund} onChange={event => payload('fund', event.target.value)}>{(options.funds ?? []).map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></Field>
        <Field label="Expense class"><select className={fieldClass} value={form.payload.expenseClass} onChange={event => payload('expenseClass', event.target.value)}>{(options.expenseClasses ?? []).map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></Field>
        <Field label="Appropriation type"><select className={fieldClass} value={form.payload.type} onChange={event => payload('type', event.target.value)}>{(options.types ?? ['annual', 'supplemental']).filter(type => type !== 'reenacted').map(type => <option key={type} value={type}>{human(type)}</option>)}</select></Field>
        <Field label="Responsible office"><select className={fieldClass} value={form.payload.departmentId ?? ''} onChange={event => payload('departmentId', event.target.value ? Number(event.target.value) : null)}><option value="">Select an office</option>{departments.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}</select></Field>
      </div>
    </LargeFormPage.Section>}
    {form.kind === 'closeout' && <LargeFormPage.Section title="Final accounts and liabilities" description="An unused balance becomes reusable only after an authorized closeout and a separate approved transfer. Taxes, unpaid obligations and retention remain separately accounted for.">
      <div className="space-y-3">{[['finalAccountsConfirmed', 'Final project accounts have been reconciled against the supporting records.'], ['liabilitiesReviewed', 'Outstanding obligations, invoices, taxes and retention have been reviewed.'], ['cancelExcessObligations', 'Request documented cancellation of excess obligations after final settlement.'], ['reuseAuthorized', 'The supporting authority expressly permits reuse of the unused appropriation.']].map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={Boolean(form.payload[key])} onChange={event => payload(key, event.target.checked)} />{label}</label>)}</div>
    </LargeFormPage.Section>}
    {form.kind === 'reenactment' && <LargeFormPage.Section title="Eligible prior-year expenditures" description="Select only supported existing salaries, statutory or contractual obligations, and essential operating expenses. Each amount is reviewed before approval.">
      <div className="space-y-4"><Field label="Recurring income estimate (PHP)"><input type="number" min="0" step="0.01" className={fieldClass} value={form.payload.recurringIncomeAmount ?? ''} onChange={event => payload('recurringIncomeAmount', Number(event.target.value))} /></Field>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={Boolean(form.payload.incomeEstimatesReviewed)} onChange={event => payload('incomeEstimatesReviewed', event.target.checked)} />The required income estimates and reenactment eligibility have been reviewed.</label>
        {!priorLines.length && <p className="text-sm text-warning">No eligible prior-year appropriations are available. Select the target fiscal year in the register before creating this request.</p>}
        {priorLines.map(line => {
          const chosen = (form.payload.reenactmentLines ?? []).find(row => Number(row.sourceAppropriationId) === Number(line.id))
          const changeLine = patch => payload('reenactmentLines', (form.payload.reenactmentLines ?? []).map(row => Number(row.sourceAppropriationId) === Number(line.id) ? { ...row, ...patch } : row))
          return <div key={line.id} className="rounded border border-border-muted p-3"><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={Boolean(chosen)} onChange={event => payload('reenactmentLines', event.target.checked ? [...(form.payload.reenactmentLines ?? []), { sourceAppropriationId: line.id, amount: Number(line.amount), eligibility: 'essentialOperations' }] : (form.payload.reenactmentLines ?? []).filter(row => Number(row.sourceAppropriationId) !== Number(line.id)))} />{line.title} — {currency(line.amount)}</label>{chosen && <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Eligible amount (PHP)"><input className={fieldClass} type="number" min="0.01" max={line.amount} step="0.01" value={chosen.amount} onChange={event => changeLine({ amount: Number(event.target.value) })} /></Field><Field label="Eligibility"><select className={fieldClass} value={chosen.eligibility} onChange={event => changeLine({ eligibility: event.target.value })}><option value="existingSalaries">Existing salaries</option><option value="statutoryContractual">Statutory / contractual obligation</option><option value="essentialOperations">Essential operating expense</option></select></Field></div>}</div>
        })}
      </div>
    </LargeFormPage.Section>}
    <LargeFormPage.Section title="Reason and authority"><div className="space-y-4"><Field label="Reason for the request"><textarea rows={4} className={fieldClass} value={form.reason} onChange={event => set('reason', event.target.value)} /></Field><Field label="Authority or ordinance reference"><input className={fieldClass} value={form.authorityReference} onChange={event => set('authorityReference', event.target.value)} /></Field><p className="text-xs text-text-secondary">After saving, attach the authority and financial records in the request details. Submitting locks the request and its evidence for review.</p></div></LargeFormPage.Section>
  </LargeFormPage>
}

function RequestDetail({ request, data, onEdit, onChanged }) {
  const { user } = useAuth()
  const permissions = usePermissions()
  const [documents, setDocuments] = useState([])
  const [documentVersion, setDocumentVersion] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState(null)
  const [remarks, setRemarks] = useState('')
  const running = useRef(false)
  const canEdit = request.canEdit ?? (request.status === 'draft' && Number(request.requesterId) === Number(user.id) && permissions.has('budget.requestControl'))
  const canDecide = request.canApprove ?? (request.status === 'submitted' && Number(request.requesterId) !== Number(user.id) && permissions.has('budget.approveControl'))
  const projectName = id => data.projects.find(row => Number(row.id) === Number(id))?.projectTitle ?? (id ? `Project #${id}` : '—')
  useEffect(() => {
    let cancelled = false
    fetchDocuments('budgetControlRequest', request.id).then(rows => { if (!cancelled) setDocuments(rows) }).catch(() => { if (!cancelled) setError('Could not load the supporting documents.') })
    return () => { cancelled = true }
  }, [request.id, documentVersion])
  const act = async action => {
    if (running.current) return
    running.current = true; setBusy(true); setError('')
    try { await financeApi.transitionBudgetControl(request.id, action, remarks); setDecision(null); setRemarks(''); onChanged() }
    catch (err) { setError(err.response?.data?.message ?? 'Could not record this decision.') }
    finally { running.current = false; setBusy(false) }
  }
  return <Card title={`Request #${request.id} — ${KINDS[request.kind]}`} bodyClassName="space-y-5 p-4">
    <div className="flex flex-wrap items-center gap-3"><Badge tone={STATUS[request.status]}>{human(request.status)}</Badge><span className="text-sm">FY {request.fiscalYear} · {currency(requestAmount(request))}</span>{canEdit && <Button variant="secondary" onClick={() => onEdit(request)}>Edit draft</Button>}{canEdit && <Button disabled={busy || documents.length === 0} onClick={() => act('submit')}>{busy ? 'Submitting…' : 'Submit for approval'}</Button>}{canDecide && <><Button disabled={busy} onClick={() => setDecision('approve')}>Review and approve</Button><Button disabled={busy} variant="danger" onClick={() => setDecision('reject')}>Reject request</Button></>}</div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Source project', projectName(request.sourceProjectId)], ['Destination project', projectName(request.destinationProjectId)], ['Source appropriation', request.sourceAppropriationId ? `#${request.sourceAppropriationId}` : '—'], ['Destination appropriation', request.destinationAppropriationId ? `#${request.destinationAppropriationId}` : '—'], ['Fund / expense class', `${human(request.fund)} / ${human(request.expenseClass)}`], ['Sector', human(request.sector)], ['Requested by', request.requesterName ?? `Officer #${request.requesterId}`], ['Submitted', dateTime(request.requestedAt)], ['Decision by', request.approverName ?? '—'], ['Decision date', dateTime(request.approvedAt)], ['Classification', CLASSES[request.classification] ?? '—'], ['Authority', request.authorityReference]].map(([label, value]) => <div key={label}><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 break-words text-navy">{value}</dd></div>)}</dl>
    <div><h3 className="text-sm font-medium">Reason</h3><p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{request.reason}</p>{request.decisionRemarks && <p className="mt-3 text-sm"><strong>Decision basis:</strong> {request.decisionRemarks}</p>}</div>
    <RequestedChanges request={request} data={data} />
    {request.nextAction && <p className="rounded border border-border-muted p-3 text-sm"><strong>Next: </strong>{request.nextAction} · {request.responsibleRole}</p>}
    <section className="space-y-3"><h3 className="text-sm font-medium">Supporting documents</h3>{documents.map(document => <DocumentSlot key={document.id} entityRef="budgetControlRequest" entityId={request.id} docType={document.docType ?? 'budgetAuthority'} label={document.label ?? document.filename} existing={document} disabled onChanged={() => setDocumentVersion(value => value + 1)} />)}{canEdit && <div><p className="mb-2 text-xs text-text-secondary">Attach an authority, ordinance, final account or other supporting record.</p><DocumentSlot entityRef="budgetControlRequest" entityId={request.id} docType="budgetAuthority" label="Budget authority and financial evidence" disabled={busy} onChanged={() => setDocumentVersion(value => value + 1)} /></div>}{!documents.length && !canEdit && <p className="text-sm text-text-secondary">No supporting documents are available.</p>}</section>
    {request.beforeBalances && <section className="space-y-4 border-t border-border-muted pt-4"><h3 className="text-sm font-medium">Permanent approval record</h3><p className="text-xs text-text-secondary">These balances were recorded when the approval took effect.</p>{[['Before', request.beforeBalances], ['After', request.afterBalances]].map(([label, snapshot]) => <div key={label} className="space-y-3 rounded border border-border-muted p-3"><h4 className="text-sm font-semibold">{label}</h4><Position position={snapshot?.source ?? snapshot?.project} title="Source project" /><Position position={snapshot?.destination} title="Destination project" />{['appropriation', 'sourceAppropriation', 'destinationAppropriation'].map(key => snapshot?.[key] && <p key={key} className="text-sm">{human(key)}: {currency(snapshot[key].amount)}{snapshot[key].unallocatedAvailable != null && ` · Available ${currency(snapshot[key].unallocatedAvailable)}`}</p>)}{(snapshot?.appropriations ?? snapshot?.sourceAppropriations ?? []).map(line => <p key={line.id} className="text-sm">Appropriation #{line.id}: {line.title} ? {currency(line.amount)}</p>)}{snapshot?.retainedLiabilities && <p className="text-sm">Retained liabilities: unpaid obligations {currency(snapshot.retainedLiabilities.unpaid)}, retention {currency(snapshot.retainedLiabilities.outstandingRetention)}, taxes {currency(snapshot.retainedLiabilities.taxesAwaitingRemittance)}</p>}{snapshot?.approvedAvailable != null && <p className="text-sm">Approved transferable balance: {currency(snapshot.approvedAvailable)}</p>}</div>)}</section>}
    {decision && <Modal title={decision === 'approve' ? 'Approve documented budget request' : 'Reject budget request'} onClose={() => { if (!busy) setDecision(null) }}><div className="space-y-4"><p className="text-sm text-text-secondary">{decision === 'approve' ? 'Review the authority, supporting evidence and balances. Approval applies the financial action and keeps a permanent audit record.' : 'The request and its evidence will remain in history. A corrected request must be prepared separately.'}</p><Field label="Decision basis"><textarea rows={4} value={remarks} onChange={event => setRemarks(event.target.value)} className={fieldClass} /></Field>{error && <p role="alert" className="text-sm text-danger">{error}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setDecision(null)}>Cancel</Button><Button disabled={busy || remarks.trim().length < 10} variant={decision === 'approve' ? 'primary' : 'danger'} onClick={() => act(decision)}>{busy ? 'Recording…' : decision === 'approve' ? 'Approve request' : 'Reject request'}</Button></div></div></Modal>}
  </Card>
}

export default function BudgetControls() {
  const permissions = usePermissions()
  const queue = useActionQueue()
  const refreshQueue = queue.refresh
  const [search, setSearch] = useSearchParams()
  const [data, setData] = useState({ requests: [], projects: [], allocations: [], appropriations: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const selectedId = Number(search.get('requestId') ?? search.get('request'))
  const selected = data.requests.find(row => Number(row.id) === selectedId)
  const requestedProject = data.projects.find(row => Number(row.id) === Number(search.get('project')))
  const taskAction = permissions.has('budget.requestControl') && ['allocation', 'closeout'].includes(search.get('action')) && requestedProject && { kind: search.get('action'), sourceProjectId: requestedProject.id, fiscalYear: requestedProject.fiscalYear }
  const refresh = useCallback(() => { setVersion(value => value + 1); refreshQueue() }, [refreshQueue])
  useEffect(() => {
    let cancelled = false
    financeApi.fetchBudgetControls({ fiscalYear: queue.fiscalYear }).then(result => { if (!cancelled) { setData(result); setError(''); setLoading(false) } }).catch(err => { if (!cancelled) { setError(err.response?.data?.message ?? 'Could not load budget requests.'); setData({ fiscalYear: queue.fiscalYear, requests: [], projects: [], allocations: [], appropriations: [] }); setLoading(false) } })
    return () => { cancelled = true }
  }, [queue.fiscalYear, version])
  const table = useTableControls(data.requests, { searchKeys: ['id', 'reason', 'authorityReference', 'requesterName'], filters: [{ key: 'status', label: 'All statuses', options: Object.keys(STATUS).map(value => ({ value, label: human(value) })) }], pageSize: 10 })
  const select = id => setSearch(id ? { requestId: String(id) } : {})
  const saved = row => { setCreating(false); setEditing(null); select(row.id); refresh() }
  const years = [...new Set([yearNow() - 2, yearNow() - 1, yearNow(), yearNow() + 1, yearNow() + 2, ...data.requests.map(row => row.fiscalYear), ...(queue.fiscalYear === 'all' ? [] : [queue.fiscalYear])])].sort((a, b) => b - a)
  if (creating || editing || taskAction) return <DashboardPage><BudgetActionForm key={editing?.id ?? taskAction?.sourceProjectId ?? 'new'} existing={editing} defaults={taskAction} data={data} fiscalYear={queue.fiscalYear} onClose={() => { setCreating(false); setEditing(null); select(null) }} onSaved={saved} /></DashboardPage>
  return <DashboardPage><PageHeader title="Allocations, closeout and transfers" subtitle="Reserve project funds, document final balances, and review authorized budget changes." actions={permissions.has('budget.requestControl') && <Button icon={Plus} onClick={() => setCreating(true)}>New budget request</Button>} />
    <div className="flex flex-wrap items-end gap-3"><Field label="Fiscal year"><select className={fieldClass} value={queue.fiscalYear} onChange={event => { queue.setFiscalYear(event.target.value === 'all' ? 'all' : Number(event.target.value)); select(null) }}>{years.map(year => <option key={year} value={year}>{year}</option>)}<option value="all">All fiscal years</option></select></Field><Button variant="secondary" icon={RefreshCw} onClick={refresh}>Refresh</Button><Link className="text-sm text-accent underline" to="/budget/preparation">Annual budget preparation</Link><Link className="text-sm text-accent underline" to="/budget/appropriations">Appropriation ledger</Link></div>
    {error && <p role="alert" className="rounded border border-danger/30 p-3 text-sm text-danger">{error}</p>}
    {loading || data.fiscalYear !== queue.fiscalYear ? <p role="status">Loading budget records…</p> : <>
      <Card title="Budget requests" icon={ArrowLeftRight} bodyClassName="p-4"><TableToolbar {...table.toolbarProps} searchPlaceholder="Search request, reason or authority…" /><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Request', 'Action', 'Amount', 'Status', 'Responsible officer', ''].map(label => <th key={label} className="p-3 font-medium text-text-secondary">{label}</th>)}</tr></thead><tbody>{table.pageRows.map(row => <tr key={row.id} className="border-t border-border-muted"><td className="p-3">#{row.id}<span className="block text-xs text-text-secondary">FY {row.fiscalYear}</span></td><td className="p-3">{KINDS[row.kind]}</td><td className="p-3 whitespace-nowrap">{currency(requestAmount(row))}</td><td className="p-3"><Badge tone={STATUS[row.status]}>{human(row.status)}</Badge></td><td className="p-3 text-xs">{row.responsibleRole ?? row.approverName ?? 'Completed'}</td><td className="p-3"><Button size="table" variant="secondary" onClick={() => select(row.id)}>View request</Button></td></tr>)}{!table.rows.length && <tr><td colSpan={6} className="p-5 text-text-secondary">No requests match this fiscal year or filter.</td></tr>}</tbody></table></div><Pagination {...table.paginationProps} /></Card>
      {selected && <RequestDetail key={selected.id} request={selected} data={data} onEdit={setEditing} onChanged={refresh} />}
      <Card title="Project funds" bodyClassName="space-y-4 p-4"><p className="text-sm text-text-secondary">A planned procurement amount does not reserve budget. Unused amounts remain unclassified until an approved financial closeout.</p>{data.projects.map(project => <details key={project.id} className="rounded border border-border-muted p-3"><summary className="cursor-pointer text-sm font-medium">{project.projectTitle} · FY {project.fiscalYear}</summary><div className="mt-4 space-y-3"><Position position={project.financials} title="Financial position" /><p className="text-sm">Approved available for transfer: {currency(project.approvedTransferable)}</p></div></details>)}{!data.projects.length && <p className="text-sm text-text-secondary">No final approved procurement projects are available for this year.</p>}</Card>
    </>}
  </DashboardPage>
}
