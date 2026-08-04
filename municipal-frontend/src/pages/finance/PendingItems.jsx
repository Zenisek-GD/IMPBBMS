import { useEffect, useState, useCallback } from 'react'
import { Package, Info } from 'lucide-react'
import * as financeApi from '../../api/finance'
import { PENDING_REASON_LABELS, PRIORITY_TONES } from '../../api/finance'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

const peso = (value) =>
  value === null ? '—' : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function ResolveModal({ item, onClose, onResolved }) {
  const [resolution, setResolution] = useState('carriedForward')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Modal title={`Resolve — ${item.description}`} onClose={onClose}>
      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Resolution</label>
      <select
        value={resolution}
        onChange={(event) => setResolution(event.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      >
        <option value="carriedForward">Carry forward to the next cycle</option>
        <option value="reprocured">Re-procure now</option>
        <option value="dropped">Drop (no longer required)</option>
      </select>

      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
        Notes {resolution === 'dropped' && <span className="text-danger">(required to drop)</span>}
      </label>
      <textarea
        rows={3}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setError('')
            setBusy(true)
            try {
              await financeApi.resolvePendingItem(item.id, resolution, notes)
              onResolved()
              onClose()
            } catch (err) {
              setError(err.response?.data?.message ?? 'Could not resolve.')
            } finally {
              setBusy(false)
            }
          }}
          className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
        >
          {busy ? 'SAVING...' : 'RESOLVE'}
        </button>
      </div>
    </Modal>
  )
}

export default function PendingItems() {
  const permissions = usePermissions()
  const [items, setItems] = useState([])
  const [showResolved, setShowResolved] = useState(false)
  const [resolving, setResolving] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    financeApi
      .fetchPendingItems({ resolved: showResolved ? 'true' : 'false' })
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [showResolved, refreshToken])

  const canResolve = permissions.hasAny('pr.review', 'bidding.publish')

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(items)

  return (
    <DashboardPage>
      <PageHeader
        title="Pending / Unbought Items"
        subtitle="Requisition lines that were not awarded or not completed, held for the next procurement cycle."
      />

      <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-[13px] text-text-secondary">
          Items land here instead of being silently closed — whether the bidding failed, nothing was awarded, or
          only part of the order arrived. Resolving one records what happens to it next.
        </p>
      </div>

      <Card bodyClassName="p-4">
        <label className="flex items-center gap-2 text-[13px] text-text-secondary">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved items
        </label>
      </Card>

      <Card title={showResolved ? 'Resolved' : 'Outstanding'} icon={Package} bodyClassName="">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {showResolved ? 'Nothing resolved yet.' : 'Nothing outstanding — the queue is clear.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Item', 'PR', 'Unit', 'Qty', 'Est. Cost', 'Reason', 'Aging', 'Priority', 'Actions'].map(
                    (head) => (
                      <th
                        key={head}
                        className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
                      >
                        {head}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => (
                  <tr key={item.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 text-[13px] text-navy">
                      {item.description}
                      {item.notes && <p className="mt-1 text-xs text-text-faint">{item.notes}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-navy">{item.prNumber}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{item.departmentCode ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">
                      {item.quantity === null ? '—' : Number(item.quantity).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap">{peso(item.estimatedCost)}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">
                      {PENDING_REASON_LABELS[item.reason] ?? item.reason}
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {item.agingDays} days
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={PRIORITY_TONES[item.priority]}>{item.priority}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {!item.resolvedAt && canResolve && (
                        <button
                          type="button"
                          onClick={() => setResolving(item)}
                          className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                        >
                          RESOLVE
                        </button>
                      )}
                      {item.resolvedAt && <Badge tone="success">{item.resolution}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="items" />
      </Card>

      {resolving && (
        <ResolveModal item={resolving} onClose={() => setResolving(null)} onResolved={refresh} />
      )}
    </DashboardPage>
  )
}
