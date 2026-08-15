import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, ClipboardList, Inbox } from 'lucide-react'
import * as biddingApi from '../../api/bidding'
import { fetchOpenCalls } from '../../api/announcements'
import { counterSubmissionSchema } from '../../config/validation'
import {
  PROCUREMENT_CATEGORIES,
  buildEligibilitySteps,
  IRR_SOURCE,
} from '../../config/eligibilityRequirements'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import FormField from '../../components/ui/FormField'

// ─────────────────────────────────────────────────────────────────────────────
// How a paper submission enters the system.
//
// A prospective bidder brings their eligibility and accreditation documents to
// the BAC office. There is no online submission — this form is the officer at the
// counter writing down what they were handed, and it is the replacement for the
// public self-service page that used to do this job.
//
// Two consequences shape the form. The checklist is *received/not received*
// rather than upload slots, because the documents are physically on the desk. And
// the email address is typed by someone who does not own it, so it is confirmed
// twice — a typo here produces an approved bidder who can never be given access.
// ─────────────────────────────────────────────────────────────────────────────

const ORGANIZATION_TYPES = [
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'soleProprietorship', label: 'Sole Proprietorship' },
  { value: 'cooperative', label: 'Cooperative' },
]

const inputClass =
  'w-full rounded border border-border-muted px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'
const labelClass = 'mb-1 block text-[11.5px] font-medium tracking-[0.02em] text-text-secondary'

// Today, as the value an <input type="date"> expects.
const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function CounterSubmissionModal({ onClose, onRecorded }) {
  const [serverError, setServerError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [calls, setCalls] = useState([])

  // Which documents the officer actually has in hand. Keyed by docType; absent
  // means not received. Defaults to nothing ticked — the officer confirms each
  // one against the pile rather than un-ticking what the form assumed.
  const [received, setReceived] = useState({})

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(counterSubmissionSchema),
    mode: 'onBlur',
    defaultValues: {
      organizationType: 'corporation',
      category: 'goods',
      taxClassification: 'goods',
      isVatRegistered: true,
      isJointVenture: false,
      isForeignBidder: false,
      receiptConfirmed: false,
      receivedAt: today(),
      announcementId: '',
    },
  })

  const organizationType = useWatch({ control, name: 'organizationType' })
  const category = useWatch({ control, name: 'category' })
  const announcementId = useWatch({ control, name: 'announcementId' })

  useEffect(() => {
    let cancelled = false
    fetchOpenCalls()
      .then((data) => {
        if (!cancelled) setCalls(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // The same IRR-derived checklist the old self-service wizard rendered from, so
  // the requirements an officer checks against are the ones the regulation names.
  const steps = useMemo(
    () => buildEligibilitySteps({ organizationType, category }),
    [organizationType, category]
  )

  const allItems = useMemo(
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

  const receivedCount = allItems.filter((item) => received[item.docType]).length
  const selectedCall = calls.find((c) => String(c.id) === String(announcementId)) ?? null

  const onSubmit = async (values) => {
    setServerError('')
    setFieldErrors({})

    const documents = allItems.filter((item) => received[item.docType])
    if (documents.length === 0) {
      setServerError('Tick the documents you received before recording the submission.')
      return
    }

    try {
      const result = await biddingApi.recordCounterSubmission({
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
        announcementId: values.announcementId || null,
        receivedAt: values.receivedAt,
        documents,
      })
      onRecorded(result)
      onClose()
    } catch (err) {
      const payload = err.response?.data
      setFieldErrors(payload?.errors ?? {})
      setServerError(payload?.message ?? 'Could not record that submission.')
    }
  }

  return (
    <Modal
      title="Record counter submission"
      subtitle="Documents received in person at the BAC office."
      onClose={onClose}
      // Widened from the default `md`. This form has five sections and a dozen
      // fields, most already laid out as `sm:grid-cols-2` pairs — in a ~448px
      // panel those pairs had no room to sit side by side, so the whole thing
      // stacked into one tall column. At `xl` the columns breathe and the modal
      // is roughly half the height.
      size="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        {serverError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded border border-danger/25 bg-danger/10 px-3 py-2 text-[12.5px] text-danger"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {serverError}
          </p>
        )}

        {/* ── Receipt ─────────────────────────────────────────────────────── */}
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.04em] text-text-faint uppercase">
            <Inbox size={12} /> Receipt
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Date received</label>
              <input type="date" className={inputClass} {...register('receivedAt')} />
              {(errors.receivedAt?.message || fieldErrors.receivedAt) && (
                <p className="mt-1 text-[11px] text-danger">
                  {errors.receivedAt?.message ?? fieldErrors.receivedAt}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Against which call? (optional)</label>
              <select className={inputClass} {...register('announcementId')}>
                <option value="">General accreditation</option>
                {calls.map((call) => (
                  <option key={call.id} value={call.id}>
                    {call.title}
                    {call.closed ? ' — CLOSED' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* The officer is told before saving, not after. Recording a late
              submission is permitted — refusing at the keyboard would not
              un-receive the papers — but it should be a deliberate act. */}
          {selectedCall?.closed && (
            <p className="mt-2 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-[11.5px] leading-relaxed text-warning">
              Registration for this call closed on{' '}
              {new Date(selectedCall.registrationDeadline).toLocaleString('en-PH')}. Recording it will
              flag the submission as received after the deadline.
            </p>
          )}
        </section>

        {/* ── Business ────────────────────────────────────────────────────── */}
        <section>
          <p className="mb-2 text-[11px] font-medium tracking-[0.04em] text-text-faint uppercase">
            Business identity
          </p>
          <div className="flex flex-col gap-3">
            <FormField
              label="Registered business name"
              error={errors.businessName?.message ?? fieldErrors.businessName}
              registration={register('businessName')}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Organization type</label>
                <select className={inputClass} {...register('organizationType')}>
                  {ORGANIZATION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <FormField
                label="TIN (optional)"
                error={errors.tin?.message}
                registration={register('tin')}
              />
            </div>

            <div>
              <label className={labelClass}>Bidding for</label>
              <select className={inputClass} {...register('category')}>
                {PROCUREMENT_CATEGORIES.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-text-faint">
                Determines which eligibility documents the checklist below asks for.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                <input type="checkbox" className="h-4 w-4" {...register('isJointVenture')} />
                Joint venture
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                <input type="checkbox" className="h-4 w-4" {...register('isForeignBidder')} />
                Foreign bidder
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                <input type="checkbox" className="h-4 w-4" {...register('isVatRegistered')} />
                VAT-registered
              </label>
            </div>

            <div>
              <label className={labelClass}>Tax classification</label>
              <select className={inputClass} {...register('taxClassification')}>
                <option value="goods">Goods — 1% expanded withholding</option>
                <option value="services">Services — 2% expanded withholding</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── PhilGEPS ────────────────────────────────────────────────────── */}
        <section>
          <p className="mb-2 text-[11px] font-medium tracking-[0.04em] text-text-faint uppercase">
            PhilGEPS registration (IRR Sec. 52.1)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Registration number"
              error={errors.philgepsRegistrationNo?.message ?? fieldErrors.philgepsRegistrationNo}
              registration={register('philgepsRegistrationNo')}
            />
            <div>
              <label className={labelClass}>Certificate expiry</label>
              <input type="date" className={inputClass} {...register('philgepsExpiry')} />
              {errors.philgepsExpiry?.message && (
                <p className="mt-1 text-[11px] text-danger">{errors.philgepsExpiry.message}</p>
              )}
            </div>
          </div>
        </section>

        {/* ── Contact ─────────────────────────────────────────────────────── */}
        <section>
          <p className="mb-2 text-[11px] font-medium tracking-[0.04em] text-text-faint uppercase">
            Official contact
          </p>
          <div className="flex flex-col gap-3">
            <FormField
              label="Authorized contact person"
              error={errors.contactPerson?.message ?? fieldErrors.contactPerson}
              registration={register('contactPerson')}
            />

            {/* Typed twice on purpose — see the note on the schema. Everything
                that follows accreditation is sent to this address, and the person
                who owns it is not the one at the keyboard. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Email address"
                type="email"
                error={errors.contactEmail?.message ?? fieldErrors.contactEmail}
                registration={register('contactEmail')}
              />
              <FormField
                label="Re-type email address"
                type="email"
                error={errors.confirmEmail?.message}
                registration={register('confirmEmail')}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-text-faint">
              Read this back to the bidder before saving. The activation link and verification code go
              here, and only this address can activate the account.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Phone (optional)"
                error={errors.contactPhone?.message}
                registration={register('contactPhone')}
              />
              <FormField
                label="Address (optional)"
                error={errors.address?.message}
                registration={register('address')}
              />
            </div>
          </div>
        </section>

        {/* ── Checklist ───────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.04em] text-text-faint uppercase">
              <ClipboardList size={12} /> Documents received
            </p>
            <span className="text-[11.5px] text-text-secondary">
              {receivedCount} of {allItems.length} ticked
            </span>
          </div>

          <p className="mb-2.5 text-[11.5px] leading-relaxed text-text-faint">
            Tick what the bidder actually handed over. Each ticked item enters the review queue as
            received-but-unexamined — validity is a separate decision you make per document
            afterwards. Derived from {IRR_SOURCE.label}.
          </p>

          <div className="max-h-64 overflow-y-auto rounded border border-border-muted">
            {steps.map((step) => (
              <div key={step.title} className="border-b border-border-muted last:border-b-0">
                <p className="bg-sidebar px-3 py-1.5 text-[11px] font-medium text-text-secondary">
                  {step.title}
                </p>
                <ul>
                  {step.items.map((item) => (
                    <li key={item.id} className="border-t border-border-muted/60 px-3 py-2">
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0"
                          checked={Boolean(received[item.id])}
                          onChange={(event) =>
                            setReceived((current) => ({
                              ...current,
                              [item.id]: event.target.checked,
                            }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] text-navy">{item.label}</span>
                          {item.citation && (
                            <span className="block text-[11px] text-text-faint">{item.citation}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {fieldErrors.documents && (
            <p className="mt-1.5 text-[11px] text-danger">{fieldErrors.documents}</p>
          )}
        </section>

        <label className="flex items-start gap-2.5 rounded border border-border-muted bg-chip p-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" {...register('receiptConfirmed')} />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-navy">
              I received these documents from the bidder on the date above
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-text-faint">
              Recorded against your name. This is the statement an auditor relies on for when the
              submission arrived.
            </span>
            {errors.receiptConfirmed?.message && (
              <span className="mt-1 block text-[11px] text-danger">
                {errors.receiptConfirmed.message}
              </span>
            )}
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {isSubmitting ? 'RECORDING...' : 'RECORD SUBMISSION'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
