import { useEffect, useState } from 'react'
import * as api from '../../api/bidding'
import { useAuth } from '../../context/useAuth'
import { usePermissions } from '../../context/usePermissions'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import { NextInline } from '../../components/ui/NextStep'
import { awardNext } from '../../config/nextSteps'
import { useServerTable } from '../../components/ui/useServerTable'

const inputClass = 'mt-2 min-h-11 w-full rounded border border-border-muted bg-surface p-3 text-sm'
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)

export default function AwardQueue({ version, onChanged }) {
  const { user } = useAuth()
  const permissions = usePermissions()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState(null)
  const [grounds, setGrounds] = useState('')
  const [notice, setNotice] = useState({ noaDate: '', externalNoaNumber: '', supplierReceivedAt: '' })
  const [saving, setSaving] = useState(false)
  const table = useServerTable(api.fetchAwards, { urlKey: 'awards', defaultPageSize: 10, filters: [{ key: 'status', label: 'All statuses', options: [{ value: 'pendingHopeApproval', label: 'Awaiting HoPE approval' }, { value: 'issued', label: 'Issued' }, { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' }, { value: 'disapproved', label: 'Disapproved' }, { value: 'cancelled', label: 'Cancelled' }] }] })
  const { refresh: refreshAwards } = table
  useEffect(() => { refreshAwards() }, [version, refreshAwards])
  const open = (award, action) => {
    setError(''); setGrounds(''); setSelection({ award, action })
    setNotice({ noaDate: today(), externalNoaNumber: '', supplierReceivedAt: '' })
  }
  const act = async (event) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = selection.action === 'approve'
        ? await api.approveAward(selection.award.id, { noaDate: notice.noaDate, externalNoaNumber: notice.externalNoaNumber })
        : selection.action === 'receipt'
          ? await api.recordAwardReceipt(selection.award.id, notice.supplierReceivedAt)
          : await api.disapproveAward(selection.award.id, grounds)
      setMessage(result.message ?? 'Award decision recorded.')
      setSelection(null); onChanged()
    } catch (err) { setError(err.response?.data?.message ?? 'Could not record the award decision.') }
    finally { setSaving(false) }
  }
  return <Card title="BAC award recommendations / Notices of Award">
    <TableToolbar {...table.toolbarProps} searchPlaceholder="Search award, project, bidder or status…" />
    {table.loading ? <p className="p-4 text-sm text-text-faint">Loading award recommendations…</p> : table.failed ? <div className="p-4"><p className="text-sm text-danger">Award recommendations could not be loaded.</p><Button size="sm" variant="secondary" className="mt-3" onClick={table.refresh}>Retry</Button></div> : <>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{['Notice of Award', 'Project', 'Recommended bidder', 'Amount', 'Status', ''].map((value) => <th className="p-3" key={value}>{value}</th>)}</tr></thead>
        <tbody>{table.pageRows.map((award) => <tr key={award.id} className="border-t border-border-muted">
          <td className="p-3">{award.noaNumber}{award.externalNoaNumber && <p className="text-xs text-text-secondary">Existing reference: {award.externalNoaNumber}</p>}<p className="text-xs text-text-faint">{award.status === 'pendingHopeApproval' ? 'Prepared' : 'NOA date'}: {award.noaDate ?? 'Not recorded'}</p><p className="text-xs text-text-faint">Supplier receipt: {award.supplierReceivedAt ?? 'Not recorded'}</p>{award.resolutionNo && <p className="text-xs text-text-secondary">{award.resolutionNo}</p>}</td>
          <td className="p-3">{award.projectTitle}<p className="text-xs text-text-faint">Recommended by {award.recommendedByName}</p></td>
          <td className="p-3">{award.vendorName}</td><td className="p-3 whitespace-nowrap">₱{Number(award.amount).toLocaleString('en-PH')}<p className="text-xs text-text-faint">{award.awardBasis}</p></td>
          <td className="p-3"><Badge tone={award.status === 'issued' ? 'success' : award.status === 'disapproved' ? 'danger' : 'warning'}>{award.status}</Badge><NextInline next={awardNext(award)} /></td>
          <td className="p-3">{permissions.has('bidding.award') && award.status === 'pendingHopeApproval' && award.recommendedById !== user.id && <div className="flex gap-2"><Button size="sm" title="Approve and issue the Notice of Award (NOA)" onClick={() => open(award, 'approve')}>Approve / issue NOA</Button><Button size="sm" variant="danger" onClick={() => open(award, 'disapprove')}>Disapprove</Button></div>}{permissions.has('bidding.publish') && ['issued', 'accepted'].includes(award.status) && !award.supplierReceivedAt && <Button size="sm" variant="secondary" onClick={() => open(award, 'receipt')}>Record supplier receipt</Button>}</td>
        </tr>)}</tbody>
      </table></div>
      {!table.rows.length && <p className="p-4 text-sm text-text-faint">No award recommendations match this view.</p>}<Pagination {...table.paginationProps} label="awards" />
    </>}
    {message && <p role="status" className="mt-3 text-sm text-success">{message}</p>}{error && !selection && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {selection && <Modal title={selection.action === 'approve' ? 'Approve and issue Notice of Award' : selection.action === 'receipt' ? 'Record supplier receipt of Notice of Award' : 'Disapprove award recommendation'} onClose={() => setSelection(null)}>
      <form className="space-y-4" onSubmit={act}>
        <p className="text-sm">{selection.award.noaNumber} — {selection.award.projectTitle}, recommended to {selection.award.vendorName}.</p>
        {selection.action === 'disapprove' ? <label className="block text-sm">Written grounds furnished to the BAC<textarea required minLength={30} rows={4} className={inputClass} value={grounds} onChange={(event) => setGrounds(event.target.value)} /></label> : selection.action === 'receipt' ? <label className="block text-sm">Supplier receipt date<input required type="date" min={selection.award.noaDate} max={today()} value={notice.supplierReceivedAt} onChange={(event) => setNotice({ ...notice, supplierReceivedAt: event.target.value })} className={inputClass} /></label> : <>
          <p className="text-sm text-text-secondary">Confirm the BAC recommendation and required approval/signature process before issuing this Notice of Award.</p>
          <label className="block text-sm">Notice of Award date<input required type="date" max={today()} value={notice.noaDate} onChange={(event) => setNotice({ ...notice, noaDate: event.target.value })} className={inputClass} /></label>
          <label className="block text-sm">Existing Notice of Award number (optional)<input maxLength={255} value={notice.externalNoaNumber} onChange={(event) => setNotice({ ...notice, externalNoaNumber: event.target.value })} className={inputClass} /><span className="text-xs text-text-faint">The system reference is retained alongside the official reference.</span></label>
        </>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record award decision'}</Button>
      </form>
    </Modal>}
  </Card>
}
