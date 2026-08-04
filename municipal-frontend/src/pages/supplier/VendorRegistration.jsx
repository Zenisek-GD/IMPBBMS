import { useEffect, useMemo, useState, useCallback } from 'react'
import { Check, FileText, ExternalLink, AlertTriangle, Lock, Send, ShieldCheck } from 'lucide-react'
import {
  PROCUREMENT_CATEGORIES,
  buildEligibilitySteps,
  SUBMISSION_PERIODS,
  IRR_SOURCE,
} from '../../config/eligibilityRequirements'
import * as biddingApi from '../../api/bidding'
import { fetchDocuments } from '../../api/documents'
import DocumentSlot from '../../components/ui/DocumentSlot'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'

const STATUS_LABELS = {
  draft: 'Draft — not yet submitted',
  submitted: 'Submitted — awaiting BAC review',
  verified: 'Verified — eligible to bid',
  returned: 'Returned — action required',
  blacklisted: 'Blacklisted',
}

export default function VendorRegistration() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const [form, setForm] = useState({
    businessName: '',
    tin: '',
    organizationType: 'corporation',
    isJointVenture: false,
    isForeignBidder: false,
    philgepsRegistrationNo: '',
    contactEmail: '',
  })
  // Real uploaded files, keyed by docType — replaces the old boolean checklist.
  const [documents, setDocuments] = useState({})
  const [category, setCategory] = useState('goods')
  const [activeStep, setActiveStep] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    biddingApi
      .fetchMyVendorProfile()
      .then((data) => {
        if (cancelled) return
        setProfile(data)
        setLoading(false)
        if (data) {
          setForm({
            businessName: data.businessName ?? '',
            tin: data.tin ?? '',
            organizationType: data.organizationType ?? 'corporation',
            isJointVenture: data.isJointVenture ?? false,
            isForeignBidder: data.isForeignBidder ?? false,
            philgepsRegistrationNo: data.philgepsRegistrationNo ?? '',
            contactEmail: data.contactEmail ?? '',
          })
          // Stored files are the source of truth for what is attached.
          fetchDocuments('vendor', data.id)
            .then((files) => {
              if (!cancelled) {
                setDocuments(Object.fromEntries(files.map((file) => [file.docType, file])))
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const eligibilityProfile = useMemo(
    () => ({
      category,
      organizationType: form.organizationType,
      isJointVenture: form.isJointVenture,
      isForeignBidder: form.isForeignBidder,
    }),
    [category, form.organizationType, form.isJointVenture, form.isForeignBidder]
  )

  const steps = useMemo(() => buildEligibilitySteps(eligibilityProfile), [eligibilityProfile])
  const step = steps[Math.min(activeStep, steps.length - 1)]

  // Registration documents are the eligibility ones only — the financial
  // component belongs to a specific bid, not to the vendor's registration.
  const registrationSteps = steps.filter((candidate) => candidate.envelope === 1)

  const isStepComplete = (candidate) => {
    const groups = new Map()
    for (const item of candidate.items) {
      const key = item.alternativeOf ?? item.id
      groups.set(key, (groups.get(key) ?? []).concat(item))
    }
    return [...groups.values()].every((group) => group.some((item) => documents[item.id]))
  }

  const locked = profile && ['submitted', 'verified'].includes(profile.registrationStatus)

  const save = async () => {
    setError('')
    setNotice('')
    setSaving(true)
    try {
      // Files upload independently and immediately; this saves the profile
      // fields and mirrors the attached set so the BAC review screen can list
      // what was submitted.
      const attachedDocs = registrationSteps
        .flatMap((candidate) => candidate.items)
        .filter((item) => documents[item.id])
        .map((item) => ({ docType: item.id, label: item.label, citation: item.citation }))

      await biddingApi.saveMyVendorProfile({ ...form, documents: attachedDocs })
      setNotice('Registration saved.')
      refresh()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const submitForReview = async () => {
    setError('')
    setNotice('')
    try {
      await biddingApi.submitMyVendorProfile()
      setNotice('Submitted to the BAC Secretariat for verification.')
      refresh()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not submit.')
    }
  }

  if (loading) {
    return (
      <DashboardPage>
        <p className="text-[13px] text-text-faint">Loading your registration...</p>
      </DashboardPage>
    )
  }

  return (
    <DashboardPage>
      <PageHeader
        title="Vendor Registration & Eligibility"
        subtitle="Register once, then bid on any opportunity. Requirements follow RA 12009."
        actions={
          <Button variant="secondary" icon={ExternalLink} onClick={() => window.open(IRR_SOURCE.url, '_blank')}>
            VIEW IRR
          </Button>
        }
      />

      {profile && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            profile.registrationStatus === 'verified'
              ? 'border-success/30 bg-success/10'
              : profile.registrationStatus === 'returned'
                ? 'border-danger/30 bg-danger/10'
                : 'border-border-muted bg-chip/40'
          }`}
        >
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-navy" />
          <div>
            <p className="text-[13px] font-semibold text-navy">
              {STATUS_LABELS[profile.registrationStatus]}
            </p>
            {profile.reviewRemarks && (
              <p className="mt-1 text-xs text-danger">BAC remarks: {profile.reviewRemarks}</p>
            )}
            {locked && (
              <p className="mt-1 text-xs text-text-secondary">
                Your registration is locked while under review. Contact the BAC Secretariat to amend it.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{notice}</p>
      )}

      <Card title="Company Details" icon={FileText}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Business name
            </label>
            <input
              type="text"
              value={form.businessName}
              disabled={locked}
              onChange={(event) => setForm({ ...form, businessName: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy disabled:bg-sidebar focus:border-navy focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">TIN</label>
            <input
              type="text"
              value={form.tin}
              disabled={locked}
              onChange={(event) => setForm({ ...form, tin: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy disabled:bg-sidebar focus:border-navy focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              Organisation type
            </label>
            <select
              value={form.organizationType}
              disabled={locked}
              onChange={(event) => setForm({ ...form, organizationType: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy disabled:bg-sidebar focus:border-navy focus:outline-none"
            >
              <option value="corporation">Corporation</option>
              <option value="partnership">Partnership</option>
              <option value="soleProprietorship">Sole Proprietorship</option>
              <option value="cooperative">Cooperative</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
              PhilGEPS registration no.
            </label>
            <input
              type="text"
              value={form.philgepsRegistrationNo}
              disabled={locked}
              onChange={(event) => setForm({ ...form, philgepsRegistrationNo: event.target.value })}
              className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy disabled:bg-sidebar focus:border-navy focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={form.isJointVenture}
              disabled={locked}
              onChange={(event) => setForm({ ...form, isJointVenture: event.target.checked })}
            />
            Joint Venture
          </label>
          <label className="flex items-center gap-2 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={form.isForeignBidder}
              disabled={locked}
              onChange={(event) => setForm({ ...form, isForeignBidder: event.target.checked })}
            />
            Foreign bidder
          </label>
          <label className="flex items-center gap-2 text-[13px] text-text-secondary">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded border border-border-muted px-3 py-1.5 text-sm text-navy focus:border-navy focus:outline-none"
            >
              {PROCUREMENT_CATEGORIES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {!profile?.id && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[13px] text-text-secondary">
            Save your company details first — documents attach to your registration, so it has to exist before
            you can upload.
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-chip/40 p-4">
        <Lock size={16} className="mt-0.5 shrink-0 text-navy" />
        <div className="text-[13px] text-text-secondary">
          <p>
            Bids are submitted in <strong className="text-navy">two sealed envelopes, simultaneously</strong> —
            the first holds the technical component with these eligibility requirements, the second the financial
            component.
          </p>
          <p className="mt-1 text-xs text-text-faint">
            IRR Sec. 54.1 · Submission window for {category}: {SUBMISSION_PERIODS[category]}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {registrationSteps.map((candidate, index) => {
          const complete = isStepComplete(candidate)
          const active = index === activeStep
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setActiveStep(index)}
              className={`flex items-center gap-2 rounded border px-4 py-2 text-[11px] font-medium tracking-[0.03em] ${
                active
                  ? 'border-navy bg-accent text-accent-fg'
                  : complete
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-border-muted bg-surface text-text-secondary'
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
                  active ? 'bg-surface text-navy' : complete ? 'bg-success text-white' : 'bg-track text-text-secondary'
                }`}
              >
                {complete ? <Check size={11} strokeWidth={3} /> : index + 1}
              </span>
              {candidate.title.toUpperCase()}
            </button>
          )
        })}
      </div>

      {step && (
        <Card title={step.title} icon={FileText}>
          <p className="mb-4 text-[13px] text-text-secondary">{step.description}</p>

          {step.note && (
            <div className="mb-4 flex items-start gap-2 rounded border border-warning/20 bg-warning/10 p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-xs text-text-secondary">{step.note}</p>
            </div>
          )}

          <ol className="flex flex-col gap-3">
            {step.items.map((item) => {
              const done = Boolean(documents[item.id])
              return (
                <li
                  key={item.id}
                  className={`rounded border p-4 ${done ? 'border-success/30 bg-success/5' : 'border-border-muted'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-navy">{item.label}</span>
                        {item.alternativeOf && <Badge tone="neutral">Either / or</Badge>}
                      </div>
                      {item.help && <p className="mt-1 text-xs text-text-secondary">{item.help}</p>}
                      <p className="mt-1 font-mono text-[11px] text-text-faint">{item.citation}</p>
                    </div>
                    <div className="shrink-0">
                      <DocumentSlot
                        entityRef="vendor"
                        entityId={profile?.id}
                        docType={item.id}
                        label={item.label}
                        existing={documents[item.id]}
                        disabled={locked || !profile?.id}
                        onChanged={refresh}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {!locked && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-text-faint">
            Files are stored securely and are visible only to you and the BAC Secretariat.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={save} disabled={saving || !form.businessName.trim()}>
              {saving ? 'SAVING...' : 'SAVE DRAFT'}
            </Button>
            <Button icon={Send} onClick={submitForReview} disabled={!profile}>
              SUBMIT FOR VERIFICATION
            </Button>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
