import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProcurementSettings, updateProcurementSettings } from '../../api/settings'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

const fieldClass = 'mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy'
const positions = { bacChairperson: 'BAC Chairperson', bacViceChairperson: 'BAC Vice-Chairperson', bacMember: 'BAC Member' }
export default function ProcurementSettingsPanel() {
  const [data, setData] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    fetchProcurementSettings().then((value) => { if (active) { setData(value); setPolicy({ ...value.policy, memberIds: value.policy.memberIds.length ? value.policy.memberIds : value.committee.map((member) => member.id) }) } }).catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load procurement settings.') })
    return () => { active = false }
  }, [])
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      if (policy.memberIds.length !== Number(policy.membershipCount)) throw new Error('Select exactly the configured number of official BAC signatories.')
      const result = await updateProcurementSettings(policy)
      setData(result); setPolicy(result.policy); setMessage(result.message)
    } catch (err) { setError(err.response?.data?.message ?? err.message) }
    finally { setSaving(false) }
  }
  return <Card title="Procurement Settings">
    <p className="mb-4 text-sm text-text-secondary">Record the approved BAC composition and quorum. Committee attendance is confirmed separately for every decision. Changes are recorded in the Audit Trail.</p>
    <Link className="mb-5 inline-block text-sm font-semibold text-info underline" to="/admin/settings/thresholds">Manage Applicable Limits →</Link>
    {policy && <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[['membershipCount', 'Official BAC signatories', 3, 15], ['quorumCount', 'Members required for quorum', 3, policy.membershipCount], ['requiredFailedAttempts', 'Failed attempts before negotiated review', 2, 10]].map(([key, label, min, max]) => <label key={key} className="text-xs text-text-secondary">{label}<input className={fieldClass} type="number" required min={min} max={max} value={policy[key]} onChange={(event) => setPolicy({ ...policy, [key]: Number(event.target.value) })} /></label>)}
      </div>
      <fieldset className="space-y-2 rounded border border-border-muted p-4"><legend className="px-1 text-sm font-semibold">Official signatories and positions</legend>
        {data.committeeCandidates.map((member) => <label key={member.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={policy.memberIds.includes(member.id)} onChange={(event) => setPolicy({ ...policy, memberIds: event.target.checked ? [...policy.memberIds, member.id] : policy.memberIds.filter((id) => id !== member.id) })} /><span>{positions[member.role]} — {member.name}</span></label>)}
        {!data.committeeCandidates.length && <p className="text-sm text-warning">Create active BAC Chairperson, Vice-Chairperson, and Member accounts in User Management before assigning signatories.</p>}
        <p className="text-xs text-text-faint">Selected: {policy.memberIds.length}. One Chairperson and one Vice-Chairperson are required; remaining positions are BAC Members.</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.requirePresidingOfficer} onChange={(event) => setPolicy({ ...policy, requirePresidingOfficer: event.target.checked })} />Require an attending presiding Chairperson or Vice-Chairperson</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.requireFailureDocuments} onChange={(event) => setPolicy({ ...policy, requireFailureDocuments: event.target.checked })} />Require supporting documents for failed procurement and eligibility review</label>
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save approved procurement settings'}</Button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-success">{message}</p>}
  </Card>
}
