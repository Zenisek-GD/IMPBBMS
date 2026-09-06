import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { fetchAuthenticationSecurity, updateAuthenticationSecurity } from '../../api/security'
import { fetchCurrentUser } from '../../api/auth'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

export default function AdminSecuritySettings() {
  const [policy, setPolicy] = useState(null)
  const [draft, setDraft] = useState({})
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAuthenticationSecurity()
      .then((data) => {
        if (cancelled) return
        setPolicy(data)
        setDraft(Object.fromEntries(data.roles.map((role) => [role.id, role.twoFactorRequired])))
      })
      .catch(() => { if (!cancelled) setError('Could not load authentication security settings.') })
    return () => { cancelled = true }
  }, [])

  const roles = policy?.roles ?? []
  const changed = roles.filter((role) => draft[role.id] !== role.twoFactorRequired)
  const disabling = changed.filter((role) => !draft[role.id])
  const enabling = changed.filter((role) => draft[role.id])
  const stage = (ids, enabled) => {
    setNotice('')
    setDraft((previous) => ({ ...previous, ...Object.fromEntries(ids.map((id) => [id, enabled])) }))
  }
  const resetDraft = (data) => {
    setPolicy(data)
    setDraft(Object.fromEntries(data.roles.map((role) => [role.id, role.twoFactorRequired])))
    setSelected([])
  }
  const reload = async () => {
    setBusy(true)
    setError('')
    try { resetDraft(await fetchAuthenticationSecurity()) }
    catch (err) { setError(err.response?.data?.message || 'Could not reload security settings.') }
    finally { setBusy(false) }
  }
  const save = async (applyMode = 'nextLogin') => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await updateAuthenticationSecurity({
        roles: changed.map((role) => ({
          id: role.id, twoFactorRequired: draft[role.id], expectedVersion: role.twoFactorVersion,
        })),
        confirmDisable: disabling.length > 0,
        applyMode,
      })
      resetDraft(data)
      setDialog(null)
      setNotice('Security settings saved. ' + (applyMode === 'forceReauthentication'
        ? 'Active sessions for newly enabled roles have been logged out.'
        : 'New requirements will apply on the next login.'))
      if (data.reauthenticationRequired) await fetchCurrentUser()
    } catch (err) {
      setDialog(null)
      setError(err.response?.data?.message || 'Could not save authentication security settings.')
    } finally { setBusy(false) }
  }
  const review = () => {
    if (disabling.length) setDialog('disable')
    else if (enabling.length) setDialog('apply')
  }
  const roleList = (items) => (
    <ul className="my-3 max-h-48 list-disc overflow-y-auto pl-5 text-sm font-medium text-navy">
      {items.map((role) => <li key={role.id}>{role.name}</li>)}
    </ul>
  )

  return (
    <DashboardPage>
      <PageHeader title="Security Settings" subtitle="Manage authentication requirements for procurement system roles." />
      {error && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-danger">{error}</p>
          <Button variant="secondary" disabled={busy} onClick={reload}>Reload Settings</Button>
        </div>
      )}
      {notice && <p role="status" className="mb-4 text-sm text-success">{notice}</p>}
      {!policy ? <p className="text-sm text-text-secondary">{error ? 'Security settings are unavailable.' : 'Loading security settings...'}</p> : (
        <Card title="Authentication Security" icon={ShieldCheck} bodyClassName="p-5">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="font-semibold text-navy">Two-Factor Authentication by Role</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Choose which procurement system roles are required to verify their identity using an authenticator application.
              </p>
              <p className="mt-3 rounded-lg bg-chip p-3 text-sm font-medium text-navy">
                {policy.requiredRoleCount} of {roles.length} roles currently require Two-Factor Authentication
              </p>
            </div>
            <fieldset disabled={busy || Boolean(dialog)} className="min-w-0">
              <legend className="mb-2 text-sm font-semibold text-navy">Select Roles Requiring Two-Factor Authentication</legend>
              <p className="mb-3 text-sm text-text-secondary">
                Select roles for a bulk action, or change individual switches. Changes take effect only after you save and confirm.
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setSelected(roles.map((role) => role.id))}>Select All</Button>
                <Button variant="secondary" disabled={!selected.length} onClick={() => setSelected([])}>Clear Selection</Button>
                <Button variant="secondary" disabled={!selected.length} onClick={() => stage(selected, true)}>Enable 2FA for Selected Roles</Button>
                <Button variant="secondary" disabled={!selected.length} onClick={() => stage(selected, false)}>Disable 2FA for Selected Roles</Button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border-muted">
                <table className="w-full text-left text-sm">
                  <thead className="bg-chip text-navy">
                    <tr>
                      <th scope="col" className="p-3">Select</th>
                      <th scope="col" className="p-3">Role</th>
                      <th scope="col" className="p-3">Current Status</th>
                      <th scope="col" className="p-3">Require 2FA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => (
                      <tr key={role.id} className="border-t border-border-muted">
                        <td className="p-3">
                          <input type="checkbox" aria-label={'Select ' + role.name}
                            checked={selected.includes(role.id)}
                            onChange={(event) => setSelected((previous) => event.target.checked
                              ? [...previous, role.id] : previous.filter((id) => id !== role.id))}
                            className="h-4 w-4 accent-navy" />
                        </td>
                        <th scope="row" className="p-3 font-medium text-navy">{role.name}</th>
                        <td className="p-3">
                          <span className={role.twoFactorRequired ? 'text-success' : 'text-text-secondary'}>
                            {role.twoFactorRequired ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td className="p-3">
                          <button type="button" role="switch" aria-checked={draft[role.id]}
                            aria-label={'Require 2FA for ' + role.name}
                            onClick={() => stage([role.id], !draft[role.id])}
                            className={'min-w-20 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50 ' +
                              (draft[role.id] ? 'bg-accent text-accent-fg' : 'bg-chip text-text-secondary')}>
                            {draft[role.id] ? 'ON' : 'OFF'}
                          </button>
                          {draft[role.id] !== role.twoFactorRequired && <span className="ml-2 text-xs text-warning">Unsaved</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-sm text-text-secondary">{changed.length} unsaved role change(s)</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy || !changed.length || Boolean(dialog)} onClick={() => resetDraft(policy)}>Discard Changes</Button>
                <Button disabled={busy || !changed.length || Boolean(dialog)} onClick={review}>Save Security Settings</Button>
              </div>
            </div>
            <div className="grid gap-5 border-t border-border-muted pt-5 sm:grid-cols-2">
              <div>
                <h3 className="font-semibold text-navy">Trusted 2FA Duration</h3>
                <p className="mt-1 font-medium text-navy">30 Minutes</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Required roles can skip another authenticator code only in the browser where verification succeeded.
                  Logging out and signing in again preserve the original trust expiration.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-navy">Automatic Session Logout</h3>
                <p className="mt-1 font-medium text-navy">30 Minutes</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Every authenticated session expires after 30 minutes, including roles with 2FA disabled.
                  Session expiration is separate from browser trust.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
      {dialog === 'disable' && (
        <Modal title={disabling.length === 1 ? 'Disable Two-Factor Authentication?' : 'Disable 2FA for Selected Roles?'}
          onClose={() => { if (!busy) setDialog(null) }}>
          <p className="text-sm text-text-secondary">The following roles will no longer require authenticator verification:</p>
          {roleList(disabling)}
          <p className="text-sm text-text-secondary">Users assigned to these roles will no longer need an Authenticator Code during login. Existing browser trust for these roles will be revoked.</p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => enabling.length ? setDialog('apply') : save()}>
              {busy ? 'Saving...' : disabling.length === 1 ? 'Disable 2FA' : 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'apply' && (
        <Modal title="Apply Security Change" onClose={() => { if (!busy) setDialog(null) }}>
          <p className="text-sm text-text-secondary">Two-Factor Authentication will be enabled for:</p>
          {roleList(enabling)}
          <p className="text-sm text-text-secondary">
            Apply on the next login to let current sessions finish, or log out active users in these roles now.
            If your role is included, forcing re-authentication also logs you out.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={busy} onClick={() => save('nextLogin')}>Apply on Next Login</Button>
            <Button variant="danger" disabled={busy} onClick={() => save('forceReauthentication')}>Force Re-Authentication Now</Button>
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}
