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
import { usePagination } from '../../components/ui/usePagination'

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
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)

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
        title="Confirm your bid"
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

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="button"
            disabled={saving || code.length !== 6}
            onClick={() => confirm(code)}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-accent-fg disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <ShieldCheck size={14} /> Confirm and submit sealed bid
              </>
            )}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Bid on ${rfq.referenceNo}`} onClose={onClose}>
      <div className="mb-4 flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
        <Lock size={14} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-xs text-text-secondary">
          Your price is sealed on submission and stays hidden from evaluators until the technical component is
          rated &ldquo;passed&rdquo; (IRR Sec. 58). A bid above the ABC is rated failed.
        </p>
      </div>

      <p className="mb-3 text-[13px] text-text-secondary">
        {rfq.title} — ABC <strong className="text-navy">{peso(rfq.abc)}</strong>
      </p>

      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
        Total bid price (₱)
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

      <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
        The next step emails a 6-digit code to your registered address. Your bid is not submitted until
        you enter it.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <button
          type="button"
          disabled={saving || !price || Number(price) <= 0 || overAbc}
          onClick={requestCode}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-accent-fg disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Sending code…
            </>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </Modal>
  )
}

export default function BidOpportunities() {
  const [rfqs, setRfqs] = useState([])
  const [profile, setProfile] = useState(null)
  const [bidding, setBidding] = useState(null)
  const [notice, setNotice] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([biddingApi.fetchRfqs(), biddingApi.fetchMyVendorProfile()])
      .then(([rfqData, profileData]) => {
        if (cancelled) return
        setRfqs(rfqData)
        setProfile(profileData)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const verified = profile?.canBid

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(rfqs)

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
        {rfqs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            No opportunities are open right now.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Reference', 'Project', 'Mode', 'ABC', 'Closes', 'Status', 'Actions'].map((head) => (
                    <th
                      key={head}
                      className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
                    >
                      {head}
                    </th>
                  ))}
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
                        <button
                          type="button"
                          onClick={() => setBidding(rfq)}
                          className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                        >
                          <Gavel size={12} /> SUBMIT BID
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="opportunities" />
      </Card>

      {bidding && (
        <BidModal
          rfq={bidding}
          onClose={() => setBidding(null)}
          onSubmitted={() => {
            setNotice(`Sealed bid submitted for ${bidding.referenceNo}.`)
            refresh()
          }}
        />
      )}
    </DashboardPage>
  )
}
