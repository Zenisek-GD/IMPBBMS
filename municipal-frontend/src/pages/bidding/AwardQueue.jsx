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
import { useTableControls } from '../../components/ui/useTableControls'

export default function AwardQueue({ version, onChanged }) {
  const { user }=useAuth()
  const permissions=usePermissions()
  const [awards,setAwards]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[selection,setSelection]=useState(null),[grounds,setGrounds]=useState(''),[saving,setSaving]=useState(false)
  useEffect(()=>{let active=true;api.fetchAwards().then((rows)=>{if(active)setAwards(rows)}).catch((err)=>{if(active)setError(err.response?.data?.message??'Could not load award recommendations.')});return()=>{active=false}},[version])
  const table=useTableControls(awards,{searchKeys:['noaNumber','projectTitle','vendorName','status'],pageSize:10})
  const act=async(event)=>{event.preventDefault();setSaving(true);setError('');try{const result=await(selection.action==='approve'?api.approveAward(selection.award.id):api.disapproveAward(selection.award.id,grounds));setMessage(result.message??(selection.action==='approve'?'Notice of Award approved and issued. Proceed to contract preparation.':'Award recommendation disapproved. The written grounds have been sent to the BAC for review.'));setSelection(null);onChanged()}catch(err){setError(err.response?.data?.message??'Could not record the award decision.')}finally{setSaving(false)}}
  return <Card title="BAC award recommendations / Notices of Award"><TableToolbar {...table.toolbarProps} searchPlaceholder="Search award, project, bidder or status…" />
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Notice of Award','Project','Recommended bidder','Amount','Status',''].map((value)=><th className="p-3" key={value}>{value}</th>)}</tr></thead><tbody>{table.pageRows.map((award)=><tr key={award.id} className="border-t border-border-muted"><td className="p-3">{award.noaNumber}</td><td className="p-3">{award.projectTitle}<p className="text-xs text-text-faint">Recommended by {award.recommendedByName}</p></td><td className="p-3">{award.vendorName}</td><td className="p-3 whitespace-nowrap">₱{Number(award.amount).toLocaleString('en-PH')}</td><td className="p-3"><Badge tone={award.status==='issued'?'success':award.status==='disapproved'?'danger':'warning'}>{award.status}</Badge></td><td className="p-3">{permissions.has('bidding.award')&&award.status==='pendingHopeApproval'&&award.recommendedById!==user.id&&<div className="flex gap-2"><Button size="sm" onClick={()=>{setError('');setSelection({award,action:'approve'})}}>Approve / issue NOA</Button><Button size="sm" variant="danger" onClick={()=>{setError('');setGrounds('');setSelection({award,action:'disapprove'})}}>Disapprove</Button></div>}</td></tr>)}</tbody></table></div>
    {!awards.length&&<p className="p-4 text-sm text-text-faint">No award recommendations have been recorded.</p>}<Pagination {...table.paginationProps} label="awards" />
    {message&&<p role="status" className="mt-3 text-sm text-success">{message}</p>}{error&&!selection&&<p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {selection&&<Modal title={selection.action==='approve'?'Approve and issue Notice of Award':'Disapprove award recommendation'} onClose={()=>setSelection(null)}><form className="space-y-4" onSubmit={act}><p className="text-sm">{selection.award.noaNumber} — {selection.award.projectTitle}, recommended to {selection.award.vendorName}.</p>{selection.action==='disapprove'?<label className="block text-sm">Written grounds furnished to the BAC<textarea required minLength={30} rows={4} className="mt-2 w-full rounded border border-border-muted bg-surface p-3" value={grounds} onChange={(event)=>setGrounds(event.target.value)} /></label>:<p className="text-sm text-text-secondary">Confirm the BAC recommendation and required approval/signature process before issuing this Notice of Award.</p>}{error&&<p role="alert" className="text-sm text-danger">{error}</p>}<Button type="submit" disabled={saving}>{saving?'Saving…':'Record award decision'}</Button></form></Modal>}
  </Card>
}
