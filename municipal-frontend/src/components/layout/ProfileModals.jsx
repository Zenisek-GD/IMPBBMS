import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react'
import {
  requestPasswordChange,
  verifyPasswordChangeCode,
  changeOwnPassword,
  requestProfileUpdate,
  verifyProfileUpdateCode,
  updateProfile,
} from '../../api/auth'
import { passwordSchema } from '../../config/validation'
import { useAuth } from '../../context/useAuth'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import FormField from '../ui/FormField'
import Badge from '../ui/Badge'
import OtpInput from '../ui/OtpInput'

const CODE_LENGTH = 6

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-border-muted py-2 last:border-0">
    <span className="text-[13px] text-text-secondary">{label}</span>
    <span className="text-right text-[13px] font-medium text-navy">{value ?? '—'}</span>
  </div>
)

const ErrorNote = ({ children }) =>
  children ? (
    <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
      {children}
    </p>
  ) : null

// ── Shared code step ────────────────────────────────────────────────────────
// Both flows below need the same thing: show six boxes, submit on completion,
// offer a resend, explain what is going on. Kept in one place so the two cannot
// drift apart.
function CodeStep({ sentTo, expiresInMinutes, code, setCode, error, busy, onSubmit, onResend, onBack }) {
  const [resending, setResending] = useState(false)

  const resend = async () => {
    setResending(true)
    try {
      await onResend()
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-md border border-border-muted bg-chip px-3 py-2.5 text-[12.5px] leading-relaxed text-text-secondary">
        <Mail size={14} className="mt-0.5 shrink-0" />
        <span>
          We sent a 6-digit code to <span className="font-medium text-navy">{sentTo}</span>. It expires
          in {expiresInMinutes ?? 5} minutes.
        </span>
      </p>

      <OtpInput value={code} onChange={setCode} onComplete={onSubmit} disabled={busy} error={error} />

      <div className="flex items-center justify-between text-[12px]">
        <button
          type="button"
          onClick={resend}
          disabled={resending || busy}
          className="font-medium text-navy hover:underline disabled:opacity-60"
        >
          {resending ? 'Sending…' : 'Send a new code'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-text-secondary hover:text-navy hover:underline"
        >
          ← Back
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSubmit(code)}
          disabled={busy || code.length !== CODE_LENGTH}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-accent-fg disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Verifying…
            </>
          ) : (
            <>
              <ShieldCheck size={14} /> Verify code
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────────────

const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'A display name is required')
    .max(190, 'That display name is too long'),
})

export function ProfileModal({ onClose }) {
  const { user, setUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [step, setStep] = useState('form')
  const [challenge, setChallenge] = useState(null)
  const [pendingName, setPendingName] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(displayNameSchema),
    mode: 'onBlur',
    defaultValues: { displayName: user?.name ?? '' },
  })

  const start = async ({ displayName }) => {
    setServerError('')
    try {
      const data = await requestProfileUpdate(displayName)
      setPendingName(displayName)
      setChallenge(data.challenge)
      setCode('')
      setCodeError('')
      setStep('code')
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong.')
    }
  }

  const submitCode = async (submitted) => {
    if (submitted.length !== CODE_LENGTH || busy) return
    setBusy(true)
    setCodeError('')
    try {
      const verified = await verifyProfileUpdateCode(challenge.reference, submitted)
      const updated = await updateProfile({
        displayName: pendingName,
        reference: verified.reference,
        ticket: verified.ticket,
      })
      // The session user carries the name shown across the shell, so it has to be
      // refreshed here rather than waiting for the next full page load.
      setUser?.(updated)
      setDone(true)
    } catch (err) {
      setCode('')
      setCodeError(err.response?.data?.message ?? 'That code could not be verified.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Modal title="Profile updated" onClose={onClose}>
        <div className="flex flex-col items-start gap-3">
          <CheckCircle2 size={28} className="text-success" />
          <p className="text-[13px] text-text-secondary">Your display name has been changed.</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  if (editing && step === 'code') {
    return (
      <Modal
        title="Confirm this change"
        subtitle="Profile changes are confirmed by email."
        onClose={onClose}
      >
        <CodeStep
          sentTo={challenge?.sentTo}
          expiresInMinutes={challenge?.expiresInMinutes}
          code={code}
          setCode={setCode}
          error={codeError}
          busy={busy}
          onSubmit={submitCode}
          onResend={() => start({ displayName: pendingName })}
          onBack={() => setStep('form')}
        />
      </Modal>
    )
  }

  if (editing) {
    return (
      <Modal title="Edit display name" onClose={onClose}>
        <form onSubmit={handleSubmit(start)} noValidate className="flex flex-col gap-4">
          <FormField
            label="Display name"
            error={errors.displayName?.message}
            registration={register('displayName')}
          />

          {/* Explained rather than simply disabled, because "why can't I change my
              email?" is the obvious next question and the answer is a real one. */}
          <div className="rounded-md border border-border-muted bg-chip px-3 py-2.5">
            <p className="text-[11px] tracking-[0.04em] text-text-faint uppercase">Email address</p>
            <p className="mt-0.5 text-[13px] font-medium text-navy">{user?.email}</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-faint">
              This is your accredited address and cannot be changed here. It is the channel your
              account was approved against and the one every notice and verification code goes to —
              only the BAC Secretariat can change it, on a reviewed registration.
            </p>
          </div>

          <ErrorNote>{serverError}</ErrorNote>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-accent-fg disabled:opacity-60"
            >
              {isSubmitting ? 'Sending code…' : 'Continue'}
            </button>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Modal title="My Profile" onClose={onClose}>
      <Row label="Name" value={user?.name} />
      <Row label="Email" value={user?.email} />
      <Row label="Role" value={user?.roleName} />
      <Row label="Department" value={user?.departmentName ?? 'External to the LGU'} />

      <div className="mt-4">
        <p className="mb-2 text-[11px] tracking-[0.03em] text-text-faint uppercase">
          Permissions ({user?.permissions?.length ?? 0})
        </p>
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {(user?.permissions ?? []).map((permission) => (
            <Badge key={permission} tone="info">
              {permission}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-faint">
          Roles, departments and email addresses are managed by the System Administrator. Contact them
          if any of this is wrong.
        </p>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={() => setEditing(true)}>Edit display name</Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Password change (workflow requirement 10)
//
// Three steps: prove the current password and a code is sent; enter the code;
// then the new password is saved. The new password is not submitted until the
// last call, so the system never holds it while waiting for verification.
// ─────────────────────────────────────────────────────────────────────────────

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'The new password must be different.',
    path: ['newPassword'],
  })

export function ChangePasswordModal({ onClose }) {
  const [step, setStep] = useState('form')
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Held between steps because the server refuses to store the new password
  // before the mailbox has been proved. Cleared as soon as it is spent.
  const [pending, setPending] = useState({ currentPassword: '', newPassword: '' })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(changePasswordSchema), mode: 'onBlur' })

  const start = async ({ currentPassword, newPassword }) => {
    setServerError('')
    try {
      const data = await requestPasswordChange(currentPassword)
      setPending({ currentPassword, newPassword })
      setChallenge(data.challenge)
      setCode('')
      setCodeError('')
      setStep('code')
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong.')
    }
  }

  const submitCode = async (submitted) => {
    if (submitted.length !== CODE_LENGTH || busy) return
    setBusy(true)
    setCodeError('')
    try {
      const verified = await verifyPasswordChangeCode(challenge.reference, submitted)
      await changeOwnPassword({
        currentPassword: pending.currentPassword,
        newPassword: pending.newPassword,
        reference: verified.reference,
        ticket: verified.ticket,
      })
      setPending({ currentPassword: '', newPassword: '' })
      setDone(true)
    } catch (err) {
      setCode('')
      setCodeError(err.response?.data?.message ?? 'That code could not be verified.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Modal title="Password updated" onClose={onClose}>
        <div className="flex flex-col items-start gap-3">
          <CheckCircle2 size={28} className="text-success" />
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Your password has been changed. Use it the next time you sign in — we have emailed a
            confirmation to your registered address.
          </p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  if (step === 'code') {
    return (
      <Modal
        title="Confirm your password change"
        subtitle="Password changes are confirmed by email."
        onClose={onClose}
      >
        <CodeStep
          sentTo={challenge?.sentTo}
          expiresInMinutes={challenge?.expiresInMinutes}
          code={code}
          setCode={setCode}
          error={codeError}
          busy={busy}
          onSubmit={submitCode}
          onResend={() => start(pending)}
          onBack={() => setStep('form')}
        />
      </Modal>
    )
  }

  return (
    <Modal
      title="Change Password"
      subtitle="We will email a 6-digit code to confirm this change."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(start)} noValidate className="flex flex-col gap-4">
        <FormField
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          registration={register('currentPassword')}
        />
        <FormField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          error={errors.newPassword?.message}
          registration={register('newPassword')}
        />
        <FormField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          registration={register('confirmPassword')}
        />

        <ErrorNote>{serverError}</ErrorNote>

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-accent-fg disabled:opacity-60"
          >
            {isSubmitting ? 'Sending code…' : 'Continue'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
