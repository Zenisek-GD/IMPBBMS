import { useEffect, useState } from 'react'
import { fetchBacCommittee } from '../../api/bidding'

export default function BacAttendance({ value, onChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    fetchBacCommittee().then((result) => { if (active) setData(result) })
      .catch((err) => { if (active) setError(err.response?.data?.message ?? 'Could not load the BAC committee.') })
    return () => { active = false }
  }, [])
  const ids = value.attendingMemberIds ?? []
  const quorum = data?.policy?.quorumCount
  const complete = data && data.committee.length === Number(data.policy.membershipCount)
  const satisfied = complete && ids.length >= Number(quorum) && (!data.policy.requirePresidingOfficer || Boolean(value.presidingMemberId))
  return (
    <fieldset className="space-y-2 rounded border border-border-muted bg-sidebar p-3">
      <legend className="px-1 text-sm font-semibold text-navy">Participating BAC members</legend>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!data && !error && <p className="text-sm text-text-faint">Loading official signatories…</p>}
      {data?.committee.map((member) => (
        <label key={member.id} className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" checked={ids.includes(member.id)} onChange={(event) => {
            const next = event.target.checked ? [...ids, member.id] : ids.filter((id) => id !== member.id)
            onChange({ ...value, attendingMemberIds: next, presidingMemberId: next.includes(Number(value.presidingMemberId)) ? value.presidingMemberId : '' })
          }} />
          <span>{member.position} — {member.name}</span>
          <span className="ml-auto text-xs text-text-secondary">{ids.includes(member.id) ? 'Present' : 'Absent'}</span>
        </label>
      ))}
      {data && <>
        <label className="block text-xs text-text-secondary">Presiding officer
          <select className="mt-1 w-full rounded border border-border-muted bg-surface p-2 text-sm text-navy" value={value.presidingMemberId ?? ''}
            onChange={(event) => onChange({ ...value, presidingMemberId: event.target.value ? Number(event.target.value) : '' })}>
            <option value="">Select the presiding officer</option>
            {data.committee.filter((member) => ids.includes(member.id) && /chair/i.test(member.position)).map((member) => <option key={member.id} value={member.id}>{member.position} — {member.name}</option>)}
          </select>
        </label>
        <p className={`text-xs ${satisfied ? 'text-success' : 'text-warning'}`} role="status">
          {ids.length} present; {quorum} required. {satisfied ? 'Configured quorum is satisfied.' : 'BAC action cannot be finalized because the required quorum has not been met.'}
        </p>
        {!complete && <p className="text-xs text-danger">The official BAC composition must be completed in Procurement Settings before finalization.</p>}
      </>}
    </fieldset>
  )
}
