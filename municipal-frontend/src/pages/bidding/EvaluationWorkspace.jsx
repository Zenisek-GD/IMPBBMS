import { useEffect, useState, useCallback } from 'react'
import { EyeOff, Eye, Award as AwardIcon, ShieldCheck, Lock } from 'lucide-react'
import * as biddingApi from '../../api/bidding'
import { RFQ_STATUS_LABELS, RFQ_STATUS_TONES, EVALUATION_RUBRIC } from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

const peso = (value) =>
  value === null || value === undefined
    ? 'Sealed'
    : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function ScoreModal({ bid, onClose, onSubmit }) {
  const [scores, setScores] = useState(
    Object.fromEntries(EVALUATION_RUBRIC.map((criterion) => [criterion.key, '']))
  )
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const values = Object.values(scores).filter((value) => value !== '')
  const average =
    values.length > 0 ? (values.reduce((sum, v) => sum + Number(v), 0) / values.length).toFixed(2) : '—'

  return (
    <Modal title={`Score ${bid.blindLabel}`} onClose={onClose}>
      <div className="mb-4 flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
        <EyeOff size={14} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-xs text-text-secondary">
          You are scoring bid content only. The bidder&apos;s identity and price are hidden, and your score
          becomes permanent once submitted.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {EVALUATION_RUBRIC.map((criterion) => (
          <div key={criterion.key}>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              {criterion.label}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={scores[criterion.key]}
              onChange={(event) => setScores({ ...scores, [criterion.key]: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              placeholder="0 – 100"
            />
          </div>
        ))}

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Remarks (optional)
          </label>
          <textarea
            rows={2}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
        </div>

        <p className="text-right text-sm font-bold text-navy">Average: {average}</p>

        {error && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="button"
            disabled={saving || values.length !== EVALUATION_RUBRIC.length}
            onClick={async () => {
              setError('')
              setSaving(true)
              try {
                await onSubmit(scores, remarks)
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not submit the score.')
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'SUBMITTING...' : 'SUBMIT SCORE (FINAL)'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function EvaluationWorkspace() {
  const permissions = usePermissions()
  const [rfqs, setRfqs] = useState([])
  const [selected, setSelected] = useState(null)
  const [bidData, setBidData] = useState(null)
  const [scoring, setScoring] = useState(null)
  const [actionError, setActionError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    biddingApi
      .fetchRfqs()
      .then((data) => {
        if (cancelled) return
        // Only procurements that have reached evaluation are actionable here.
        const relevant = data.filter((rfq) => ['opened', 'evaluated', 'awarded'].includes(rfq.status))
        setRfqs(relevant)
        setSelected((current) => current ?? relevant[0] ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    biddingApi
      .fetchBids(selected.id)
      .then((data) => {
        if (!cancelled) setBidData(data)
      })
      .catch(() => {
        if (!cancelled) setBidData(null)
      })
    return () => {
      cancelled = true
    }
  }, [selected, refreshToken])

  const run = async (fn) => {
    setActionError('')
    try {
      await fn()
      refresh()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'That action could not be completed.')
    }
  }

  const canScore = permissions.hasAny('bidding.evaluate', 'bidding.technicalInput')
  const canChair = permissions.has('bidding.chairEvaluation')
  const canApproveAward = permissions.has('bidding.award')

  // Once any bid in this RFQ has been awarded, the award is decided — no other
  // post-qualified bidder may still be "recommended". The RECOMMEND AWARD
  // button was gated only on the individual bid's own status, so every other
  // post-qualified bid kept an active button after one had already won, letting
  // the Chair recommend a second award against an RFQ that already had one.
  const rfqAlreadyAwarded = Boolean(bidData?.bids?.some((bid) => bid.status === 'awarded'))

  // The procurement picker. It is a row of buttons rather than a table, but it
  // is a list that grows with the LGU's workload and it needed the same search
  // and filter as everything else — a Mayor approving awards should not have to
  // read forty reference numbers to find one.
  const rfqTable = useTableControls(rfqs, {
    searchKeys: ['referenceNo', 'title'],
    filters: [
      {
        key: 'status',
        label: 'All stages',
        options: Object.entries(RFQ_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
    ],
  })

  // Bid price and average score sort numerically. This is the ranking the
  // Chairperson works from — the Lowest Calculated Responsive Bid is decided on
  // the server, but being able to order the table by price is how a reader
  // checks that the ranking says what it should.
  //
  // Sealed values sort last in both directions, which is the honest position
  // for a figure nobody is allowed to see yet.
  const bidTable = useTableControls(bidData?.bids, {
    searchKeys: ['vendorName', 'status'],
    filters: [{ key: 'status', label: 'All bid statuses' }],
    accessors: {
      totalBidPrice: (bid) => (bid.totalBidPrice == null ? null : Number(bid.totalBidPrice)),
      averageScore: (bid) => (bid.averageScore == null ? null : Number(bid.averageScore)),
      evaluationCount: (bid) => Number(bid.evaluationCount ?? 0),
    },
  })

  return (
    <DashboardPage>
      <PageHeader
        title="Evaluation Workspace"
        subtitle="Blind scoring, post-qualification, and award recommendation."
      />

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card bodyClassName="p-4">
        {rfqs.length > 0 && (
          <div className="mb-3">
            <TableToolbar {...rfqTable.toolbarProps} searchPlaceholder="Search reference or title…" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {rfqs.length === 0 && (
            <p className="text-[13px] text-text-faint">No procurements are currently under evaluation.</p>
          )}
          {rfqs.length > 0 && rfqTable.rows.length === 0 && (
            <p className="text-[13px] text-text-faint">No procurements match your search or filters.</p>
          )}
          {rfqTable.rows.map((rfq) => (
            <button
              key={rfq.id}
              type="button"
              onClick={() => setSelected(rfq)}
              className={`rounded border px-4 py-2 text-left text-[11px] font-medium tracking-[0.03em] ${
                selected?.id === rfq.id
                  ? 'border-navy bg-accent text-accent-fg'
                  : 'border-border-muted bg-surface text-text-secondary'
              }`}
            >
              {rfq.referenceNo}
              <span className="ml-2 opacity-70">{RFQ_STATUS_LABELS[rfq.status]}</span>
            </button>
          ))}
        </div>
      </Card>

      {selected && bidData && (
        <Card
          title={`${selected.referenceNo} — ${selected.title}`}
          icon={bidData.blind ? EyeOff : Eye}
          action={<Badge tone={RFQ_STATUS_TONES[selected.status]}>{RFQ_STATUS_LABELS[selected.status]}</Badge>}
          bodyClassName=""
        >
          <div
            className={`flex items-start gap-2 border-b border-border-muted px-4 py-2 ${
              bidData.blind ? 'bg-chip/40' : 'bg-success/5'
            }`}
          >
            {bidData.blind ? (
              <EyeOff size={14} className="mt-0.5 shrink-0 text-navy" />
            ) : (
              <Eye size={14} className="mt-0.5 shrink-0 text-success" />
            )}
            <p className="text-xs text-text-secondary">
              {bidData.blindNotice ??
                'Evaluation is closed. Bidder identities and financial envelopes are now visible.'}
            </p>
          </div>

          {bidData.bids.length > 0 && (
            <div className="border-b border-border-muted p-4">
              <TableToolbar {...bidTable.toolbarProps} searchPlaceholder="Search bidder…" />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...bidTable.sortProps('vendorName')}>Bidder</SortableTh>
                  <SortableTh {...bidTable.sortProps('averageScore')}>Avg. Score</SortableTh>
                  <SortableTh {...bidTable.sortProps('evaluationCount')}>Evaluations</SortableTh>
                  <SortableTh {...bidTable.sortProps('totalBidPrice')}>Bid Price</SortableTh>
                  <SortableTh {...bidTable.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {bidTable.pageRows.map((bid) => (
                  <tr key={bid.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 text-[13px] text-navy">
                      <span className="flex items-center gap-2">
                        {bidData.blind && <Lock size={11} className="text-text-faint" />}
                        {bid.vendorName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-navy">{bid.averageScore ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{bid.evaluationCount}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {peso(bid.totalBidPrice)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          bid.status === 'awarded'
                            ? 'success'
                            : bid.status.includes('Failed') || bid.status.includes('Disqualified')
                              ? 'danger'
                              : 'info'
                        }
                      >
                        {bid.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {bidData.blind && canScore && (
                          <button
                            type="button"
                            onClick={() => setScoring(bid)}
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            SCORE
                          </button>
                        )}
                        {!bidData.blind && canChair && bid.status === 'technicalPassed' && (
                          <button
                            type="button"
                            onClick={() =>
                              run(() =>
                                biddingApi.submitPostQualification(bid.id, {
                                  result: 'passed',
                                  checklist: { legal: 'ok', technical: 'ok', financial: 'ok' },
                                })
                              )
                            }
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            POST-QUALIFY
                          </button>
                        )}
                        {!bidData.blind && canChair && bid.status === 'postQualified' && !rfqAlreadyAwarded && (
                          <button
                            type="button"
                            onClick={() => run(() => biddingApi.recommendAward(bid.id))}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <AwardIcon size={12} /> RECOMMEND AWARD
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bidData.bids.length > 0 && bidTable.rows.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-text-faint">
              No bids match your search or filters.
            </p>
          )}
          {bidTable.rows.length > 0 && <Pagination {...bidTable.paginationProps} label="bids" />}

          {bidData.blind && canChair && (
            <div className="flex items-center justify-between gap-4 border-t border-border-muted px-4 py-3">
              <p className="text-xs text-text-secondary">
                Closing evaluation reveals every bidder&apos;s identity and unseals the financial envelopes of
                those that passed. It cannot be undone.
              </p>
              <Button
                icon={ShieldCheck}
                onClick={() => run(() => biddingApi.closeEvaluation(selected.id))}
              >
                CLOSE EVALUATION
              </Button>
            </div>
          )}

          {!bidData.blind && canApproveAward && (
            <div className="border-t border-border-muted px-4 py-3">
              <p className="text-xs text-text-secondary">
                Award approval is done from the Awards queue — the committee recommends, the Mayor approves.
              </p>
            </div>
          )}
        </Card>
      )}

      {scoring && (
        <ScoreModal
          bid={scoring}
          onClose={() => setScoring(null)}
          onSubmit={async (scores, remarks) => {
            const numeric = Object.fromEntries(
              Object.entries(scores).map(([key, value]) => [key, Number(value)])
            )
            await biddingApi.submitEvaluation(scoring.id, numeric, remarks)
            refresh()
          }}
        />
      )}
    </DashboardPage>
  )
}
