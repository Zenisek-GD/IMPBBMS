import { useEffect, useState, useCallback } from 'react'
import {
  Users,
  ShieldCheck,
  FileText,
  Download,
  UserPlus,
  Mail,
  Send,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Inbox,
} from 'lucide-react'
import { fetchDocuments, downloadDocument, formatBytes } from '../../api/documents'
import * as biddingApi from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import FormField from '../../components/ui/FormField'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'
import CounterSubmissionModal from './CounterSubmissionModal'

const STATUS_TONES = {
  draft: 'neutral',
  submitted: 'warning',
  verified: 'success',
  returned: 'danger',
  blacklisted: 'danger',
}

// The state of an outstanding invitation, so an officer can tell "invited and
// waiting" from "opened but not finished" from "expired, needs resending".
const INVITATION_LABELS = {
  sent: 'Invitation sent',
  opened: 'Link opened',
  expired: 'Invitation expired',
  superseded: 'Superseded',
  used: 'Activated',
}

const formatDate = (value) =>
  value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// ─────────────────────────────────────────────────────────────────────────────
// Creating the bidder's account. Note what this dialog does NOT offer: a field
// for the email address. The account is created against the address on the
// approved registration, because that is the only address the accreditation was
// granted for — so it is shown, prominently, and it is not editable.
// ─────────────────────────────────────────────────────────────────────────────
function CreateAccountModal({ vendor, onClose, onCreated }) {
  const [displayName, setDisplayName] = useState(vendor.contactPerson ?? vendor.businessName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const create = async () => {
    setError('')
    setBusy(true)
    try {
      const data = await biddingApi.createBidderAccount(vendor.id, displayName)
      setResult(data)
      onCreated()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal title="Account created" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            {result.emailSent ? (
              <CheckCircle2 size={26} className="shrink-0 text-success" />
            ) : (
              <AlertCircle size={26} className="shrink-0 text-danger" />
            )}
            <p className="text-[13px] leading-relaxed text-text-secondary">{result.message}</p>
          </div>

          <div className="rounded-md border border-border-muted bg-chip px-3 py-2.5">
            <p className="text-[11px] tracking-[0.04em] text-text-faint uppercase">
              What the bidder does next
            </p>
            <ol className="mt-1.5 flex flex-col gap-1 text-[12px] leading-relaxed text-text-secondary">
              <li>1. Opens the activation link — usable once, expires in 48 hours.</li>
              <li>2. Sets their own password. Nobody here can see it.</li>
              <li>3. Enters a 6-digit code we email, which proves the address is theirs.</li>
              <li>4. The account becomes active. Until then it cannot be signed into.</li>
            </ol>
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={`Create account — ${vendor.businessName}`}
      subtitle="An invitation will be emailed to the accredited address."
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border-muted bg-chip px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] tracking-[0.04em] text-text-faint uppercase">
            <Mail size={11} /> Accredited email address
          </p>
          <p className="mt-1 text-[13.5px] font-medium break-all text-navy">{vendor.contactEmail}</p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-faint">
            Taken from the registration you approved. It cannot be changed here — only the address the
            accreditation was granted for can be used to activate the account. If this is wrong, return
            the registration and ask for a correction.
          </p>
        </div>

        <FormField
          label="Display name"
          hint="How the bidder appears in the system. They can change it themselves during activation."
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />

        {vendor.referenceCode && (
          <p className="text-[11.5px] text-text-faint">
            Registration reference <span className="font-mono text-navy">{vendor.referenceCode}</span>
            {vendor.reviewedByName && ` · verified by ${vendor.reviewedByName}`}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={create}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-accent-fg disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Creating…
              </>
            ) : (
              <>
                <UserPlus size={14} /> Create account and send invitation
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// One submitted requirement, with the reviewing officer's finding on it.
//
// Rejecting demands a reason before the button will fire: these remarks are what
// the applicant is shown, and "invalid" with no explanation gives them nothing to
// correct. The server enforces the same rule — this only saves a round trip.
function RequirementRow({ document, busy, onDecide }) {
  const [rejecting, setRejecting] = useState(false)
  const [remarks, setRemarks] = useState(document.remarks ?? '')

  const tone =
    document.status === 'verified' ? 'success' : document.status === 'rejected' ? 'danger' : 'neutral'
  const label =
    document.status === 'verified' ? 'valid' : document.status === 'rejected' ? 'invalid' : 'unchecked'

  return (
    <li className="rounded border border-border-muted p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-navy">{document.label}</p>
          {document.citation && (
            <p className="text-[11px] text-text-faint">{document.citation}</p>
          )}
          {document.status === 'rejected' && document.remarks && (
            <p className="mt-1 text-[11.5px] leading-snug text-danger">{document.remarks}</p>
          )}
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {/* Read-only for anyone who is not the office that checks the papers —
          the committee reads these findings, it does not re-mark them. */}
      {!onDecide ? null : rejecting ? (
        <div className="mt-2.5">
          <textarea
            rows={2}
            value={remarks}
            autoFocus
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="What is wrong with it? e.g. Certificate expired 12 Mar 2026."
            className="w-full resize-y rounded border border-border-muted px-3 py-1.5 text-[12.5px] text-navy focus:border-navy focus:outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-[11px] font-medium tracking-[0.03em] text-text-secondary hover:underline"
            >
              CANCEL
            </button>
            <button
              type="button"
              disabled={busy || !remarks.trim()}
              onClick={() => onDecide('rejected', remarks).then(() => setRejecting(false))}
              className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline disabled:opacity-40"
            >
              CONFIRM INVALID
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide('verified', '')}
            className="text-[11px] font-medium tracking-[0.03em] text-success hover:underline disabled:opacity-40"
          >
            MARK VALID
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline disabled:opacity-40"
          >
            MARK INVALID
          </button>
        </div>
      )}
    </li>
  )
}

// ── Two offices, one file ────────────────────────────────────────────────────
// `canCheckDocuments` is the BAC Secretariat: it receives the counter
// submission and marks each requirement against the rule it answers. `canDecide`
// is the BAC — the committee that rules on eligibility once the file is
// assembled (GPM, "Responsibilities of the BAC", item iv).
//
// Both halves live in one dialog because they are one file and the second act
// is read against the first: a Chairperson deciding eligibility needs to see
// exactly which papers the Secretariat checked and what it found.
function ReviewModal({ vendor, onClose, onDecided, canCheckDocuments, canDecide }) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState([])

  // The vendor as the server currently sees it. Each per-document decision
  // returns the whole record, so the progress counter below is the server's own
  // count rather than one maintained here — the button that enables approval and
  // the rule that permits it read the same number.
  const [current, setCurrent] = useState(vendor)
  const review = current.documentReview ?? { total: 0, verified: 0, unreviewed: 0, rejected: 0 }

  // The real submitted files, not the vendor's own checklist claim.
  useEffect(() => {
    let cancelled = false
    fetchDocuments('vendor', vendor.id)
      .then((data) => {
        if (!cancelled) setFiles(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [vendor.id])

  const decideDocument = async (documentId, status, documentRemarks) => {
    setError('')
    setBusy(true)
    try {
      const updated = await biddingApi.reviewVendorDocument(
        vendor.id,
        documentId,
        status,
        documentRemarks
      )
      setCurrent(updated)
      // The row in the table behind the modal carries the same counts.
      onDecided()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not record that finding.')
    } finally {
      setBusy(false)
    }
  }

  const decide = async (decision) => {
    setError('')
    setBusy(true)
    try {
      await biddingApi.reviewVendor(vendor.id, decision, remarks)
      onDecided()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not record that decision.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Review — ${current.businessName}`} onClose={onClose}>
      {/* Which call this application answered, when it answered one. An
          unsolicited application is legitimate, so this simply says so rather
          than flagging it. */}
      <div className="mb-4 rounded-md border border-border-muted bg-chip px-3 py-2.5">
        <p className="text-[11px] tracking-[0.04em] text-text-faint uppercase">Applied to</p>
        <p className="mt-0.5 text-[12.5px] text-navy">
          {current.callTitle ?? 'General accreditation — not tied to one procurement'}
        </p>
        {current.callRegistrationDeadline && (
          <p className="text-[11.5px] text-text-secondary">
            {/* Tense matters here. An officer reviewing a live call needs to know
                more may still arrive; one reviewing a closed call is looking at
                the final set. */}
            {new Date(current.callRegistrationDeadline) > new Date()
              ? 'Registration closes'
              : 'Registration closed'}{' '}
            {formatDate(current.callRegistrationDeadline)}
          </p>
        )}

        {/* Provenance of the paper file: when it came over the counter and who
            says so. This is what a protest about timeliness turns on. */}
        <p className="mt-1 text-[11.5px] text-text-secondary">
          Received {formatDate(current.receivedAt ?? current.submittedAt)}
          {current.recordedByName && ` · recorded by ${current.recordedByName}`}
          {current.callRegistrationDeadline &&
            current.receivedAt &&
            new Date(current.receivedAt) > new Date(current.callRegistrationDeadline) && (
              <span className="ml-1.5 font-medium text-danger">after the deadline</span>
            )}
        </p>
      </div>

      {/* ── Requirement-by-requirement findings ───────────────────────────
          The accreditation decision is a statement that the requirements are
          complete and valid, so it is assembled from findings on each one
          rather than taken as a single verdict on the pile. */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">
            Requirements ({review.verified}/{review.total} checked)
          </p>
          {review.unreviewed > 0 && (
            <Badge tone="warning">{review.unreviewed} left to check</Badge>
          )}
        </div>

        {(current.documents ?? []).length === 0 ? (
          <p className="text-[13px] text-text-faint">No requirements declared.</p>
        ) : (
          <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {current.documents.map((document) => (
              <RequirementRow
                key={document.id}
                document={document}
                busy={busy}
                // The committee reads the findings; it does not re-mark the
                // papers. Passing null leaves the row read-only.
                onDecide={
                  canCheckDocuments
                    ? (status, documentRemarks) =>
                        decideDocument(document.id, status, documentRemarks)
                    : null
                }
              />
            ))}
          </ol>
        )}
      </div>

      <div className="mb-4">
        <p className="mb-2 text-[11px] tracking-[0.03em] text-text-faint uppercase">
          Submitted files ({files.length})
        </p>
        {files.length === 0 ? (
          <p className="text-[13px] text-text-faint">No files uploaded.</p>
        ) : (
          <ol className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-3 rounded border border-border-muted p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-navy">{file.label ?? file.docType}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {file.filename} · {formatBytes(file.sizeBytes)}
                  </p>
                  <p className="font-mono text-[10px] text-text-faint">
                    sha256 {file.checksum.slice(0, 24)}…
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadDocument(file.id, file.filename)}
                  className="flex shrink-0 items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                >
                  <Download size={12} /> OPEN
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {canDecide && (
        <>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Remarks (required to return or blacklist)
          </label>
          <textarea
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          />
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Says why the button is unavailable. A disabled control with no
          explanation reads as a broken screen. */}
      {canDecide && !review.complete && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
          {review.total === 0
            ? 'This registration declares no requirements, so there is nothing to verify.'
            : review.rejected > 0
              ? `${review.rejected} requirement${review.rejected === 1 ? ' was' : 's were'} marked invalid. Return the registration with remarks so the applicant can supply a replacement.`
              : `Check the remaining ${review.unreviewed} requirement${review.unreviewed === 1 ? '' : 's'} before approving this bidder.`}
        </p>
      )}

      {/* The Secretariat's half of the job ends here. Saying so is the whole
          point — an officer who has just checked every requirement and finds no
          approve button would otherwise think the screen is broken. */}
      {!canDecide && (
        <p className="mt-3 rounded-md border border-border-muted bg-chip px-3 py-2.5 text-[11.5px] leading-relaxed text-text-secondary">
          {canCheckDocuments ? (
            <>
              Checking the requirements is this office&rsquo;s part. Determining whether the bidder
              is <strong className="text-navy">eligible</strong> is the{' '}
              <strong className="text-navy">BAC&rsquo;s</strong> decision, taken by the Chairperson
              or Vice-Chairperson on the file you have assembled.
            </>
          ) : (
            <>You can read this registration, but not decide it.</>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {canDecide ? 'CANCEL' : 'CLOSE'}
        </Button>
        {canDecide && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('return')}
              className="rounded-sm border border-danger/30 px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-danger"
            >
              RETURN
            </button>
            <button
              type="button"
              // Approval requires every requirement to have been examined and
              // none to have failed. The server refuses either way; this stops
              // the officer discovering that only after clicking.
              disabled={busy || !review.complete}
              onClick={() => decide('verify')}
              className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
            >
              VERIFY
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

// One screen, two offices, two jobs.
//
// Bidder onboarding is split on purpose: the BAC Secretariat decides whether a
// registration's requirements are complete and valid, and Admin/IT decides
// whether that approval becomes a working credential. Neither can perform the
// other's step — the server enforces it by permission, and this page renders
// only the controls the caller can actually use, so nobody is shown a button
// that would come back 403.
export default function VendorVerification() {
  const { has } = usePermissions()
  // ── Three offices reach this screen, and each does one thing ──────────────
  // The Secretariat records what arrives at the counter and checks the papers;
  // the BAC determines eligibility on the file it assembled; Admin/IT issues the
  // credential afterwards. `canReview` used to mean all of the first two, which
  // is what put a committee determination on a support office's signature.
  const canCreateAccounts = has('bidders.createAccount') // Admin/IT
  const canIntake = has('bidding.publish') // BAC Secretariat
  const canDecideEligibility = has('vendor.determineEligibility') // BAC Chair / Vice-Chair
  const canOpenReview = canIntake || canDecideEligibility

  const [vendors, setVendors] = useState([])
  const [reviewing, setReviewing] = useState(null)
  const [recording, setRecording] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [banner, setBanner] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    biddingApi
      .fetchVendors()
      .then((data) => {
        if (!cancelled) setVendors(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const resendInvitation = async (vendor) => {
    setResendingId(vendor.id)
    setBanner(null)
    try {
      const data = await biddingApi.resendBidderInvitation(vendor.id)
      setBanner({ tone: data.emailSent ? 'success' : 'danger', message: data.message })
      refresh()
    } catch (err) {
      setBanner({
        tone: 'danger',
        message: err.response?.data?.message ?? 'Could not send the invitation.',
      })
    } finally {
      setResendingId(null)
    }
  }

  const pending = vendors.filter((vendor) => vendor.registrationStatus === 'submitted').length

  // Approved registrations with nobody invited yet — the officer's other queue,
  // and easy to forget about because nothing prompts for it.
  const awaitingAccount = vendors.filter((vendor) => vendor.canCreateAccount).length

  // Two filters that answer the questions this queue actually gets asked: what
  // is waiting on me, and who has been approved but still cannot sign in.
  const table = useTableControls(vendors, {
    searchKeys: [
      'businessName',
      'contactEmail',
      'contactPerson',
      'referenceCode',
      'organizationType',
    ],
    filters: [
      {
        key: 'registrationStatus',
        label: 'All registrations',
        options: ['draft', 'submitted', 'verified', 'returned', 'blacklisted'],
      },
      {
        key: 'hasAccount',
        label: 'Account issued?',
        options: [
          { value: 'true', label: 'Account issued' },
          { value: 'false', label: 'No account yet' },
        ],
        accessor: (vendor) => String(Boolean(vendor.hasAccount)),
      },
      { key: 'organizationType', label: 'All organisation types' },
    ],
    accessors: {
      documents: (vendor) => vendor.documents?.length ?? 0,
      hasAccount: (vendor) => String(Boolean(vendor.hasAccount)),
    },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title={
          canDecideEligibility
            ? 'Bidder Eligibility'
            : canIntake
              ? 'Bidder Registrations'
              : 'Bidder Accounts'
        }
        subtitle={
          canDecideEligibility
            ? 'Determine whether each prospective bidder is eligible, on the file the Secretariat has assembled and checked.'
            : canIntake
              ? 'Record what arrives at the counter and check each requirement. The BAC then determines eligibility, and Admin/IT issues the account.'
              : 'Accounts for bidders the BAC has already found eligible. Issuing the account is the last step before a bidder can sign in.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canOpenReview && pending > 0 && <Badge tone="warning">{pending} awaiting review</Badge>}
            {awaitingAccount > 0 && <Badge tone="info">{awaitingAccount} approved, no account</Badge>}
            {/* The only way an accreditation enters the system now that there is
                no online submission. */}
            {canIntake && (
              <Button icon={Inbox} onClick={() => setRecording(true)}>
                RECORD COUNTER SUBMISSION
              </Button>
            )}
          </div>
        }
      />

      {/* The step this office does not perform, said once. Without it the page
          reads as though half the controls are missing or broken. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border-muted bg-chip px-4 py-3">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          {canDecideEligibility ? (
            <>
              The <strong className="text-navy">Secretariat</strong> receives each application at the
              counter and checks the requirements one by one. Determining whether the bidder is{' '}
              <strong className="text-navy">eligible</strong> is the committee&rsquo;s act, and it is
              yours. <strong className="text-navy">Admin/IT</strong> issues the account afterwards,
              so finding a bidder eligible here does not by itself let anyone in.
            </>
          ) : canIntake ? (
            <>
              Bidders submit their requirements <strong className="text-navy">in person</strong> at
              this office — there is no online submission and no sign-up. Record what you receive at
              the counter and check each document against the rule it answers. The{' '}
              <strong className="text-navy">BAC</strong> then determines eligibility on the file you
              assembled — that decision is not this office&rsquo;s to make.
            </>
          ) : (
            <>
              Eligibility is determined by the <strong className="text-navy">BAC</strong>. You cannot
              approve a registration here, and an account can only be issued for a bidder the
              committee has already found eligible.
            </>
          )}
        </p>
      </div>

      {banner && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-[12.5px] leading-relaxed ${
            banner.tone === 'success'
              ? 'border-success/25 bg-success/10 text-success'
              : 'border-danger/25 bg-danger/10 text-danger'
          }`}
        >
          {banner.tone === 'success' ? (
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
          )}
          <span>{banner.message}</span>
        </div>
      )}

      <Card bodyClassName="p-4">
        <TableToolbar
          {...table.toolbarProps}
          searchPlaceholder="Search business, email, contact or reference…"
        />
      </Card>

      <Card title="Registered Bidders" icon={Users} bodyClassName="">
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'No bidders registered yet.'
              : 'No bidders match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('businessName')}>Business</SortableTh>
                  <SortableTh {...table.sortProps('contactEmail')}>Accredited email</SortableTh>
                  <SortableTh {...table.sortProps('documents')}>Docs</SortableTh>
                  <SortableTh {...table.sortProps('registrationStatus')}>Registration</SortableTh>
                  <SortableTh {...table.sortProps('hasAccount')}>Account</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((vendor) => (
                  <tr key={vendor.id} className="border-t border-border-muted align-top">
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-navy">{vendor.businessName}</p>
                      <p className="mt-0.5 text-[11px] text-text-faint">
                        {vendor.organizationType}
                        {vendor.referenceCode && <span className="font-mono"> · {vendor.referenceCode}</span>}
                      </p>
                    </td>

                    {/* The address the account will be — or was — created against.
                        It is the fact the officer is actually approving, so it sits
                        in the table rather than behind a dialog. */}
                    <td className="px-4 py-3">
                      <p className="text-[12.5px] break-all text-text-secondary">
                        {vendor.contactEmail ?? (
                          <span className="text-danger">No email on file</span>
                        )}
                      </p>
                      {vendor.contactPerson && (
                        <p className="mt-0.5 text-[11px] text-text-faint">{vendor.contactPerson}</p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-[13px] text-text-secondary">
                        <FileText size={12} /> {vendor.documents.length}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[vendor.registrationStatus]}>
                        {vendor.registrationStatus}
                      </Badge>
                      {vendor.submittedAt && (
                        <p className="mt-1 text-[10.5px] text-text-faint">
                          {formatDate(vendor.submittedAt)}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {!vendor.hasAccount ? (
                        <span className="text-[12px] text-text-faint">
                          {vendor.registrationStatus === 'verified' ? 'Not yet issued' : '—'}
                        </span>
                      ) : (
                        <>
                          <Badge
                            tone={
                              vendor.accountStatus === 'active'
                                ? 'success'
                                : vendor.accountStatus === 'pendingActivation'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {vendor.accountStatus === 'pendingActivation'
                              ? 'awaiting activation'
                              : vendor.accountStatus}
                          </Badge>
                          {vendor.invitation && (
                            <p className="mt-1 text-[10.5px] text-text-faint">
                              {INVITATION_LABELS[vendor.invitation.state] ?? vendor.invitation.state}
                              {vendor.invitation.sendCount > 1 && ` ×${vendor.invitation.sendCount}`}
                              <br />
                              {vendor.accountStatus === 'active'
                                ? formatDate(vendor.accountActivatedAt)
                                : `expires ${formatDate(vendor.invitation.expiresAt)}`}
                            </p>
                          )}
                        </>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {canOpenReview && vendor.registrationStatus === 'submitted' && (
                          <button
                            type="button"
                            onClick={() => setReviewing(vendor)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy uppercase hover:underline"
                          >
                            <ShieldCheck size={12} />{' '}
                            {canDecideEligibility ? 'Decide eligibility' : 'Check requirements'}
                          </button>
                        )}

                        {canCreateAccounts && vendor.canCreateAccount && (
                          <button
                            type="button"
                            onClick={() => setCreatingFor(vendor)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy uppercase hover:underline"
                          >
                            <UserPlus size={12} /> Create account
                          </button>
                        )}

                        {canCreateAccounts &&
                          vendor.hasAccount &&
                          vendor.accountStatus === 'pendingActivation' && (
                            <button
                              type="button"
                              disabled={resendingId === vendor.id}
                              onClick={() => resendInvitation(vendor)}
                              className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy uppercase hover:underline disabled:opacity-60"
                            >
                              {resendingId === vendor.id ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" /> Sending
                                </>
                              ) : (
                                <>
                                  <Send size={12} /> Resend invitation
                                </>
                              )}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="bidders" />
      </Card>

      {recording && (
        <CounterSubmissionModal
          onClose={() => setRecording(false)}
          onRecorded={(result) => {
            setBanner({
              tone: result.receivedAfterDeadline ? 'danger' : 'success',
              message: result.receivedAfterDeadline
                ? `Recorded ${result.businessName} (${result.referenceCode}) — flagged as received after the call's deadline. Check each document, then decide.`
                : `Recorded ${result.businessName} (${result.referenceCode}). Check each document, then approve or return it.`,
            })
            refresh()
          }}
        />
      )}

      {reviewing && (
        <ReviewModal
          vendor={reviewing}
          onClose={() => setReviewing(null)}
          onDecided={refresh}
          canCheckDocuments={canIntake}
          canDecide={canDecideEligibility}
        />
      )}

      {creatingFor && (
        <CreateAccountModal
          vendor={creatingFor}
          onClose={() => setCreatingFor(null)}
          onCreated={refresh}
        />
      )}
    </DashboardPage>
  )
}
