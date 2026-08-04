import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Info,
  Loader2,
  Mail,
  ShieldAlert,
} from 'lucide-react'
import { submitBidderRequirements } from '../../api/bidderIntake'
import { bidderIntakeSchema } from '../../config/validation'
import {
  PROCUREMENT_CATEGORIES,
  buildEligibilitySteps,
  IRR_SOURCE,
} from '../../config/eligibilityRequirements'
import PublicHeader from '../../components/public/PublicHeader'
import PublicFooter from '../../components/public/PublicFooter'
import FormField, { fieldClass, labelClass } from '../../components/ui/FormField'

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 of bidder onboarding, and the only part of it that happens without an
// account: a prospective bidder submits their eligibility, compliance and
// accreditation requirements, together with the email address that becomes their
// official channel.
//
// This is emphatically NOT a sign-up page, and it says so on the page itself. It
// creates an application for the BAC Secretariat to review. Access to the system
// begins later, if and only if an authorized official approves that application
// and creates an account.
// ─────────────────────────────────────────────────────────────────────────────

const ORGANIZATION_TYPES = [
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'soleProprietorship', label: 'Sole Proprietorship' },
  { value: 'cooperative', label: 'Cooperative' },
]

const Field = ({ label, hint, error, children }) => (
  <div>
    <label className={labelClass}>{label}</label>
    {children}
    {error ? (
      <p role="alert" className="mt-1 text-[11px] text-danger">
        {error}
      </p>
    ) : (
      hint && <p className="mt-1 text-[11px] text-text-faint">{hint}</p>
    )}
  </div>
)

const Checkbox = ({ label, hint, ...props }) => (
  <label className="flex cursor-pointer items-start gap-2.5">
    <input
      type="checkbox"
      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-accent focus:ring-2 focus:ring-accent/25"
      {...props}
    />
    <span>
      <span className="block text-[12.5px] text-navy">{label}</span>
      {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-text-faint">{hint}</span>}
    </span>
  </label>
)

const Section = ({ step, title, description, children }) => (
  <section className="rounded-lg border border-border-muted bg-surface">
    <header className="border-b border-border-muted px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-chip text-[11px] font-semibold text-navy">
          {step}
        </span>
        <h2 className="text-[13.5px] font-semibold text-navy">{title}</h2>
      </div>
      {description && <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">{description}</p>}
    </header>
    <div className="flex flex-col gap-4 p-4">{children}</div>
  </section>
)

export default function BidderRegistration() {
  const [submitted, setSubmitted] = useState(null)
  const [serverError, setServerError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(bidderIntakeSchema),
    mode: 'onBlur',
    defaultValues: {
      organizationType: 'corporation',
      category: 'goods',
      taxClassification: 'goods',
      isVatRegistered: true,
      isJointVenture: false,
      isForeignBidder: false,
      declarationAccepted: false,
    },
  })

  // `useWatch` rather than the form's own `watch()`: the latter returns a fresh
  // function each render, which defeats memoisation downstream.
  const organizationType = useWatch({ control, name: 'organizationType' })
  const category = useWatch({ control, name: 'category' })

  // The checklist is derived from the IRR, filtered to this applicant's
  // organization type and procurement category — the same source the
  // authenticated eligibility wizard renders from, so an applicant sees the same
  // requirements before and after they have an account.
  const steps = useMemo(
    () => buildEligibilitySteps({ organizationType, category }),
    [organizationType, category]
  )

  const declaredDocuments = useMemo(
    () =>
      steps.flatMap((step) =>
        step.items.map((item) => ({
          docType: item.id,
          label: item.label,
          citation: item.citation ?? null,
        }))
      ),
    [steps]
  )

  const onSubmit = async (values) => {
    setServerError('')
    setFieldErrors({})
    try {
      const data = await submitBidderRequirements({
        businessName: values.businessName,
        tin: values.tin || null,
        organizationType: values.organizationType,
        isJointVenture: values.isJointVenture,
        isForeignBidder: values.isForeignBidder,
        isVatRegistered: values.isVatRegistered,
        taxClassification: values.taxClassification,
        philgepsRegistrationNo: values.philgepsRegistrationNo,
        philgepsExpiry: values.philgepsExpiry,
        contactPerson: values.contactPerson,
        contactEmail: values.contactEmail,
        contactPhone: values.contactPhone || null,
        address: values.address || null,
        // The checklist the applicant is attesting to. The PhilGEPS Platinum
        // certificate is always in this list — the server refuses a submission
        // without it (IRR Sec. 52.1).
        documents: [
          {
            docType: 'philgeps-platinum',
            label: 'PhilGEPS Certificate of Registration (Platinum Membership)',
            citation: 'IRR Sec. 52.1',
            expiryDate: values.philgepsExpiry,
          },
          ...declaredDocuments,
        ],
      })
      setSubmitted({ message: data.message, email: values.contactEmail })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const payload = err.response?.data
      setFieldErrors(payload?.errors ?? {})
      setServerError(payload?.message ?? 'Something went wrong. Please try again.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <PublicHeader />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
          <div className="rounded-lg border border-border-muted bg-surface p-6">
            <CheckCircle2 size={32} className="text-success" />
            <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-navy">
              Requirements received
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{submitted.message}</p>

            <div className="mt-5 rounded-md border border-border-muted bg-chip px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] tracking-[0.05em] text-text-faint uppercase">
                <Mail size={12} /> Confirmation sent to
              </p>
              <p className="mt-1 text-[13px] font-medium text-navy">{submitted.email}</p>
            </div>

            <div className="mt-5 border-t border-border-muted pt-5">
              <h2 className="text-[12.5px] font-semibold text-navy">What happens next</h2>
              <ol className="mt-2.5 flex flex-col gap-2.5">
                {[
                  'The BAC Secretariat reviews your submission against the IRR requirements.',
                  'If your registration is approved, an authorized official creates your account — you cannot create one yourself.',
                  'An activation link is emailed to the address above. It can be used once and expires within 48 hours.',
                  'You set your own password, then confirm the address with a 6-digit code. Your account is active only after that.',
                ].map((text, index) => (
                  <li key={index} className="flex gap-2.5 text-[12.5px] leading-relaxed text-text-secondary">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-chip text-[10.5px] font-semibold text-navy">
                      {index + 1}
                    </span>
                    {text}
                  </li>
                ))}
              </ol>
            </div>

            <Link
              to="/"
              className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-[12.5px] font-medium text-accent-fg"
            >
              Back to public records
            </Link>
          </div>
        </main>
        <PublicFooter />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <header className="mb-6">
          <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.025em] text-navy">
            Bidder accreditation
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            Submit your eligibility, compliance and accreditation requirements to the Bids and Awards
            Committee. Registration is reviewed by an officer — this form does not create an account.
          </p>
        </header>

        {/* Said plainly and up front. An applicant who expects to walk away with a
            password needs to know now, not after they have filled in the form. */}
        <div className="mb-6 flex gap-3 rounded-lg border border-border-muted bg-chip p-4">
          <ShieldAlert size={17} className="mt-0.5 shrink-0 text-navy" />
          <div>
            <p className="text-[12.5px] font-medium text-navy">This system has no public sign-up</p>
            <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
              You are submitting an application, not creating an account. Bidder accounts are created
              only by authorized procurement officials, and only after your requirements have been
              reviewed and approved. If approved, we will email an activation link to the address you
              give below.
            </p>
          </div>
        </div>

        {serverError && (
          <p
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-[12.5px] text-danger"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {serverError}
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <Section
            step="1"
            title="Business identity"
            description="As registered with the SEC, DTI or CDA. This must match your PhilGEPS registration."
          >
            <FormField
              label="Registered business name"
              error={errors.businessName?.message ?? fieldErrors.businessName}
              registration={register('businessName')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Organization type"
                error={errors.organizationType?.message ?? fieldErrors.organizationType}
              >
                <select className={fieldClass} {...register('organizationType')}>
                  {ORGANIZATION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </Field>

              <FormField
                label="TIN (optional)"
                error={errors.tin?.message}
                registration={register('tin')}
              />
            </div>

            <Field
              label="What do you intend to bid for?"
              hint="Determines which eligibility documents apply to you."
              error={errors.category?.message}
            >
              <select className={fieldClass} {...register('category')}>
                {PROCUREMENT_CATEGORIES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex flex-col gap-2.5 border-t border-border-muted pt-4">
              <Checkbox
                label="This is a joint venture"
                hint="Each member must be separately eligible (IRR Sec. 52)."
                {...register('isJointVenture')}
              />
              <Checkbox label="Foreign bidder" {...register('isForeignBidder')} />
              <Checkbox
                label="VAT-registered"
                hint="Determines the withholding applied to your payments."
                {...register('isVatRegistered')}
              />
            </div>

            <Field
              label="Tax classification"
              hint="1% expanded withholding tax on goods, 2% on services."
              error={errors.taxClassification?.message}
            >
              <select className={fieldClass} {...register('taxClassification')}>
                <option value="goods">Goods</option>
                <option value="services">Services</option>
              </select>
            </Field>
          </Section>

          <Section
            step="2"
            title="PhilGEPS registration"
            description="The Platinum Membership certificate is the document the BAC collects, and it is valid for one year (IRR Sec. 52.1 and 20.2.9(b))."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="PhilGEPS registration number"
                error={errors.philgepsRegistrationNo?.message ?? fieldErrors.philgepsRegistrationNo}
                registration={register('philgepsRegistrationNo')}
              />
              <FormField
                label="Certificate expiry date"
                type="date"
                error={errors.philgepsExpiry?.message}
                registration={register('philgepsExpiry')}
              />
            </div>
            {fieldErrors.documents && (
              <p role="alert" className="text-[11.5px] text-danger">
                {fieldErrors.documents}
              </p>
            )}
          </Section>

          {/* ── The email address ───────────────────────────────────────────
              Given its own section, at full weight, because it is the single
              most consequential field on the form and the one an applicant is
              most likely to treat as routine. */}
          <Section
            step="3"
            title="Official email address"
            description="This becomes your official channel for everything that follows."
          >
            <div className="flex gap-3 rounded-md border border-warning/25 bg-warning/10 p-3">
              <Info size={16} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-[12px] leading-relaxed text-warning">
                Use an address you monitor and will keep. Your activation link, verification codes,
                invitations to bid, notices of award and password recovery all go here — and only this
                address can be used to activate your account. It cannot be changed later without
                going back through the BAC Secretariat.
              </p>
            </div>

            <FormField
              label="Authorized contact person"
              hint="The person authorized to transact on behalf of the business."
              error={errors.contactPerson?.message ?? fieldErrors.contactPerson}
              registration={register('contactPerson')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Email address"
                type="email"
                autoComplete="email"
                error={errors.contactEmail?.message ?? fieldErrors.contactEmail}
                registration={register('contactEmail')}
              />
              <FormField
                label="Re-type email address"
                type="email"
                autoComplete="off"
                // Paste is blocked here for the one reason it is ever justified:
                // pasting the same typo twice confirms nothing, and a wrong
                // address on this form cannot be corrected by the applicant later.
                onPaste={(event) => event.preventDefault()}
                error={errors.confirmEmail?.message}
                registration={register('confirmEmail')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Contact number (optional)"
                error={errors.contactPhone?.message}
                registration={register('contactPhone')}
              />
              <FormField
                label="Business address (optional)"
                error={errors.address?.message}
                registration={register('address')}
              />
            </div>
          </Section>

          <Section
            step="4"
            title="Eligibility checklist"
            description="Derived from the IRR for the organization type and category you selected. Declare what you hold; the BAC Secretariat will collect the documents themselves."
          >
            <div className="flex flex-col gap-4">
              {steps.map((step) => (
                <div key={step.id}>
                  <p className="flex items-center gap-1.5 text-[11px] tracking-[0.05em] text-text-faint uppercase">
                    <ClipboardList size={12} /> {step.title}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {step.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-2 rounded border border-border-muted px-3 py-2"
                      >
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-text-faint" />
                        <span className="min-w-0">
                          <span className="block text-[12px] leading-snug text-navy">{item.label}</span>
                          {item.citation && (
                            <span className="mt-0.5 block text-[10.5px] text-text-faint">
                              {item.citation}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="border-t border-border-muted pt-3 text-[11px] leading-relaxed text-text-faint">
              Source: {IRR_SOURCE.label}.
            </p>
          </Section>

          <Section step="5" title="Declaration">
            <Checkbox
              label="I declare that the information above is true and complete."
              hint="I am authorized to submit this registration, and I understand that a false declaration is grounds for disqualification and blacklisting."
              {...register('declarationAccepted')}
            />
            {errors.declarationAccepted?.message && (
              <p role="alert" className="text-[11.5px] text-danger">
                {errors.declarationAccepted.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 flex items-center justify-center gap-2 self-start rounded-md bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Submitting…
                </>
              ) : (
                'Submit requirements'
              )}
            </button>
          </Section>
        </form>

        <p className="mt-6 text-center text-[12px] text-text-faint">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-navy hover:underline">
            Sign in
          </Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  )
}
