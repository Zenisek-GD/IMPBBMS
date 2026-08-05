import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { Globe, ArrowRight, AlertCircle, MailWarning } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { landingRouteForRole } from '../config/roleLanding'
import { loginSchema } from '../config/validation'
import AuthLayout from '../layouts/AuthLayout'
import FormField from '../components/ui/FormField'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')

  // A bidder who has not yet activated needs different advice from someone who
  // mistyped their password: the fix is the invitation email, not a reset. The
  // server distinguishes the two (403 with status "pendingActivation"), and it
  // only does so once the correct password has been supplied, so saying it here
  // discloses nothing to someone guessing.
  const [needsActivation, setNeedsActivation] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), mode: 'onBlur' })

  const onSubmit = async ({ email, password }) => {
    setServerError('')
    setNeedsActivation(false)
    try {
      const user = await login(email, password)
      navigate(landingRouteForRole(user.role), { replace: true })
    } catch (err) {
      setNeedsActivation(err.response?.data?.status === 'pendingActivation')
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use the account issued to you — there is no public sign-up.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          registration={register('email')}
        />

        <div>
          <FormField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            registration={register('password')}
          />
          <div className="mt-1.5 text-right">
            <Link
              to="/forgot-password"
              className="text-[11.5px] font-medium text-text-secondary transition-colors hover:text-navy hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {serverError && (
          <p
            role="alert"
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px] ${
              needsActivation
                ? 'border-warning/25 bg-warning/10 text-warning'
                : 'border-danger/25 bg-danger/10 text-danger'
            }`}
          >
            {needsActivation ? (
              <MailWarning size={14} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
            )}
            <span className="leading-relaxed">{serverError}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
          {!isSubmitting && <ArrowRight size={15} />}
        </button>
      </form>

      {/* The way back out — and nothing else.
          There is deliberately no route to bidder accreditation from this page.
          Sign-in is for people who already hold an account, and an accreditation
          link sitting under the password field reads as "register here", which
          is precisely what this system does not do: a bidder submits their
          requirements on the public portal, the BAC Secretariat verifies them,
          and Admin/IT issues the account. Offering it as a sign-in alternative
          misrepresents all three of those steps. */}
      <div className="mt-8 border-t border-border-muted pt-5 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-navy"
        >
          <Globe size={14} />
          Browse public procurement records
        </Link>
        <p className="mt-1 text-[11.5px] text-text-faint">Open to everyone — no account needed.</p>
      </div>
    </AuthLayout>
  )
}
