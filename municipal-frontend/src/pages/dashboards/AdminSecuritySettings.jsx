import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { fetchAuthenticationSecurity, updateAuthenticationSecurity } from '../../api/security'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

export default function AdminSecuritySettings() {
  const [policy, setPolicy] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAuthenticationSecurity()
      .then((data) => { if (!cancelled) setPolicy(data) })
      .catch(() => { if (!cancelled) setError('Could not load authentication security settings.') })
    return () => { cancelled = true }
  }, [])

  const update = async (enabled) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setPolicy(await updateAuthenticationSecurity(enabled, !enabled))
      setConfirming(false)
      setNotice(`Two-factor authentication is now ${enabled ? 'ON' : 'OFF'}.`)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save authentication security settings.')
    } finally { setBusy(false) }
  }

  return (
    <DashboardPage>
      <PageHeader title="Security Settings" subtitle="Manage authentication security for all user accounts." />
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm text-success">{notice}</p>}
      {!policy ? <p className="text-sm text-text-secondary">Loading security settings…</p> : (
        <Card title="Authentication Security" icon={ShieldCheck} bodyClassName="p-5">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-6">
              <div>
                <h2 className="font-semibold text-navy">Two-Factor Authentication</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Require users to verify their identity using an authenticator application.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={policy.twoFactorEnabled}
                aria-label="Two-Factor Authentication"
                disabled={busy}
                onClick={() => policy.twoFactorEnabled ? setConfirming(true) : update(true)}
                className={`min-w-20 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50 ${policy.twoFactorEnabled ? 'bg-accent text-accent-fg' : 'bg-chip text-text-secondary'}`}
              >
                {policy.twoFactorEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="border-t border-border-muted pt-5">
              <h2 className="font-semibold text-navy">Trusted 2FA Duration</h2>
              <p className="mt-1 font-medium text-navy">30 Minutes</p>
              <p className="mt-1 text-sm text-text-secondary">
                After successful 2FA verification, the same browser/device will not be asked for another authenticator code for 30 minutes.
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                Logging out preserves this verification until its original expiration. Signing in again does not extend it.
              </p>
            </div>
            <div className="border-t border-border-muted pt-5">
              <h2 className="font-semibold text-navy">Session Duration</h2>
              <p className="mt-1 font-medium text-navy">30 Minutes</p>
              <p className="mt-1 text-sm text-text-secondary">Automatically log authenticated users out after 30 minutes.</p>
            </div>
            <dl className="grid gap-3 rounded-lg bg-chip p-4 text-sm sm:grid-cols-2">
              <dt>Require 2FA on New Device</dt><dd className="font-medium">{policy.twoFactorEnabled ? 'Enabled' : 'Disabled'}</dd>
              <dt>Trusted 2FA Duration</dt><dd className="font-medium">30 Minutes</dd>
              <dt>Automatic Session Logout</dt><dd className="font-medium">Enabled</dd>
            </dl>
          </div>
        </Card>
      )}
      {confirming && (
        <Modal title="Disable Two-Factor Authentication?" onClose={() => { if (!busy) setConfirming(false) }}>
          <p className="text-sm text-text-secondary">
            Users will no longer be required to enter authenticator codes when signing in.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => update(false)}>
              {busy ? 'Disabling…' : 'Disable 2FA'}
            </Button>
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}
