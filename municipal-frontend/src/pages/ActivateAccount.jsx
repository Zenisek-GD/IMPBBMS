import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react'
import {
  verifyActivationLink,
  startActivation,
  confirmActivation,
  resendActivationCode,
} from '../api/activation'
import { activationSetupSchema } from '../config/validation'
import AuthLayout from '../layouts/AuthLayout'
import FormField from '../components/ui/FormField'
import OtpInput from '../components/ui/OtpInput'

// ─────────────────────────────────────────────────────────────────────────────
// Where an invited bidder lands. Two steps behind one link:
//
//   setup   — choose a password, optionally adjust the display name
//   verify  — enter the 6-digit code emailed to the accredited address
//
// The chosen password is held in component state between the two steps and sent
// again with the code, because the server refuses to store it until the mailbox
// has been proved. That is the point of the design, not an inefficiency: there is
// no window in which the system holds a password it has not yet been authorised
// to keep.
// ─────────────────────────────────────────────────────────────────────────────

const CODE_LENGTH = 6

function Notice({ tone = 'danger', children }) {
  const tones = {
    danger: 'border-danger/25 bg-danger/10 text-danger',
    warning: 'border-warning/25 bg-warning/10 text-warning',
    info: 'border-border-muted bg-chip text-text-secondary',
  }
  return (
    <p role="alert" className={`rounded-md border px-3 py-2 text-[12.5px] leading-relaxed ${tones[tone]}`}>
      {children}
    </p>
  )
}

export default function ActivateAccount() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  // A missing token is knowable during render, so only a present-but-unchecked
  // token needs the round trip.
  const [linkState, setLinkState] = useState(token ? 'checking' : 'invalid')
  const [linkError, setLinkError] = useState('')
  const [account, setAccount] = useState(null)

  const [step, setStep] = useState('setup')
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [serverError, setServerError] = useState('')
  const [notice, setNotice] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [done, setDone] = useState(false)

  // The password chosen at step 1, held until step 2 submits it with the code.
  // Cleared the moment the server has taken it.
  const [chosen, setChosen] = useState({ password: '', displayName: '' })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(activationSetupSchema), mode: 'onBlur' })

  useEffect(() => {
    if (!token) return
    let cancelled = false
    verifyActivationLink(token)
      .then((data) => {
        if (cancelled) return
        setAccount(data.account)
        setLinkState('valid')
      })
      .catch((err) => {
        if (cancelled) return
        setLinkError(err.response?.data?.message ?? '')
        setLinkState('invalid')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // ── Step 1 → 2 ────────────────────────────────────────────────────────────
  const onSetup = async ({ password, displayName }) => {
    setServerError('')
    try {
      const data = await startActivation(token, password, displayName)
      setChosen({ password, displayName: displayName ?? '' })
      setChallenge(data.challenge)
      setCode('')
      setCodeError('')
      setNotice(data.message)
      setStep('verify')
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const submitCode = async (submitted) => {
    if (submitted.length !== CODE_LENGTH || verifying) return
    setVerifying(true)
    setCodeError('')
    setServerError('')
    try {
      await confirmActivation({
        token,
        reference: challenge.reference,
        code: submitted,
        password: chosen.password,
        displayName: chosen.displayName,
      })
      // The password has been consumed by the server; drop our copy.
      setChosen({ password: '', displayName: '' })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 4000)
    } catch (err) {
      setCode('')
      setCodeError(err.response?.data?.message ?? 'That code could not be verified.')
    } finally {
      setVerifying(false)
    }
  }

  const resend = async () => {
    setResending(true)
    setCodeError('')
    try {
      const data = await resendActivationCode(token)
      setChallenge(data.challenge)
      setCode('')
      setNotice(data.message)
    } catch (err) {
      setCodeError(err.response?.data?.message ?? 'Could not send a new code.')
    } finally {
      setResending(false)
    }
  }

  // ── Link states ───────────────────────────────────────────────────────────

  if (linkState === 'checking') {
    return (
      <AuthLayout title="Checking your invitation…">
        <p className="flex items-center gap-2 text-[13px] text-text-secondary">
          <Loader2 size={15} className="animate-spin" /> One moment.
        </p>
      </AuthLayout>
    )
  }

  if (linkState === 'invalid') {
    return (
      <AuthLayout title="This link cannot be used">
        <div className="flex flex-col items-start gap-4">
          <AlertTriangle size={30} className="text-warning" />
          <p className="text-[13px] leading-relaxed text-text-secondary">
            {linkError ||
              'This activation link is invalid, already used, or has expired. Activation links can be used once and expire within 48 hours of being issued.'}
          </p>
          <p className="text-[12.5px] leading-relaxed text-text-faint">
            Ask the BAC Secretariat to send a new invitation to your registered email address. For
            your protection, an invitation can only be sent to the address your accreditation was
            approved for.
          </p>
          <Link
            to="/login"
            className="rounded-md bg-accent px-4 py-2 text-[12.5px] font-medium text-accent-fg"
          >
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout title="Your account is active">
        <div className="flex flex-col items-start gap-4">
          <CheckCircle2 size={30} className="text-success" />
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Your email address is verified and your account is now active. Sign in with{' '}
            <span className="font-medium text-navy">{account?.email}</span> and the password you just
            set.
          </p>
          <p className="text-[12.5px] text-text-faint">
            The activation link you used has been retired and cannot be used again.
          </p>
          <Link
            to="/login"
            className="rounded-md bg-accent px-4 py-2 text-[12.5px] font-medium text-accent-fg"
          >
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  // A small header shared by both steps, so the bidder can see which account they
  // are activating before they commit to a password.
  const accountSummary = (
    <div className="mb-5 rounded-md border border-border-muted bg-chip px-3 py-2.5">
      {account?.businessName && (
        <p className="text-[12.5px] font-medium text-navy">{account.businessName}</p>
      )}
      <p className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
        <Mail size={12} className="shrink-0" />
        {account?.email}
      </p>
      {account?.referenceCode && (
        <p className="mt-0.5 font-mono text-[10.5px] text-text-faint">{account.referenceCode}</p>
      )}
    </div>
  )

  // ── Step 2: the code ──────────────────────────────────────────────────────

  if (step === 'verify') {
    return (
      <AuthLayout
        title="Confirm your email address"
        subtitle={`Enter the 6-digit code we sent to ${account?.email}. It expires in ${
          challenge?.expiresInMinutes ?? 5
        } minutes.`}
      >
        {accountSummary}

        <div className="flex flex-col gap-4">
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={verifying}
            error={codeError}
          />

          {notice && !codeError && <Notice tone="info">{notice}</Notice>}
          {serverError && <Notice>{serverError}</Notice>}

          <button
            type="button"
            onClick={() => submitCode(code)}
            disabled={verifying || code.length !== CODE_LENGTH}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {verifying ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <ShieldCheck size={15} /> Verify and activate
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-[12px]">
            <button
              type="button"
              onClick={resend}
              disabled={resending}
              className="font-medium text-navy hover:underline disabled:opacity-60"
            >
              {resending ? 'Sending…' : 'Send a new code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('setup')
                setCodeError('')
                setNotice('')
              }}
              className="text-text-secondary hover:text-navy hover:underline"
            >
              ← Change my password
            </button>
          </div>

          <p className="border-t border-border-muted pt-4 text-[11.5px] leading-relaxed text-text-faint">
            Nobody from the LGU or the Bids and Awards Committee will ever ask you for this code. If
            you did not expect this email, do not enter it — tell the BAC Secretariat instead.
          </p>
        </div>
      </AuthLayout>
    )
  }

  // ── Step 1: password and display name ─────────────────────────────────────

  return (
    <AuthLayout
      title="Set up your bidder account"
      subtitle="Choose a password only you know. We will then email a code to confirm your address."
    >
      {accountSummary}

      <form onSubmit={handleSubmit(onSetup)} noValidate className="flex flex-col gap-4">
        <FormField
          label="Display name (optional)"
          type="text"
          autoComplete="name"
          placeholder={account?.displayName}
          hint="How your name appears in the system. Leave blank to keep what the BAC Secretariat entered."
          error={errors.displayName?.message}
          registration={register('displayName')}
        />

        <FormField
          label="Create a password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          error={errors.password?.message}
          registration={register('password')}
        />

        <FormField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          registration={register('confirmPassword')}
        />

        {serverError && <Notice>{serverError}</Notice>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Sending code…
            </>
          ) : (
            'Continue'
          )}
        </button>

        <p className="text-[11.5px] leading-relaxed text-text-faint">
          Your password is not saved until you confirm the code — we never hold it while we wait.
          Nobody at the LGU can see it, now or later.
        </p>
      </form>
    </AuthLayout>
  )
}
