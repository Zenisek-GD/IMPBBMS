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
import { usePagination } from '../../components/ui/usePagination'

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

function ReviewModal({ vendor, onClose, onDecided }) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState([])

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
    <Modal title={`Review — ${vendor.businessName}`} onClose={onClose}>
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

      <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
        Remarks (required to return or blacklist)
      </label>
      <textarea
        rows={3}
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
        className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
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
          disabled={busy}
          onClick={() => decide('verify')}
          className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
        >
          VERIFY
        </button>
      </div>
    </Modal>
  )
}

export default function VendorVerification() {
  const { has } = usePermissions()
  const canCreateAccounts = has('bidders.createAccount')

  const [vendors, setVendors] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [reviewing, setReviewing] = useState(null)
  const [creatingFor, setCreatingFor] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [banner, setBanner] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    let cancelled = false
    biddingApi
      .fetchVendors(statusFilter ? { status: statusFilter } : {})
      .then((data) => {
        if (!cancelled) setVendors(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [statusFilter, refreshToken])

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

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(vendors)

  return (
    <DashboardPage>
      <PageHeader
        title="Bidder Verification"
        subtitle="Bidders are onboarded through this controlled flow — there is no public sign-up. Review the requirements, then issue the account."
        actions={
          <div className="flex flex-wrap gap-2">
            {pending > 0 && <Badge tone="warning">{pending} awaiting review</Badge>}
            {awaitingAccount > 0 && <Badge tone="info">{awaitingAccount} approved, no account</Badge>}
          </div>
        }
      />

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
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
        >
          <option value="">All statuses</option>
          {['draft', 'submitted', 'verified', 'returned', 'blacklisted'].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </Card>

      <Card title="Registered Bidders" icon={Users} bodyClassName="">
        {vendors.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">No bidders match those filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Business', 'Accredited email', 'Docs', 'Registration', 'Account', 'Actions'].map(
                    (head) => (
                      <th
                        key={head}
                        className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
                      >
                        {head}
                      </th>
                    )
                  )}
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
                        {vendor.registrationStatus === 'submitted' && (
                          <button
                            type="button"
                            onClick={() => setReviewing(vendor)}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy uppercase hover:underline"
                          >
                            <ShieldCheck size={12} /> Review
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

      {reviewing && (
        <ReviewModal vendor={reviewing} onClose={() => setReviewing(null)} onDecided={refresh} />
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
