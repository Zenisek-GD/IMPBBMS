import { useEffect, useState } from 'react'
import { Eye, ShieldCheck, AlertTriangle, FileText } from 'lucide-react'
import * as observersApi from '../../api/observers'
import {
  OBSERVABLE_STAGE_LABELS,
  OBSERVER_SECTOR_LABELS,
  OBSERVER_SECTOR_TONES,
  ATTENDANCE_LABELS,
  ATTENDANCE_TONES,
  OBSERVER_NOTICE_DAYS,
  OBSERVATION_REPORT_DAYS,
} from '../../api/observers'
import * as biddingApi from '../../api/bidding'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

const dateTime = (value) => (value ? new Date(value).toLocaleString() : '—')

// ── Inviting observers to a stage (Sec. 43.1–43.2) ───────────────────────────
function InviteModal({ rfq, organizations, onClose, onDone }) {
  const [stage, setStage] = useState('bidEvaluation')
  const [scheduledAt, setScheduledAt] = useState('')
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Sec. 43.2 — at least five calendar days' notice. Computed as the officer
  // types so they find out before submitting, not after.
  const noticeDays = scheduledAt
    ? Math.floor((new Date(scheduledAt) - new Date()) / 86_400_000)
    : null
  const noticeShort = noticeDays !== null && noticeDays < OBSERVER_NOTICE_DAYS

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    )

  const sectors = new Set(
    organizations.filter((o) => selected.includes(o.id)).map((o) => o.sector)
  )
  const compliant = sectors.has('coa') && sectors.has('privateGroup') && sectors.has('csoOrPo')

  return (
    <Modal title={`Invite observers — ${rfq.referenceNo}`} onClose={onClose}>
      <label className="mb-1 block text-xs font-medium text-text-secondary">Procurement stage</label>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      >
        {Object.entries(OBSERVABLE_STAGE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        When the activity is scheduled
      </label>
      <input
        type="datetime-local"
        value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
        className="mb-1 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />
      {noticeDays !== null && (
        <p className={`mb-3 text-xs ${noticeShort ? 'text-danger' : 'text-text-secondary'}`}>
          {noticeShort
            ? `Only ${noticeDays} day(s)' notice. RA 12009 Sec. 43.2 requires at least ${OBSERVER_NOTICE_DAYS} calendar days.`
            : `${noticeDays} days' notice — meets the Sec. 43.2 minimum of ${OBSERVER_NOTICE_DAYS}.`}
        </p>
      )}

      <p className="mb-2 text-xs font-medium text-text-secondary">
        Organisations to invite — the COA representative plus at least one private group and one CSO/PO
      </p>
      <div className="mb-2 max-h-48 space-y-1 overflow-y-auto rounded border border-border-muted p-2">
        {organizations.length === 0 && (
          <p className="px-2 py-3 text-sm text-text-secondary">
            No organisations on the roster yet. Add them first.
          </p>
        )}
        {organizations.map((organization) => (
          <label
            key={organization.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-muted"
          >
            <input
              type="checkbox"
              checked={selected.includes(organization.id)}
              onChange={() => toggle(organization.id)}
            />
            <span className="flex-1 text-navy">{organization.name}</span>
            <Badge tone={OBSERVER_SECTOR_TONES[organization.sector]}>
              {OBSERVER_SECTOR_LABELS[organization.sector]}
            </Badge>
          </label>
        ))}
      </div>

      <p className={`mb-3 text-xs ${compliant ? 'text-success' : 'text-warning'}`}>
        {compliant
          ? 'COA, a private group and a CSO/PO are all represented — this stage meets Sec. 43.1.'
          : 'Sec. 43.1 asks for the COA representative and at least two observers: one private group and one CSO/PO.'}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <Button
          disabled={busy || selected.length === 0 || !scheduledAt}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await observersApi.inviteObservers(rfq.id, {
                stage,
                scheduledAt: new Date(scheduledAt).toISOString(),
                organizationIds: selected,
              })
              onDone()
            } catch (err) {
              setError(err?.response?.data?.message ?? 'Could not send the invitations.')
            } finally {
              setBusy(false)
            }
          }}
        >
          SEND INVITATIONS
        </Button>
      </div>
    </Modal>
  )
}

// ── The observer's own report (Sec. 43.4) ────────────────────────────────────
function ReportModal({ invitation, onClose, onDone }) {
  const [complianceAssessment, setAssessment] = useState('')
  const [areasForImprovement, setAreas] = useState('')
  const [findingsRegular, setRegular] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Modal title={`Observation report — ${invitation.stageLabel}`} onClose={onClose}>
      <p className="mb-3 rounded border border-border-muted bg-surface-muted px-3 py-2 text-xs text-text-secondary">
        Sec. 43.4 — the report goes to the Head of the Procuring Entity, PhilGEPS, COA, the GPPB and
        the Ombudsman. If none is filed within {OBSERVATION_REPORT_DAYS} calendar days of the
        activity, the proceedings are presumed to have followed the correct procedure.
      </p>

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        Assessment of the BAC&rsquo;s compliance with the IRR
      </label>
      <textarea
        rows={4}
        value={complianceAssessment}
        onChange={(e) => setAssessment(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      <label className="mb-1 block text-xs font-medium text-text-secondary">
        Areas for improvement (optional)
      </label>
      <textarea
        rows={3}
        value={areasForImprovement}
        onChange={(e) => setAreas(e.target.value)}
        className="mb-3 w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
      />

      <label className="mb-3 flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" checked={findingsRegular} onChange={(e) => setRegular(e.target.checked)} />
        I found the proceedings regular
      </label>

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          CANCEL
        </Button>
        <Button
          disabled={busy || !complianceAssessment.trim()}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await observersApi.submitObservationReport(invitation.id, {
                complianceAssessment,
                areasForImprovement,
                findingsRegular,
                furnishedTo: { hope: true, philgeps: true, coa: true, gppb: true, ombudsman: true },
              })
              onDone()
            } catch (err) {
              setError(err?.response?.data?.message ?? 'Could not file the report.')
            } finally {
              setBusy(false)
            }
          }}
        >
          FILE REPORT
        </Button>
      </div>
    </Modal>
  )
}

export default function Observers() {
  const { has } = usePermissions()
  const canManage = has('observer.manage')
  const canParticipate = has('observer.participate')

  const [organizations, setOrganizations] = useState([])
  const [invitations, setInvitations] = useState([])
  const [rfqs, setRfqs] = useState([])
  const [inviting, setInviting] = useState(null)
  const [reporting, setReporting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Bumped after any mutation to re-run the effect. The fetch lives inside the
  // effect rather than in a callback the effect calls, which is the pattern the
  // rest of the app uses and what keeps React from warning about cascading
  // renders.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((key) => key + 1)

  useEffect(() => {
    let cancelled = false

    const fetchAll = async () => {
      try {
        const [orgs, invites] = await Promise.all([
          observersApi.fetchObserverOrganizations(),
          observersApi.fetchObserverInvitations(),
        ])
        const solicitations = canManage ? await biddingApi.fetchRfqs() : []
        if (cancelled) return
        setOrganizations(orgs)
        setInvitations(invites)
        setRfqs(solicitations)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message ?? 'Could not load observer records.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()
    return () => {
      cancelled = true
    }
  }, [canManage, reloadKey])

  const markAttended = async (invitation) => {
    try {
      // Sec. 43.5 — an observer enters a confidentiality agreement in all
      // instances before attending, so recording attendance records that too.
      await observersApi.recordObserverAttendance(invitation.id, {
        attendance: 'attended',
        confidentialityAgreed: true,
      })
      reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Could not record attendance.')
    }
  }

  return (
    <DashboardPage>
      <PageHeader
        icon={Eye}
        title="Observers"
        subtitle="RA 12009 Sec. 43 — the COA representative, a relevant private group and a civil society organisation sit in on the committee's proceedings."
      />

      {error && (
        <p role="alert" className="mb-4 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {canManage && (
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Solicitations</h2>
            <span className="text-xs text-text-secondary">
              Observers must be invited at least {OBSERVER_NOTICE_DAYS} calendar days before each stage
            </span>
          </div>
          <div className="space-y-2">
            {rfqs.length === 0 && <p className="text-sm text-text-secondary">No solicitations yet.</p>}
            {rfqs.map((rfq) => (
              <div
                key={rfq.id}
                className="flex items-center justify-between rounded border border-border-muted px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-navy">{rfq.referenceNo}</p>
                  <p className="text-xs text-text-secondary">{rfq.title}</p>
                </div>
                <Button variant="secondary" onClick={() => setInviting(rfq)}>
                  INVITE OBSERVERS
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-navy">
          {canParticipate && !canManage ? 'Proceedings you were invited to' : 'Invitations'}
        </h2>
        {loading && <p className="text-sm text-text-secondary">Loading…</p>}
        {!loading && invitations.length === 0 && (
          <p className="text-sm text-text-secondary">No invitations on record.</p>
        )}
        <div className="space-y-2">
          {invitations.map((invitation) => (
            <div key={invitation.id} className="rounded border border-border-muted px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-navy">
                    {invitation.referenceNo} — {invitation.stageLabel}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {invitation.organizationName} · scheduled {dateTime(invitation.scheduledAt)} ·{' '}
                    {invitation.noticeDays} days&rsquo; notice
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {invitation.sector && (
                    <Badge tone={OBSERVER_SECTOR_TONES[invitation.sector]}>
                      {OBSERVER_SECTOR_LABELS[invitation.sector]}
                    </Badge>
                  )}
                  <Badge tone={ATTENDANCE_TONES[invitation.attendance]}>
                    {ATTENDANCE_LABELS[invitation.attendance]}
                  </Badge>
                  {invitation.report && (
                    <Badge tone={invitation.report.findingsRegular ? 'success' : 'danger'}>
                      {invitation.report.findingsRegular ? 'Reported regular' : 'Irregularities noted'}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                {invitation.attendance === 'invited' && (canManage || canParticipate) && (
                  <Button variant="secondary" onClick={() => markAttended(invitation)}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    RECORD ATTENDANCE
                  </Button>
                )}
                {invitation.attendance === 'attended' && !invitation.report && canParticipate && (
                  <Button variant="secondary" onClick={() => setReporting(invitation)}>
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    FILE OBSERVATION REPORT
                  </Button>
                )}
                {!invitation.noticeCompliant && (
                  <span className="flex items-center gap-1 text-xs text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Short notice
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {inviting && (
        <InviteModal
          rfq={inviting}
          organizations={organizations}
          onClose={() => setInviting(null)}
          onDone={() => {
            setInviting(null)
            reload()
          }}
        />
      )}
      {reporting && (
        <ReportModal
          invitation={reporting}
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null)
            reload()
          }}
        />
      )}
    </DashboardPage>
  )
}
