import { useEffect, useState, useCallback } from 'react'
import { Inbox, Gavel, Lock, AlertTriangle, Mail, ShieldCheck, Loader2 } from 'lucide-react'
import * as biddingApi from '../../api/bidding'
import { RFQ_STATUS_LABELS, RFQ_STATUS_TONES } from '../../api/bidding'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import OtpInput from '../../components/ui/OtpInput'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import EmptyState from '../../components/ui/EmptyState'
import { useTableControls } from '../../components/ui/useTableControls'
import { downloadDocument } from '../../api/documents'

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

// ─────────────────────────────────────────────────────────────────────────────
// Submitting a bid is a two-step act (workflow requirement 14): enter the price,
// then confirm with a code emailed to the accredited address.
//
// The step-up exists because a bid is irrevocable — there is no edit path, and the
// price binds the bidder if they win. A session left open on a shared machine
// should not be enough to commit a company to a tender, and the code proves whoever
// is at the keyboard can also read the company's official mailbox.
// ─────────────────────────────────────────────────────────────────────────────
function BidModal({ rfq, onClose, onSubmitted }) {
  const [step, setStep] = useState('price')
  const [price, setPrice] = useState('')
  const [technicalOffer, setTechnicalOffer] = useState(null)
  const [eligibilityEvidence, setEligibilityEvidence] = useState(null)
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const isSmallValue = rfq.modeKey === 'smallValueProcurement'

  const overAbc = price !== '' && Number(price) > Number(rfq.abc)

  const requestCode = async () => {
    setError('')
    setSaving(true)
    try {
      const data = await biddingApi.requestBidCode(rfq.id)
      setChallenge(data.challenge)
      setCode('')
      setCodeError('')
      setStep('confirm')
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not send a confirmation code.')
    } finally {
      setSaving(false)
    }
  }

  const resend = async () => {
    setResending(true)
    setCodeError('')
    try {
      const data = await biddingApi.requestBidCode(rfq.id)
      setChallenge(data.challenge)
      setCode('')
    } catch (err) {
      setCodeError(err.response?.data?.message ?? 'Could not send a new code.')
    } finally {
      setResending(false)
    }
  }

  const confirm = async (submitted) => {
    if (submitted.length !== 6 || saving) return
    setSaving(true)
    setCodeError('')
    try {
      const verified = await biddingApi.verifyBidCode(rfq.id, challenge.reference, submitted)
      await biddingApi.submitBid(rfq.id, {
        totalBidPrice: Number(price),
        reference: verified.reference,
        ticket: verified.ticket,
        ...(isSmallValue ? { technicalOffer, ...(eligibilityEvidence ? { eligibilityEvidence } : {}) } : {}),
      })
      onSubmitted()
      onClose()
    } catch (err) {
      setCode('')
      setCodeError(err.response?.data?.message ?? 'Could not submit the bid.')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'confirm') {
    return (
      <Modal
        title={isSmallValue ? 'Confirm your quotation' : 'Confirm your bid'}
        subtitle="A bid cannot be edited or withdrawn once accepted."
        onClose={onClose}
      >
        <div className="mb-4 rounded-md border border-border-muted bg-chip px-3 py-2.5">
          <p className="text-[11px] tracking-[0.04em] text-text-faint uppercase">You are bidding</p>
          <p className="mt-0.5 text-[17px] font-semibold text-navy">{peso(price)}</p>
          <p className="mt-0.5 text-[11.5px] text-text-faint">
            {rfq.referenceNo} · ABC {peso(rfq.abc)}
          </p>
        </div>

        <p className="mb-4 flex items-start gap-2 rounded-md border border-border-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-text-secondary">
          <Mail size={14} className="mt-0.5 shrink-0" />
          <span>
            Enter the 6-digit code we sent to{' '}
            <span className="font-medium text-navy">{challenge?.sentTo}</span>. It expires in{' '}
            {challenge?.expiresInMinutes ?? 5} minutes.
          </span>
        </p>

        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={confirm}
          disabled={saving}
          error={codeError}
        />

        <div className="mt-3 flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={resend}
            disabled={resending || saving}
            className="font-medium text-navy hover:underline disabled:opacity-60"
          >
            {resending ? 'Sending…' : 'Send a new code'}
          </button>
          <button
            type="button"
            onClick={() => setStep('price')}
            className="text-text-secondary hover:text-navy hover:underline"
          >
            ← Change my price
          </button>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="button"
            disabled={saving || code.length !== 6}
            onClick={() => confirm(code)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-[12px] font-medium text-accent-fg disabled:opacity-50 sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <ShieldCheck size={14} /> {isSmallValue ? 'Confirm and submit quotation' : 'Confirm and submit sealed bid'}
              </>
            )}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`${isSmallValue ? 'Quote for' : 'Bid on'} ${rfq.referenceNo}`} onClose={onClose}>
      <div className="mb-4 flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
        <Lock size={14} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-xs text-text-secondary">
          {isSmallValue
            ? 'Your quotation and price will be available to the committee after the recorded opening. Attach the offer you are making for these exact RFQ terms.'
            : <>Your price is sealed on submission and stays hidden from evaluators until the technical component is rated &ldquo;passed&rdquo; (IRR Sec. 58). A bid above the ABC is rated failed.</>}
        </p>
      </div>

      <p className="mb-3 text-[13px] text-text-secondary">
        {rfq.title} — ABC <strong className="text-navy">{peso(rfq.abc)}</strong>
      </p>

      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
        {isSmallValue ? 'Total quoted price' : 'Total bid price'} (₱)
      </label>
      <input
        type="number"
        step="0.01"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        className={`w-full rounded border px-4 py-2 text-sm text-navy focus:outline-none ${
          overAbc ? 'border-danger' : 'border-border-muted focus:border-navy'
        }`}
      />
      {overAbc && (
        <p className="mt-1 flex items-center gap-1 text-xs text-danger">
          <AlertTriangle size={12} /> This exceeds the ABC and would be rated failed.
        </p>
      )}

      {isSmallValue && <div className="mt-4 space-y-3 rounded border border-border-muted p-3">
        <div><p className="text-xs font-semibold text-navy">RFQ technical specifications and terms</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">{rfq.svpTechnicalSpecifications}</p></div>
        <label className="block text-xs font-medium text-text-secondary">Signed quotation and technical offer (PDF, PNG or JPEG)
          <input required type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setTechnicalOffer(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
        </label>
        <label className="block text-xs font-medium text-text-secondary">Eligibility document bundle {rfq.svpEligibilityDueStage === 'offer' ? '(required with quotation)' : '(may be supplied at the specified later stage)'}
          <input required={rfq.svpEligibilityDueStage === 'offer'} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setEligibilityEvidence(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
        </label>
        <p className="text-xs text-text-faint">Accepted files are locked to this quotation with a submission time and SHA-256 checksum.</p>
      </div>}

      <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
        The next step emails a 6-digit code to your registered address. Your bid is not submitted until
        you enter it.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
          Cancel
        </Button>
        <button
          type="button"
          disabled={saving || !price || Number(price) <= 0 || overAbc || (isSmallValue && (!technicalOffer || (rfq.svpEligibilityDueStage === 'offer' && !eligibilityEvidence)))}
          onClick={requestCode}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-[12px] font-medium text-accent-fg disabled:opacity-60 sm:w-auto"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Sending code…
            </>
          ) : (
            'Send verification code'
          )}
        </button>
      </div>
    </Modal>
  )
}

function EligibilityEvidenceModal({ quotation, onClose, onSubmitted }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return <Modal title={`Eligibility evidence — ${quotation.referenceNo}`} onClose={onClose}>
    <p className="mb-3 text-sm text-text-secondary">Submit the documents required by this RFQ as one PDF or image bundle. The file and its submission time will be locked to your quotation.</p>
    <label className="block text-sm font-medium text-navy">Eligibility documents
      <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs" />
    </label>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!file || saving} onClick={async () => {
      setSaving(true); setError('')
      try { await biddingApi.uploadEligibilityEvidence(quotation.id, file); onSubmitted(); onClose() }
      catch (err) { setError(err.response?.data?.message ?? 'The evidence could not be submitted.') }
      finally { setSaving(false) }
    }}>{saving ? 'Submitting…' : 'Submit evidence'}</Button></div>
  </Modal>
}

export default function BidOpportunities() {
  const [rfqs, setRfqs] = useState([])
  const [myQuotations, setMyQuotations] = useState([])
  const [profile, setProfile] = useState(null)
  const [bidding, setBidding] = useState(null)
  const [eligibilityFor, setEligibilityFor] = useState(null)
  const [notice, setNotice] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([biddingApi.fetchRfqs(), biddingApi.fetchMyVendorProfile(), biddingApi.fetchMyQuotations()])
      .then(([rfqData, profileData, quotationData]) => {
        if (cancelled) return
        setRfqs(rfqData)
        setProfile(profileData)
        setMyQuotations(quotationData)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const verified = profile?.canBid

  // A supplier's first question is what closes soonest, so that is the default
  // order rather than whatever the API returned.
  const table = useTableControls(rfqs, {
    searchKeys: ['referenceNo', 'title', 'modeName'],
    filters: [
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(RFQ_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
      { key: 'modeName', label: 'All modes' },
    ],
    accessors: {
      abc: (rfq) => Number(rfq.abc ?? 0),
      status: (rfq) => RFQ_STATUS_LABELS[rfq.status] ?? rfq.status,
    },
    initialSort: { key: 'closingDate', direction: 'asc' },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title="Bid Opportunities"
        subtitle="Published RFQ/ITB you may respond to."
      />

      {!verified && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[13px] text-text-secondary">
            Your vendor registration must be verified by the BAC Secretariat before you can submit a bid.
            {profile ? ` Current status: ${profile.registrationStatus}.` : ' You have not registered yet.'}
          </p>
        </div>
      )}

      {notice && (
        <p className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{notice}</p>
      )}

      <Card title="Open Procurements" icon={Inbox} bodyClassName="">
        {rfqs.length > 0 && (
          <div className="border-b border-border-muted p-4">
            <TableToolbar {...table.toolbarProps} searchPlaceholder="Search reference, project or mode…" />
          </div>
        )}
        {table.rows.length === 0 ? (
          <EmptyState
            title={table.totalBeforeFilters === 0 ? 'No opportunities are open right now' : 'No opportunities match these filters'}
            description={table.totalBeforeFilters === 0 ? 'Check back when the municipality publishes its next opportunity.' : 'Try clearing a filter or changing your search.'}
            action={table.totalBeforeFilters > 0 && (
              <Button variant="secondary" size="sm" onClick={table.toolbarProps.onReset}>Clear filters</Button>
            )}
          />
        ) : (
          <>
            <div className="divide-y divide-border-muted md:hidden">
              {pageRows.map((rfq) => (
                <article key={rfq.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium tracking-[0.04em] text-text-faint uppercase">{rfq.referenceNo}</p>
                      <h3 className="mt-1 text-sm font-semibold leading-snug text-navy">{rfq.title}</h3>
                    </div>
                    <Badge tone={RFQ_STATUS_TONES[rfq.status]}>{RFQ_STATUS_LABELS[rfq.status]}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                    <div>
                      <dt className="text-text-faint">Mode</dt>
                      <dd className="mt-0.5 font-medium text-text-secondary">{rfq.modeName}</dd>
                    </div>
                    <div>
                      <dt className="text-text-faint">Approved budget</dt>
                      <dd className="mt-0.5 font-medium text-navy">{peso(rfq.abc)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-text-faint">Closes</dt>
                      <dd className="mt-0.5 font-medium text-text-secondary">{new Date(rfq.closingDate).toLocaleString()}</dd>
                    </div>
                  </dl>
                  {rfq.status === 'published' && verified && (
                    <Button className="mt-4 w-full" size="md" icon={Gavel} onClick={() => setBidding(rfq)}>
                      {rfq.modeKey === 'smallValueProcurement' ? 'Submit quotation' : 'Submit bid'}
                    </Button>
                  )}
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('referenceNo')}>Reference</SortableTh>
                  <SortableTh {...table.sortProps('title')}>Project</SortableTh>
                  <SortableTh {...table.sortProps('modeName')}>Mode</SortableTh>
                  <SortableTh {...table.sortProps('abc')}>ABC</SortableTh>
                  <SortableTh {...table.sortProps('closingDate')}>Closes</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((rfq) => (
                  <tr key={rfq.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">{rfq.referenceNo}</td>
                    <td className="px-4 py-3 text-[13px] text-navy">{rfq.title}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{rfq.modeName}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">{peso(rfq.abc)}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {new Date(rfq.closingDate).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={RFQ_STATUS_TONES[rfq.status]}>{RFQ_STATUS_LABELS[rfq.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {rfq.status === 'published' && verified && (
                        <Button
                          size="table"
                          icon={Gavel}
                          onClick={() => setBidding(rfq)}
                        >
                          {rfq.modeKey === 'smallValueProcurement' ? 'Submit quotation' : 'Submit bid'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}
        <Pagination {...paginationProps} label="opportunities" />
      </Card>

      {myQuotations.length > 0 && <Card title="My submitted quotations" bodyClassName="">
        <div className="divide-y divide-border-muted">{myQuotations.map((quotation) => {
          const hasEligibility = quotation.evidence.some((document) => document.docType === 'svpEligibilityEvidence')
          const maySubmitEligibility = !hasEligibility && ((quotation.eligibilityDueStage === 'evaluation' && quotation.rfqStatus === 'opened') || (quotation.eligibilityDueStage === 'beforeAward' && (quotation.rfqStatus === 'opened' || (quotation.rfqStatus === 'evaluated' && quotation.bidStatus === 'technicalPassed'))))
          return <div key={quotation.id} className="space-y-2 p-4">
            <p className="text-sm font-semibold text-navy">{quotation.referenceNo} — {quotation.title}</p>
            <p className="text-xs text-text-secondary">Quoted {peso(quotation.totalBidPrice)} · submitted {new Date(quotation.submittedAt).toLocaleString('en-PH')}</p>
            <div className="flex flex-wrap gap-3">{quotation.evidence.map((document) => <button key={document.id} type="button" className="text-xs text-info underline" onClick={() => downloadDocument(document.id, document.filename).catch(() => setNotice('Could not download the submitted evidence.'))}>{document.docType === 'svpTechnicalOffer' ? 'Technical offer' : 'Eligibility evidence'} · {document.filename}</button>)}</div>
            <p className="text-xs text-text-faint">Eligibility documents due: {quotation.eligibilityDueStage === 'offer' ? 'with quotation' : quotation.eligibilityDueStage === 'evaluation' ? 'during evaluation' : 'before award notice'}. {hasEligibility ? 'Submitted and locked.' : 'Not yet submitted.'}</p>
            {maySubmitEligibility && <Button size="sm" onClick={() => setEligibilityFor(quotation)}>Submit eligibility evidence</Button>}
          </div>
        })}</div>
      </Card>}

      {bidding && (
        <BidModal
          rfq={bidding}
          onClose={() => setBidding(null)}
          onSubmitted={() => {
            setNotice(`${bidding.modeKey === 'smallValueProcurement' ? 'Quotation' : 'Sealed bid'} submitted for ${bidding.referenceNo}.`)
            refresh()
          }}
        />
      )}
      {eligibilityFor && <EligibilityEvidenceModal quotation={eligibilityFor} onClose={() => setEligibilityFor(null)} onSubmitted={() => { setNotice(`Eligibility evidence submitted for ${eligibilityFor.referenceNo}.`); refresh() }} />}
    </DashboardPage>
  )
}
