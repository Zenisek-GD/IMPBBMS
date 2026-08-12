import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, KeyRound, ArrowLeft, AlertCircle } from 'lucide-react'
import * as authApi from '../api/auth'
import AuthLayout from '../layouts/AuthLayout'

// The second step of signing in. Reached only after the password was accepted,
// at which point the server holds a short-lived pending state and no session —
// so nothing on this screen is behind a login, and nothing it can do grants
// access on its own.

export default function MfaChallenge({ challenge, onVerified, onCancel }) {
  const [token, setToken] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [useRecovery])

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      const user = await authApi.verifyMfaChallenge(
        useRecovery ? { recoveryCode } : { token }
      )
      onVerified(user)
    } catch (err) {
      const data = err.response?.data
      setError(data?.message ?? 'That code was not accepted.')
      // Clear the field: the code is now spent either way, and leaving it there
      // invites the user to press enter again and be told the same thing.
      setToken('')
      setRecoveryCode('')
      // 440 is the expiry of the pending state — the sign-in has to start over.
      if (err.response?.status === 440) setTimeout(onCancel, 2500)
    } finally {
      setBusy(false)
    }
  }

  const ready = useRecovery ? recoveryCode.trim().length >= 16 : token.length === 6

  return (
    <AuthLayout
      title="Enter your code"
      subtitle={`Signed in as ${challenge.name}. One more step.`}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {useRecovery ? (
          <label className="block text-xs text-text-secondary">
            Recovery code
            <input
              ref={inputRef}
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === 'Enter' && ready && submit()}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              className="mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-center font-mono text-sm tracking-widest text-navy focus:border-navy focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-text-faint">
              Each recovery code works once. Using one here will spend it.
            </span>
          </label>
        ) : (
          <label className="block text-xs text-text-secondary">
            Six-digit code from your authenticator app
            <input
              ref={inputRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => event.key === 'Enter' && ready && submit()}
              placeholder="000000"
              className="mt-1 w-full rounded border border-border-muted bg-surface px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-navy focus:border-navy focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-text-faint">
              The code changes every 30 seconds and can only be used once.
            </span>
          </label>
        )}

        <button
          type="button"
          disabled={!ready || busy}
          onClick={submit}
          className="flex items-center justify-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
        >
          <ShieldCheck size={14} />
          {busy ? 'CHECKING…' : 'SIGN IN'}
        </button>

        <div className="flex items-center justify-between text-[11.5px]">
          {challenge.recoveryAvailable && (
            <button
              type="button"
              onClick={() => {
                setUseRecovery((v) => !v)
                setError('')
              }}
              className="flex items-center gap-1.5 font-medium text-navy hover:underline"
            >
              <KeyRound size={12} />
              {useRecovery ? 'Use my authenticator app' : 'Lost your phone? Use a recovery code'}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-text-faint hover:text-navy hover:underline"
          >
            <ArrowLeft size={12} /> Back
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}
