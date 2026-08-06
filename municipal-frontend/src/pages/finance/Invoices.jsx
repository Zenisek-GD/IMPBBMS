import { useEffect, useState, useCallback } from 'react'
import { Receipt, Banknote, Plus, ShieldAlert } from 'lucide-react'
import * as financeApi from '../../api/finance'
import { INVOICE_STATUS_TONES } from '../../api/finance'
import { fetchContracts } from '../../api/contracts'
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

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function SubmitInvoiceModal({ onClose, onSubmitted }) {
  const [contracts, setContracts] = useState([])
  const [form, setForm] = useState({ contractId: '', deliveryId: '', amount: '', supplierInvoiceRef: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchContracts()
      .then((data) => {
        if (!cancelled) setContracts(data.filter((contract) => contract.status === 'active'))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const selected = contracts.find((contract) => String(contract.id) === String(form.contractId))
  // Only an accepted delivery can be invoiced (Section 6).
  const acceptedDeliveries = (selected?.deliveries ?? []).filter((d) => d.status === 'accepted')

  return (
    <Modal title="Submit invoice" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Contract
          </label>
          <select
            value={form.contractId}
            onChange={(event) => setForm({ ...form, contractId: event.target.value, deliveryId: '' })}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">Select an active contract...</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.contractNo} — {peso(contract.amount)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Accepted delivery
          </label>
          <select
            value={form.deliveryId}
            disabled={!form.contractId}
            onChange={(event) => setForm({ ...form, deliveryId: event.target.value })}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy disabled:bg-sidebar focus:border-navy focus:outline-none"
          >
            <option value="">Select a delivery...</option>
            {acceptedDeliveries.map((delivery) => (
              <option key={delivery.id} value={delivery.id}>
                {delivery.description?.slice(0, 60) ?? `Delivery #${delivery.id}`}
              </option>
            ))}
          </select>
          {form.contractId && acceptedDeliveries.length === 0 && (
            <p className="mt-1 text-xs text-warning">
              No accepted deliveries on this contract yet — acceptance is what unlocks invoicing.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Amount (₱)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Your invoice ref.
            </label>
            <input
              type="text"
              value={form.supplierInvoiceRef}
              onChange={(event) => setForm({ ...form, supplierInvoiceRef: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
        </div>

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
            disabled={saving || !form.contractId || !form.deliveryId || !form.amount}
            onClick={async () => {
              setError('')
              setSaving(true)
              try {
                await financeApi.submitInvoice({
                  contractId: Number(form.contractId),
                  deliveryId: Number(form.deliveryId),
                  amount: Number(form.amount),
                  supplierInvoiceRef: form.supplierInvoiceRef,
                })
                onSubmitted()
                onClose()
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not submit the invoice.')
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {saving ? 'SUBMITTING...' : 'SUBMIT INVOICE'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Invoices() {
  const permissions = usePermissions()
  const [invoices, setInvoices] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [returning, setReturning] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    financeApi
      .fetchInvoices()
      .then((data) => {
        if (!cancelled) setInvoices(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const run = async (fn) => {
    setActionError('')
    try {
      await fn()
      refresh()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'That action could not be completed.')
    }
  }

  // Certification and release are separate permissions held by separate
  // officers, so the two actions are gated separately. An Accountant sees
  // "Certify" and no release button; a Treasurer sees the reverse.
  const canCertify = permissions.has('payment.certify')
  const canRelease = permissions.has('payment.release')
  const canProcess = canCertify || canRelease
  const isSupplier = permissions.has('delivery.submitInvoice')

  const table = useTableControls(invoices, {
    searchKeys: [
      'invoiceNo',
      'contractNo',
      'vendorName',
      'remarks',
      (invoice) => invoice.payment?.disbursementNo,
    ],
    filters: [
      { key: 'status', label: 'All statuses' },
      { key: 'vendorName', label: 'All suppliers' },
      {
        key: 'paymentStatus',
        label: 'Disbursement',
        options: [
          { value: 'released', label: 'Released' },
          { value: 'prepared', label: 'Voucher prepared' },
          { value: 'none', label: 'No voucher yet' },
        ],
        accessor: (invoice) => invoice.payment?.status ?? 'none',
      },
    ],
    accessors: {
      amount: (invoice) => Number(invoice.amount ?? 0),
      disbursementNo: (invoice) => invoice.payment?.disbursementNo ?? null,
    },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title={canProcess ? 'Invoice & Payment Processing' : 'My Invoices'}
        subtitle="Accounting certifies and prepares the voucher; Treasury releases the payment."
        actions={
          isSupplier && (
            <Button icon={Plus} onClick={() => setSubmitting(true)}>
              SUBMIT INVOICE
            </Button>
          )
        }
      />

      {canProcess && (
        <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-navy" />
          <p className="text-[13px] text-text-secondary">
            {canCertify
              ? 'You may certify claims and prepare disbursement vouchers. Releasing the funds is the Treasurer’s act — a voucher you prepared cannot be released by you.'
              : 'You may release funds against vouchers the Accountant has certified. A voucher you prepared yourself cannot be released by you.'}
          </p>
        </div>
      )}

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card title="Invoices" icon={Receipt} bodyClassName="">
        {invoices.length > 0 && (
          <div className="border-b border-border-muted p-4">
            <TableToolbar
              {...table.toolbarProps}
              searchPlaceholder="Search invoice, contract, supplier or voucher…"
            />
          </div>
        )}
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'No invoices yet.'
              : 'No invoices match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('invoiceNo')}>Invoice</SortableTh>
                  <SortableTh {...table.sortProps('contractNo')}>Contract</SortableTh>
                  <SortableTh {...table.sortProps('vendorName')}>Supplier</SortableTh>
                  <SortableTh {...table.sortProps('amount')}>Amount</SortableTh>
                  <SortableTh {...table.sortProps('disbursementNo')}>Disbursement</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">
                      {invoice.invoiceNo}
                      {invoice.remarks && <p className="mt-1 text-xs text-danger">{invoice.remarks}</p>}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{invoice.contractNo}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{invoice.vendorName}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-navy">
                      {peso(invoice.amount)}
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                      {invoice.payment ? (
                        <>
                          <span className="font-mono text-xs text-navy">{invoice.payment.disbursementNo}</span>
                          <p className="mt-0.5 text-[11px] text-text-faint">
                            {invoice.payment.status === 'released'
                              ? `released by ${invoice.payment.releasedByName}`
                              : `prepared by ${invoice.payment.preparedByName}`}
                          </p>
                        </>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={INVOICE_STATUS_TONES[invoice.status]}>{invoice.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {canCertify && invoice.status === 'submitted' && (
                          <>
                            <button
                              type="button"
                              onClick={() => run(() => financeApi.certifyInvoice(invoice.id, 'certify'))}
                              className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                            >
                              CERTIFY
                            </button>
                            <button
                              type="button"
                              onClick={() => setReturning(invoice)}
                              className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                            >
                              RETURN
                            </button>
                          </>
                        )}
                        {canRelease && invoice.payment?.status === 'prepared' && (
                          <button
                            type="button"
                            onClick={() =>
                              run(() =>
                                financeApi.releasePayment(invoice.payment.id, { method: 'LDDAP-ADA' })
                              )
                            }
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            <Banknote size={12} /> RELEASE
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="invoices" />
      </Card>

      {submitting && <SubmitInvoiceModal onClose={() => setSubmitting(false)} onSubmitted={refresh} />}

      {returning && (
        <Modal title={`Return ${returning.invoiceNo}`} onClose={() => setReturning(null)}>
          <p className="mb-3 text-sm text-text-secondary">Remarks are required and go back to the supplier.</p>
          <textarea
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReturning(null)}>
              CANCEL
            </Button>
            <button
              type="button"
              onClick={async () => {
                await run(() => financeApi.certifyInvoice(returning.id, 'return', remarks))
                setReturning(null)
                setRemarks('')
              }}
              className="rounded-sm bg-danger px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-white"
            >
              RETURN INVOICE
            </button>
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}
