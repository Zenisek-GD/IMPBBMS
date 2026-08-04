import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import {
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword,
} from '../api/auth'
import { forgotPasswordSchema, newPasswordSchema } from '../config/validation'
import AuthLayout from '../layouts/AuthLayout'
import FormField from '../components/ui/FormField'
import OtpInput from '../components/ui/OtpInput'

// ─────────────────────────────────────────────────────────────────────────────
// Password recovery, in three steps on one page (workflow requirement 9):
//
//   email  → a 6-digit code is sent to the registered address
//   code   → verified, which returns a one-time ticket
//   password → set with that ticket
//
// This replaces the old emailed reset link. A link is a bearer credential that
// ends up in mail clients, proxy logs and browser history; a code typed into the
// page that requested it does not travel anywhere else, and it is useless after
// five minutes.
//
// Note that step 1 gives the same answer whether or not the address has an
// account. It has to: otherwise this page would be a way to find out which
// businesses and officials hold accounts here. The consequence is that a typo
// takes you to step 2 as though it had worked — which is why the address is shown
// back on that screen.
// ─────────────────────────────────────────────────────────────────────────────

const CODE_LENGTH = 6

function Notice({ tone = 'danger', children }) {
  const tones = {
    danger: 'border-danger/25 bg-danger/10 text-danger',
    info: 'border-border-muted bg-chip text-text-secondary',
  }
  return (
    <p role="alert" className={`rounded-md border px-3 py-2 text-[12.5px] leading-relaxed ${tones[tone]}`}>
      {children}
    </p>
  )
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [ticket, setTicket] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [serverError, setServerError] = useState('')
  const [notice, setNotice] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [done, setDone] = useState(false)

  const emailForm = useForm({ resolver: zodResolver(forgotPasswordSchema), mode: 'onBlur' })
  const passwordForm = useForm({ resolver: zodResolver(newPasswordSchema), mode: 'onBlur' })

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const onRequest = async ({ email: submitted }) => {
    setServerError('')
    try {
      const data = await requestPasswordReset(submitted)
      setEmail(submitted)
      // Absent when the address has no active account — the response is otherwise
      // identical, which is the whole point. The code screen is shown either way.
      setChallenge(data.challenge ?? null)
      setNotice(data.message)
      setCode('')
      setCodeError('')
      setStep('code')
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const submitCode = async (submitted) => {
    if (submitted.length !== CODE_LENGTH || verifying) return
    setVerifying(true)
    setCodeError('')
    try {
      const data = await verifyPasswordResetCode(email, challenge?.reference ?? '', submitted)
      setTicket({ reference: data.reference, ticket: data.ticket })
      setNotice('')
      setStep('password')
    } catch (err) {
      setCode('')
      setCodeError(err.response?.data?.message ?? 'That code is incorrect or has expired.')
    } finally {
      setVerifying(false)
    }
  }

  const resend = async () => {
    setResending(true)
    setCodeError('')
    try {
      const data = await requestPasswordReset(email)
      setChallenge(data.challenge ?? null)
      setCode('')
      setNotice(data.message)
    } catch (err) {
      setCodeError(err.response?.data?.message ?? 'Could not send a new code.')
    } finally {
      setResending(false)
    }
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const onSetPassword = async ({ password }) => {
    setServerError('')
    try {
      await resetPassword({ email, reference: ticket.reference, ticket: ticket.ticket, password })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password updated">
        <div className="flex flex-col items-start gap-4">
          <CheckCircle2 size={30} className="text-success" />
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Your password has been changed and any other session has been signed out. Redirecting you
            to sign in…
          </p>
          <Link to="/login" className="text-[12.5px] font-medium text-navy hover:underline">
            Go to sign in now →
          </Link>
        </div>
      </AuthLayout>
    )
  }

  // ── Step 3 view ───────────────────────────────────────────────────────────
  if (step === 'password') {
    return (
      <AuthLayout
        title="Set a new password"
        subtitle="Your email address is verified. Choose a new password."
      >
        <form onSubmit={passwordForm.handleSubmit(onSetPassword)} noValidate className="flex flex-col gap-4">
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
            error={passwordForm.formState.errors.password?.message}
            registration={passwordForm.register('password')}
          />
          <FormField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={passwordForm.formState.errors.confirmPassword?.message}
            registration={passwordForm.register('confirmPassword')}
          />

          {serverError && <Notice>{serverError}</Notice>}

          <button
            type="submit"
            disabled={passwordForm.formState.isSubmitting}
            className="mt-1 w-full rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {passwordForm.formState.isSubmitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </AuthLayout>
    )
  }

  // ── Step 2 view ───────────────────────────────────────────────────────────
  if (step === 'code') {
    return (
      <AuthLayout
        title="Enter your verification code"
        subtitle={`If ${email} has an account, a 6-digit code is on its way. It expires in ${
          challenge?.expiresInMinutes ?? 5
        } minutes.`}
      >
        <div className="flex flex-col gap-4">
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={verifying}
            error={codeError}
          />

          {notice && !codeError && <Notice tone="info">{notice}</Notice>}

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
                <ShieldCheck size={15} /> Verify code
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
                setStep('email')
                setCodeError('')
                setNotice('')
              }}
              className="text-text-secondary hover:text-navy hover:underline"
            >
              ← Use a different email
            </button>
          </div>

          <p className="border-t border-border-muted pt-4 text-[11.5px] leading-relaxed text-text-faint">
            No code arriving? Check your spam folder, and check the address above for typos. Accounts
            that have never been activated cannot be recovered this way — ask the BAC Secretariat for
            a new invitation instead.
          </p>
        </div>
      </AuthLayout>
    )
  }

  // ── Step 1 view ───────────────────────────────────────────────────────────
  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your account email and we'll send a 6-digit verification code."
      footer={
        <Link to="/login" className="font-medium text-navy hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <form onSubmit={emailForm.handleSubmit(onRequest)} noValidate className="flex flex-col gap-4">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={emailForm.formState.errors.email?.message}
          registration={emailForm.register('email')}
        />

        {serverError && <Notice>{serverError}</Notice>}

        <button
          type="submit"
          disabled={emailForm.formState.isSubmitting}
          className="mt-1 w-full rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {emailForm.formState.isSubmitting ? 'Sending…' : 'Send verification code'}
        </button>
      </form>
    </AuthLayout>
  )
}
