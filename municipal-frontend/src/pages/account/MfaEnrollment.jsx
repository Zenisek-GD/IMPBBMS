import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Smartphone, KeyRound, Copy, Check, AlertTriangle, Download } from 'lucide-react'
import * as authApi from '../../api/auth'
import { useAuth } from '../../context/useAuth'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

// ── SETTING UP THE SECOND FACTOR ─────────────────────────────────────────────
// Three steps, in this order for a reason: scan, prove, then save the recovery
// codes. The proof comes before the codes because an enrolment that was never
// confirmed does not need them, and showing codes for a secret the user failed
// to scan would leave them holding credentials for an account they cannot reach.
//
// The recovery codes are displayed exactly once. They are stored hashed, so
// there is no second chance to see them — which is why this screen refuses to
// move on until the user has actually taken them.

const inputClass =
  'w-full rounded border border-border-muted bg-surface px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none'

function CodeInput({ value, onChange, onSubmit, autoFocus, label = 'Six-digit code' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  return (
    <label className="block text-xs text-text-secondary">
      {label}
      <input
        ref={ref}
        // `inputMode` and `autoComplete` between them make a phone show a
        // numeric pad and offer the code from the OS clipboard, which is where
        // most people will have just copied it from.
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.length === 6) onSubmit?.()
        }}
        placeholder="000000"
        className={`mt-1 text-center font-mono text-lg tracking-[0.4em] ${inputClass}`}
      />
    </label>
  )
}

export function RecoveryCodeList({ codes, onAcknowledge }) {
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const asText = codes.join('\n')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 p-3">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-[13px] text-text-secondary">
          <strong className="text-navy">Save these now.</strong> They are stored hashed, so this is the only
          time they can be shown. Each one signs you in once if you lose your phone — without them, only a
          System Administrator can get you back in.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded border border-border-muted bg-chip/40 p-4 font-mono text-[13px] text-navy">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={async () => {
            await navigator.clipboard.writeText(asText)
            setCopied(true)
            setSaved(true)
          }}
        >
          {copied ? 'COPIED' : 'COPY'}
        </Button>
        <Button
          variant="secondary"
          icon={Download}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([asText], { type: 'text/plain' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'procurenance-recovery-codes.txt'
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            setSaved(true)
          }}
        >
          DOWNLOAD
        </Button>
        {onAcknowledge && (
          <Button icon={ShieldCheck} disabled={!saved} onClick={onAcknowledge}>
            I HAVE SAVED THEM
          </Button>
        )}
      </div>
      {onAcknowledge && !saved && (
        <p className="text-[11px] text-text-faint">Copy or download the codes before continuing.</p>
      )}
    </div>
  )
}

export default function MfaEnrollment() {
  const { setUser } = useAuth()
  const [enrollment, setEnrollment] = useState(null)
  const [token, setToken] = useState('')
  const [codes, setCodes] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Guarded because React's development double-mount would otherwise fire two
  // concurrent enrolments. The server is now safe against that race too, but
  // issuing two secrets and showing the QR for whichever landed second is a
  // confusing way to start.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    authApi
      .beginMfaEnrollment()
      .then(setEnrollment)
      .catch((err) => setError(err.response?.data?.message ?? 'Could not start enrolment.'))
  }, [])

  const confirm = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await authApi.confirmMfaEnrollment(token)
      setCodes(result.recoveryCodes)
    } catch (err) {
      setError(err.response?.data?.message ?? 'That code was not accepted.')
      setToken('')
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    // Re-read the session so the app learns the enrolment requirement has been
    // satisfied and stops routing back here.
    setUser(await authApi.fetchCurrentUser())
  }

  return (
    <DashboardPage>
      <PageHeader
        title="Set up two-factor authentication"
        subtitle="Every account here can approve spending, issue documents under the municipality's name, or read the whole procurement record. A password alone is not enough."
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {codes ? (
        <Card title="Save your recovery codes" icon={KeyRound} bodyClassName="p-4">
          <RecoveryCodeList codes={codes} onAcknowledge={finish} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="1. Scan this with your authenticator app" icon={Smartphone} bodyClassName="p-4">
            <p className="mb-3 text-[13px] text-text-secondary">
              Google Authenticator, Microsoft Authenticator, Authy, 1Password — any of them. Open the app,
              add an account, and point the camera here.
            </p>

            {enrollment ? (
              <>
                <div className="flex justify-center rounded border border-border-muted bg-white p-4">
                  <img src={enrollment.qrDataUri} alt="Enrolment QR code" width={220} height={220} />
                </div>

                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="mt-3 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                >
                  {showSecret ? 'HIDE THE KEY' : "CAN'T SCAN? SHOW THE KEY"}
                </button>

                {showSecret && (
                  <div className="mt-2 rounded border border-border-muted bg-chip/40 p-3">
                    <p className="mb-1 text-[11px] text-text-faint">
                      Type this into the app instead. Account: {enrollment.account}
                    </p>
                    <p className="font-mono text-[13px] break-all text-navy">
                      {enrollment.secret.match(/.{1,4}/g).join(' ')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[13px] text-text-faint">Preparing your enrolment…</p>
            )}
          </Card>

          <Card title="2. Enter the code it shows" icon={ShieldCheck} bodyClassName="p-4">
            <p className="mb-3 text-[13px] text-text-secondary">
              This proves the app has your key. Nothing changes until it does — if the scan failed, you can
              simply start again.
            </p>
            <CodeInput value={token} onChange={setToken} onSubmit={confirm} autoFocus={Boolean(enrollment)} />
            <Button
              className="mt-3"
              icon={ShieldCheck}
              disabled={token.length !== 6 || busy || !enrollment}
              onClick={confirm}
            >
              {busy ? 'CHECKING…' : 'TURN ON TWO-FACTOR'}
            </Button>
            <p className="mt-3 text-[11px] text-text-faint">
              The code changes every 30 seconds. If it is rejected, wait for the next one — a code can only
              be used once.
            </p>
          </Card>
        </div>
      )}
    </DashboardPage>
  )
}

export { CodeInput }
