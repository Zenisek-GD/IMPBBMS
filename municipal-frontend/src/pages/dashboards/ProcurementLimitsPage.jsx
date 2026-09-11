import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/settings'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import { useTableControls } from '../../components/ui/useTableControls'
const fieldClass = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy'
const money = (value) => value == null ? 'No ceiling' : `₱${Number(value).toLocaleString('en-PH')}`
const categories = { all:'All categories', goods:'Goods', infrastructure:'Infrastructure', consulting:'Consulting Services' }
export default function ProcurementLimitsPage() {
  const permissions = usePermissions()
  const [data,setData] = useState({limits:[],methods:[]})
  const [defaults,setDefaults] = useState({})
  const [version,setVersion] = useState(0)
  const [editing,setEditing] = useState(null)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  useEffect(() => { let active=true; Promise.all([api.fetchProcurementLimits(),api.fetchSettings()]).then(([result,current])=>{if(active){setData(result);setDefaults(current.thresholds??{})}}).catch((err)=>{if(active)setError(err.response?.data?.message??'Could not load applicable limits.')}); return()=>{active=false} },[version])
  const rows=data.limits.map((row)=>({...row,methodName:data.methods.find((method)=>method.key===row.procurementMethod)?.name??row.procurementMethod}))
  const table=useTableControls(rows,{searchKeys:['category','methodName','policyReference','status'],initialSort:{key:'effectiveDate',direction:'desc'},pageSize:10})
  return <DashboardPage><PageHeader title="Applicable Limits" subtitle="Settings → Procurement Settings → Applicable Limits" /><Link to="/admin/settings" className="text-sm text-info underline">← Back to Settings</Link>
    <Card title="Configured procurement limits"><p className="mb-4 text-sm text-text-secondary">Active values apply from their effective date. The most recent applicable category-specific value takes priority. Changes remain in the Audit Trail.</p>
      {permissions.has('settings.manage')&&<Button onClick={()=>setEditing({category:'all',procurementMethod:'',minimumAmount:'0',maximumAmount:'',effectiveDate:'',status:'active',policyReference:'',remarks:''})}>Add applicable limit</Button>}
      <TableToolbar {...table.toolbarProps} searchPlaceholder="Search category, method, status or policy reference…" />
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Category','Method','Minimum','Maximum','Effective date','Status','Policy reference',''].map((label)=><th key={label} className="border-b border-border-muted p-3">{label}</th>)}</tr></thead><tbody>{table.pageRows.map((row)=><tr key={row.id} className="border-b border-border-muted"><td className="p-3">{categories[row.category]}</td><td className="p-3">{row.methodName}</td><td className="p-3 whitespace-nowrap">{money(row.minimumAmount)}</td><td className="p-3 whitespace-nowrap">{money(row.maximumAmount)}</td><td className="p-3">{row.effectiveDate}</td><td className="p-3">{row.status}</td><td className="p-3">{row.policyReference}<p className="text-xs text-text-faint">{row.remarks}</p></td><td className="p-3">{permissions.has('settings.manage')&&<Button size="sm" variant="secondary" onClick={()=>setEditing(row)}>Edit</Button>}</td></tr>)}</tbody></table></div>
      {!table.rows.length&&<p className="py-6 text-sm text-text-faint">No configured limits match this selection. Existing server defaults apply until an effective limit is configured.</p>}<Pagination {...table.paginationProps} label="limits" />
    </Card><Card title="Existing LGU threshold reference"><p className="mb-3 text-xs text-text-faint">Values supplied centrally by the server remain available to existing procurement modules.</p><dl className="grid gap-3 md:grid-cols-2">{Object.entries(defaults).map(([key,value])=><div key={key} className="rounded border border-border-muted p-3"><dt className="text-sm font-medium">{value.label}</dt><dd className="text-sm">{money(value.amount)} <span className="text-xs text-text-faint">{value.citation}</span></dd></div>)}</dl></Card>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}{message&&<p role="status" className="text-sm text-success">{message}</p>}
    {editing&&<LimitForm initial={editing} methods={data.methods} onClose={()=>setEditing(null)} onSaved={(result)=>{setMessage(result.message);setEditing(null);setVersion((value)=>value+1)}} />}
  </DashboardPage>
}
function LimitForm({initial,methods,onClose,onSaved}) {
  const [form,setForm]=useState(initial),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const input=(key,label,type='text',required=true)=><label className="block text-xs text-text-secondary">{label}<input className={fieldClass} type={type} required={required} min={type==='number'?0:undefined} step={type==='number'?'0.01':undefined} value={form[key]??''} onChange={(event)=>setForm({...form,[key]:event.target.value})} /></label>
  return <Modal title={form.id?'Edit applicable limit':'New applicable limit'} onClose={onClose}><form className="space-y-4" onSubmit={async(event)=>{event.preventDefault();setSaving(true);setError('');try{const values={category:form.category,procurementMethod:form.procurementMethod,minimumAmount:form.minimumAmount,maximumAmount:form.maximumAmount,effectiveDate:form.effectiveDate,status:form.status,policyReference:form.policyReference,remarks:form.remarks};onSaved(await(form.id?api.updateProcurementLimit(form.id,values):api.createProcurementLimit(values)))}catch(err){setError(err.response?.data?.message??'Could not save this limit.')}finally{setSaving(false)}}}>
    <label className="block text-xs">Procurement category<select className={fieldClass} value={form.category} onChange={(event)=>setForm({...form,category:event.target.value})}>{Object.entries(categories).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
    <label className="block text-xs">Procurement method<select required className={fieldClass} value={form.procurementMethod} onChange={(event)=>setForm({...form,procurementMethod:event.target.value})}><option value="">Select method</option>{methods.map((method)=><option key={method.key} value={method.key}>{method.name}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2">{input('minimumAmount','Minimum amount','number')}{input('maximumAmount','Maximum amount (blank for no ceiling)','number',false)}{input('effectiveDate','Effective date','date')}<label className="text-xs">Status<select className={fieldClass} value={form.status} onChange={(event)=>setForm({...form,status:event.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
    {input('policyReference','Legal / policy reference')}{input('remarks','Remarks','text',false)}{error&&<p role="alert" className="text-sm text-danger">{error}</p>}<Button type="submit" disabled={saving}>{saving?'Saving…':'Save applicable limit'}</Button>
  </form></Modal>
}
