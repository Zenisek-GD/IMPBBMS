import { useEffect, useState, useCallback } from 'react'
import { Truck, CheckCircle2, XCircle } from 'lucide-react'
import * as contractsApi from '../../api/contracts'
import { DELIVERY_STATUS_TONES } from '../../api/contracts'
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

function InspectModal({ delivery, onClose, onDecided }) {
  const [remarks, setRemarks] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const decide = async (result) => {
    setError('')
    setBusy(true)
    try {
      await contractsApi.inspectDelivery(delivery.id, {
        result,
        remarks,
        acceptedQuantityNote: note,
      })
      onDecided()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not record the inspection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Inspect delivery — ${delivery.contractNo}`} onClose={onClose}>
      <p className="mb-3 text-[13px] text-text-secondary">{delivery.description || 'No description given.'}</p>

      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
        Quantity accepted (note)
      </label>
      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="e.g. 40 of 40 units accepted"
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
        Remarks (required to reject)
      </label>
      <textarea
        rows={3}
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide('rejected')}
          className="flex items-center gap-1 rounded-sm border border-danger/30 px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-danger"
        >
          <XCircle size={12} /> REJECT
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide('accepted')}
          className="flex items-center gap-1 rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
        >
          <CheckCircle2 size={12} /> ACCEPT
        </button>
      </div>
    </Modal>
  )
}

export default function Deliveries() {
  const [deliveries, setDeliveries] = useState([])
  const [inspecting, setInspecting] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    contractsApi
      .fetchDeliveries()
      .then((data) => {
        if (!cancelled) setDeliveries(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const awaiting = deliveries.filter((delivery) => delivery.status === 'reported').length

  const table = useTableControls(deliveries, {
    searchKeys: ['contractNo', 'vendorName', 'description', 'remarks'],
    filters: [
      { key: 'status', label: 'All statuses' },
      { key: 'vendorName', label: 'All suppliers' },
    ],
    accessors: { deliveredAt: (delivery) => delivery.deliveredAt ?? null },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title="Delivery & Acceptance"
        subtitle="Inspect what suppliers deliver. Acceptance is what unlocks invoicing."
        actions={awaiting > 0 && <Badge tone="warning">{awaiting} awaiting inspection</Badge>}
      />

      <Card title="Deliveries" icon={Truck} bodyClassName="">
        {deliveries.length > 0 && (
          <div className="border-b border-border-muted p-4">
            <TableToolbar
              {...table.toolbarProps}
              searchPlaceholder="Search contract, supplier or description…"
            />
          </div>
        )}
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'Nothing delivered yet.'
              : 'No deliveries match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('contractNo')}>Contract</SortableTh>
                  <SortableTh {...table.sortProps('vendorName')}>Supplier</SortableTh>
                  <SortableTh {...table.sortProps('description')}>Description</SortableTh>
                  <SortableTh {...table.sortProps('deliveredAt')}>Delivered</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((delivery) => (
                  <tr key={delivery.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">{delivery.contractNo}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{delivery.vendorName}</td>
                    <td className="px-4 py-3 text-[13px] text-navy">
                      {delivery.description ?? '—'}
                      {delivery.remarks && (
                        <p className="mt-1 text-xs text-danger">Remarks: {delivery.remarks}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={DELIVERY_STATUS_TONES[delivery.status]}>{delivery.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {delivery.status === 'reported' && (
                        <button
                          type="button"
                          onClick={() => setInspecting(delivery)}
                          className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                        >
                          INSPECT
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="deliveries" />
      </Card>

      {inspecting && (
        <InspectModal delivery={inspecting} onClose={() => setInspecting(null)} onDecided={refresh} />
      )}
    </DashboardPage>
  )
}
