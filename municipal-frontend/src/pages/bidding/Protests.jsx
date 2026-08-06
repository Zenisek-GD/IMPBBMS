import { useEffect, useState } from 'react'
import { Scale, AlertTriangle } from 'lucide-react'
import * as protestsApi from '../../api/protests'
import {
  PROTEST_STAGE_LABELS,
  PROTEST_STATUS_LABELS,
  PROTEST_STATUS_TONES,
  RECONSIDERATION_DECISION_DAYS,
  PROTEST_DECISION_DAYS,
  protestFeeFor,
} from '../../api/protests'
import * as biddingApi from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

const peso = (value) => `₱${Number(value ?? 0).toLocaleString('en-PH')}`
const dateOnly = (value) => (value ? new Date(value).toLocaleDateString() : '—')

// ── Stage 1: the bidder's request for reconsideration (Sec. 83.1) ────────────
function ReconsiderationModal({ rfqs, onClose, onDone }) {
  const [rfqId, setRfqId] = useState('')
  const [challengedDecision, setDecision] = useState('')
  const [notifiedAt, setNotifiedAt] = useState('')
  const [grounds, setGrounds] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Modal title="File a request for reconsideration" onClose={onClose}>
      <p className="mb-3 rounded border border-border-muted bg-surface-muted px-3 py-2 text-xs text-text-secondary">
        Sec. 83.1 — filed with the BAC within <strong>3 calendar days</strong> of notice of the
        decision. The BAC decides within {RECONSIDERATION_DECISION_DAYS} days. A protest to the Mayor
        is only available if this is denied.
      </p>

      <label className="mb-1 block text-xs font-medium text-text-secondary">Procurement</label>
      <select
        value={rfqId}
        onChange={(e) => setRfqId(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      >
        <option value="">Select…</option>
        {rfqs.map((rfq) => (
          <option key={rfq.id} value={rfq.id}>
            {rfq.referenceNo} — {rfq.title}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        Which decision of the BAC are you challenging?
      </label>
      <input
        value={challengedDecision}
        onChange={(e) => setDecision(e.target.value)}
        placeholder="e.g. Declaration of ineligibility at post-qualification"
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        Date you were notified of it
      </label>
      <input
        type="date"
        value={notifiedAt}
        onChange={(e) => setNotifiedAt(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      <label className="mb-1 block text-xs font-medium text-text-secondary">Grounds</label>
      <textarea
        rows={4}
        value={grounds}
        onChange={(e) => setGrounds(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <Button
          disabled={busy || !rfqId || !challengedDecision.trim() || !notifiedAt || !grounds.trim()}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await protestsApi.fileReconsideration(rfqId, {
                challengedDecision,
                notifiedAt: new Date(notifiedAt).toISOString(),
                grounds,
              })
              onDone()
            } catch (err) {
              setError(err?.response?.data?.message ?? 'Could not file the request.')
            } finally {
              setBusy(false)
            }
          }}
        >
          FILE REQUEST
        </Button>
      </div>
    </Modal>
  )
}

// ── Stage 2: the protest to the HoPE (Sec. 83.2–83.3) ───────────────────────
function ProtestModal({ reconsideration, onClose, onDone }) {
  const [grounds, setGrounds] = useState('')
  const [verified, setVerified] = useState(false)
  const [noForumShopping, setNoForumShopping] = useState(false)
  const [protestFeeReference, setFeeRef] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fee = protestFeeFor(reconsideration.abc)

  return (
    <Modal title="Protest to the Head of the Procuring Entity" onClose={onClose}>
      <p className="mb-3 rounded border border-border-muted bg-surface-muted px-3 py-2 text-xs text-text-secondary">
        Sec. 83.2 — filed within <strong>7 calendar days</strong> of the BAC&rsquo;s denial, as a
        verified position paper with a non-refundable fee of <strong>{peso(fee)}</strong>. The Mayor
        resolves it within {PROTEST_DECISION_DAYS} days. Sec. 85: court action is available only
        after this has run.
      </p>

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        Factual and legal bases
      </label>
      <textarea
        rows={5}
        value={grounds}
        onChange={(e) => setGrounds(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      <label className="mb-2 flex items-start gap-2 text-sm text-navy">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
          className="mt-1"
        />
        <span>
          This position paper is <strong>verified by affidavit</strong>. Sec. 83.3: an unverified
          paper produces no legal effect and is dismissed outright.
        </span>
      </label>

      <label className="mb-3 flex items-start gap-2 text-sm text-navy">
        <input
          type="checkbox"
          checked={noForumShopping}
          onChange={(e) => setNoForumShopping(e.target.checked)}
          className="mt-1"
        />
        <span>
          I certify under oath that no action or claim involving the same issues is pending in any
          court, tribunal or quasi-judicial agency.
        </span>
      </label>

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        Official receipt / payment reference for the {peso(fee)} protest fee
      </label>
      <input
        value={protestFeeReference}
        onChange={(e) => setFeeRef(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <Button
          disabled={busy || !grounds.trim() || !verified || !noForumShopping || !protestFeeReference.trim()}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await protestsApi.fileProtest({
                reconsiderationId: reconsideration.id,
                grounds,
                verifiedByAffidavit: verified,
                noForumShoppingCertified: noForumShopping,
                protestFeeReference,
              })
              onDone()
            } catch (err) {
              setError(err?.response?.data?.message ?? 'Could not file the protest.')
            } finally {
              setBusy(false)
            }
          }}
        >
          FILE PROTEST
        </Button>
      </div>
    </Modal>
  )
}

// ── Deciding one (Sec. 83.1 for the BAC, Sec. 84 for the HoPE) ──────────────
function ResolveModal({ protest, onClose, onDone }) {
  const [outcome, setOutcome] = useState('denied')
  const [decision, setDecision] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Modal title={`Decide — ${PROTEST_STAGE_LABELS[protest.stage]}`} onClose={onClose}>
      <p className="mb-3 rounded border border-border-muted bg-surface-muted px-3 py-2 text-xs text-text-secondary">
        Sec. 84.1 — the decision must clearly state the factual and legal bases and cite the relevant
        portions of the bidding documents or BAC resolutions. No award may be made on this
        procurement until it is resolved.
      </p>

      <label className="mb-1 block text-xs font-medium text-text-secondary">Outcome</label>
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      >
        <option value="denied">Denied</option>
        <option value="granted">Granted</option>
        <option value="dismissed">Dismissed</option>
      </select>

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        Decision — factual and legal bases
      </label>
      <textarea
        rows={5}
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <Button
          disabled={busy || decision.trim().length < 30}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await protestsApi.resolveProtest(protest.id, { outcome, decision })
              onDone()
            } catch (err) {
              setError(err?.response?.data?.message ?? 'Could not record the decision.')
            } finally {
              setBusy(false)
            }
          }}
        >
          RECORD DECISION
        </Button>
      </div>
    </Modal>
  )
}

export default function Protests() {
  const { has } = usePermissions()
  const canFile = has('protest.file')
  const canResolve = has('protest.resolve')
  const canDecide = has('protest.decide')

  const [protests, setProtests] = useState([])
  const [rfqs, setRfqs] = useState([])
  const [filing, setFiling] = useState(false)
  const [escalating, setEscalating] = useState(null)
  const [resolving, setResolving] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Bumped after any mutation to re-run the effect — the same pattern the rest
  // of the app uses, and what keeps React from warning about cascading renders.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((key) => key + 1)

  useEffect(() => {
    let cancelled = false

    const fetchAll = async () => {
      try {
        const filed = await protestsApi.fetchProtests()
        const solicitations = canFile ? await biddingApi.fetchRfqs() : []
        if (cancelled) return
        setProtests(filed)
        setRfqs(solicitations)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message ?? 'Could not load protests.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()
    return () => {
      cancelled = true
    }
  }, [canFile, reloadKey])

  return (
    <DashboardPage>
      <PageHeader
        icon={Scale}
        title="Protests"
        subtitle="RA 12009 Sec. 83–85 — a bidder's remedy against a decision of the BAC, and a precondition to any court action."
      />

      {error && (
        <p role="alert" className="mb-4 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {canFile && (
        <div className="mb-4">
          <Button onClick={() => setFiling(true)}>FILE A REQUEST FOR RECONSIDERATION</Button>
        </div>
      )}

      <Card>
        {loading && <p className="text-sm text-text-secondary">Loading…</p>}
        {!loading && protests.length === 0 && (
          <p className="text-sm text-text-secondary">Nothing filed.</p>
        )}
        <div className="space-y-2">
          {protests.map((protest) => (
            <div key={protest.id} className="rounded border border-border-muted px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-navy">
                    {protest.referenceNo} — {PROTEST_STAGE_LABELS[protest.stage]}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {protest.vendorName} · challenged: {protest.challengedDecision} · filed{' '}
                    {dateOnly(protest.filedAt)}
                    {protest.protestFee ? ` · fee ${peso(protest.protestFee)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!protest.filedOnTime && (
                    <Badge tone="warning">
                      <AlertTriangle className="mr-1 inline h-3 w-3" />
                      Filed late
                    </Badge>
                  )}
                  {protest.finalAndExecutory && <Badge tone="info">Final &amp; executory</Badge>}
                  <Badge tone={PROTEST_STATUS_TONES[protest.status]}>
                    {PROTEST_STATUS_LABELS[protest.status]}
                  </Badge>
                </div>
              </div>

              {protest.decision && (
                <p className="mt-2 rounded bg-surface-muted px-3 py-2 text-xs text-text-secondary">
                  <strong>Decision:</strong> {protest.decision}
                </p>
              )}

              <div className="mt-2 flex gap-2">
                {protest.status === 'filed' &&
                  ((protest.stage === 'requestForReconsideration' && canResolve) ||
                    (protest.stage === 'protest' && canDecide)) && (
                    <Button variant="secondary" onClick={() => setResolving(protest)}>
                      RECORD DECISION
                    </Button>
                  )}
                {protest.stage === 'requestForReconsideration' &&
                  protest.status === 'denied' &&
                  canFile && (
                    <Button variant="secondary" onClick={() => setEscalating(protest)}>
                      ESCALATE — PROTEST TO THE MAYOR
                    </Button>
                  )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {filing && (
        <ReconsiderationModal
          rfqs={rfqs}
          onClose={() => setFiling(false)}
          onDone={() => {
            setFiling(false)
            reload()
          }}
        />
      )}
      {escalating && (
        <ProtestModal
          reconsideration={escalating}
          onClose={() => setEscalating(null)}
          onDone={() => {
            setEscalating(null)
            reload()
          }}
        />
      )}
      {resolving && (
        <ResolveModal
          protest={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null)
            reload()
          }}
        />
      )}
    </DashboardPage>
  )
}
