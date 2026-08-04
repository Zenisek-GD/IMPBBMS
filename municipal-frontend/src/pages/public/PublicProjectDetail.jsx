import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  CalendarClock,
  Download,
  FileText,
  History,
  LayoutList,
  Paperclip,
  FileWarning,
  Check,
} from 'lucide-react'
import * as publicApi from '../../api/publicProjects'
import PublicHeader from '../../components/public/PublicHeader'
import PublicFooter from '../../components/public/PublicFooter'
import ProjectTimeline from '../../components/public/ProjectTimeline'

const peso = (value) =>
  value === null || value === undefined
    ? '—'
    : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const CATEGORY_STYLES = {
  completed: { label: 'Completed', className: 'border-success/25 bg-success/10 text-success', icon: CheckCircle2 },
  ongoing: { label: 'Ongoing', className: 'border-warning/25 bg-warning/10 text-warning', icon: Loader2 },
  upcoming: { label: 'Upcoming', className: 'border-navy/15 bg-chip text-navy', icon: CalendarClock },
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutList },
  { key: 'timeline', label: 'Transparency Timeline', icon: History },
  { key: 'documents', label: 'Documents', icon: Paperclip },
]

const readable = (value) =>
  typeof value === 'string'
    ? value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase())
    : '—'

function Section({ title, icon: Icon, children, action }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border-muted bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border-muted px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy">
          {Icon && <Icon size={16} />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">{label}</p>
      <p className={`mt-0.5 text-[13px] text-navy ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</p>
    </div>
  )
}

// Compact table shared by the record sections. `columns` is [label, accessor].
function RecordTable({ columns, rows, empty }) {
  if (!rows?.length) {
    return <p className="px-4 py-8 text-center text-[13px] text-text-faint">{empty}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-sidebar">
          <tr>
            {columns.map(([label]) => (
              <th
                key={label}
                className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border-muted">
              {columns.map(([label, accessor]) => (
                <td key={label} className="px-4 py-2.5 text-[13px] whitespace-nowrap text-text-secondary">
                  {accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PublicProjectDetail() {
  const { id } = useParams()
  const [tab, setTab] = useState('overview')

  // The loaded record carries the id it belongs to, so "still loading" is
  // derived from a mismatch rather than from a flag reset synchronously inside
  // the effect. Without that, navigating between projects renders twice before
  // the request is even issued.
  const [loaded, setLoaded] = useState({ id: null, status: 'loading', project: null })
  const [extras, setExtras] = useState({ id: null, timeline: null, documents: [] })

  useEffect(() => {
    let cancelled = false

    publicApi
      .fetchPublicProject(id)
      .then((data) => {
        if (cancelled) return
        setLoaded({ id, status: 'ready', project: data })
        document.title = `${data.projectTitle} · Transparency Portal`
      })
      .catch((err) => {
        if (cancelled) return
        setLoaded({ id, status: err?.response?.status === 404 ? 'notFound' : 'failed', project: null })
      })

    // The timeline and documents are fetched alongside rather than on tab
    // switch, so moving between tabs is instant and a citizen who lands here
    // from a link is not made to wait twice.
    Promise.all([
      publicApi.fetchProjectTimeline(id).catch(() => null),
      publicApi.fetchProjectDocuments(id).catch(() => []),
    ]).then(([timeline, documents]) => {
      if (!cancelled) setExtras({ id, timeline, documents })
    })

    return () => {
      cancelled = true
    }
  }, [id])

  const status = loaded.id === id ? loaded.status : 'loading'
  const project = loaded.id === id ? loaded.project : null
  const timeline = extras.id === id ? extras.timeline : null
  const documents = extras.id === id ? extras.documents : []

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <PublicHeader />
        <main className="flex-1 px-8 py-16 text-center text-[13px] text-text-faint">Loading project…</main>
        <PublicFooter />
      </div>
    )
  }

  if (status !== 'ready') {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <PublicHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
          <FileWarning size={26} className="mx-auto text-text-faint" />
          <h1 className="mt-3 text-lg font-semibold text-navy">
            {status === 'notFound' ? 'This project is not published' : 'Records could not be loaded'}
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-text-secondary">
            {status === 'notFound'
              ? 'It may still be in preparation, or the link may be incorrect. Only projects the LGU has approved appear here.'
              : 'The transparency service is not responding. Please try again shortly.'}
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded border border-navy px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-navy uppercase"
          >
            <ArrowLeft size={13} /> Back to all projects
          </Link>
        </main>
        <PublicFooter />
      </div>
    )
  }

  const style = CATEGORY_STYLES[project.category] ?? CATEGORY_STYLES.upcoming
  const { financials, records } = project

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.02em] text-text-secondary hover:text-navy"
        >
          <ArrowLeft size={14} /> All projects
        </Link>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium tracking-[0.03em] uppercase ${style.className}`}
            >
              <style.icon size={12} /> {style.label}
            </span>
            <span className="rounded-sm border border-border-muted bg-surface px-2 py-0.5 text-[11px] font-medium tracking-[0.03em] text-text-secondary">
              FY {project.fiscalYear}
            </span>
            {project.referenceNo && (
              <span className="rounded-sm border border-border-muted bg-surface px-2 py-0.5 font-mono text-[11px] text-navy">
                {project.referenceNo}
              </span>
            )}
          </div>

          <h1 className="mt-3 max-w-4xl text-lg leading-tight font-bold tracking-[-0.02em] text-navy sm:text-[22px]">
            {project.projectTitle}
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            {project.implementingUnit}
            {project.procurementMode && ` · ${project.procurementMode}`}
          </p>
          {project.description && (
            <p className="mt-3 max-w-4xl text-[13px] leading-relaxed text-text-secondary">{project.description}</p>
          )}
        </header>

        {/* Lifecycle stepper — the whole journey at a glance, from request to
            completion, with the stage actually reached marked. */}
        <section className="mt-6 overflow-hidden rounded-lg border border-border-muted bg-surface">
          <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
            <h2 className="text-[13px] font-semibold text-navy">Project Lifecycle</h2>
            <span className="text-[11px] tracking-[0.03em] text-text-secondary uppercase">
              {project.phaseLabel} · {project.progressPercent}%
            </span>
          </div>
          <ol className="grid gap-x-4 gap-y-5 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
            {project.phases.map((phase) => (
              <li key={phase.key} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    phase.current
                      ? 'border-navy bg-accent text-accent-fg'
                      : phase.reached
                        ? 'border-success/30 bg-success/10 text-success'
                        : 'border-border-muted bg-surface text-text-faint'
                  }`}
                >
                  {phase.reached && !phase.current ? <Check size={13} /> : null}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-[13px] font-semibold ${
                      phase.reached ? 'text-navy' : 'text-text-faint'
                    }`}
                  >
                    {phase.label}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-text-faint">{phase.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <nav className="mt-6 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={`flex items-center gap-2 rounded border px-4 py-2 text-[11px] font-medium tracking-[0.03em] uppercase transition-colors ${
                tab === item.key
                  ? 'border-navy bg-accent text-accent-fg'
                  : 'border-border-muted bg-surface text-text-secondary hover:border-navy/40'
              }`}
            >
              <item.icon size={13} />
              {item.label}
              {item.key === 'documents' && documents.length > 0 && (
                <span className={tab === item.key ? 'text-white/70' : 'text-text-faint'}>{documents.length}</span>
              )}
            </button>
          ))}
        </nav>

        {tab === 'overview' && (
          <div className="mt-4 flex flex-col gap-4">
            <Section title="Budget and Financial Information" icon={FileText}>
              <div className="grid gap-5 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Approved Budget (ABC)" value={peso(financials.budget)} />
                <Field label="Awarded Amount" value={peso(financials.awardedAmount)} />
                <Field label="Contract Amount" value={peso(financials.contractAmount)} />
                <Field label="Amount Disbursed" value={peso(financials.disbursedAmount)} />
              </div>

              {financials.savings !== null && (
                <div className="grid gap-5 border-t border-border-muted px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label="Savings against budget"
                    value={`${peso(financials.savings)}${
                      financials.savingsPercent !== null ? ` (${financials.savingsPercent}%)` : ''
                    }`}
                  />
                  <Field label="Fund source" value={project.fundSource} />
                  <Field
                    label="Payment progress"
                    value={`${financials.utilisationPercent}% of contract released`}
                  />
                  <Field label="Awarded to" value={project.awardedTo} />
                </div>
              )}

              <div className="grid gap-5 border-t border-border-muted px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Notice of Award" value={project.noaNumber} mono />
                <Field label="Date of award" value={shortDate(project.noaDate)} />
                <Field label="Contract number" value={project.contractNo} mono />
                <Field
                  label="Target schedule"
                  value={`${project.targetStartQuarter} → ${project.targetCompletionQuarter} ${project.fiscalYear}`}
                />
              </div>
            </Section>

            <Section title="Purchase Requisitions" icon={LayoutList}>
              <RecordTable
                empty="No requisition has been raised for this project yet."
                rows={records.requisitions}
                columns={[
                  ['PR Number', (row) => <span className="font-mono text-xs text-navy">{row.prNumber}</span>],
                  ['Amount', (row) => peso(row.totalAmount)],
                  ['Date required', (row) => shortDate(row.dateRequired)],
                  ['Status', (row) => readable(row.status)],
                ]}
              />
            </Section>

            <Section title="Solicitations" icon={LayoutList}>
              <RecordTable
                empty="This project has not been advertised for bidding yet."
                rows={records.solicitations}
                columns={[
                  ['Reference', (row) => <span className="font-mono text-xs text-navy">{row.referenceNo}</span>],
                  ['Mode', (row) => row.mode ?? '—'],
                  ['ABC', (row) => peso(row.abc)],
                  ['Published', (row) => shortDate(row.publishDate)],
                  ['Closing', (row) => shortDate(row.closingDate)],
                  ['Bids', (row) => row.bidsReceived],
                  ['Status', (row) => readable(row.status)],
                ]}
              />
            </Section>

            <Section title="Awards and Contracts" icon={LayoutList}>
              <RecordTable
                empty="No award has been issued for this project yet."
                rows={records.awards}
                columns={[
                  ['NOA', (row) => <span className="font-mono text-xs text-navy">{row.noaNumber}</span>],
                  ['Date', (row) => shortDate(row.noaDate)],
                  ['Amount', (row) => peso(row.amount)],
                  ['Awarded to', (row) => row.awardedTo ?? '—'],
                  ['Status', (row) => readable(row.status)],
                ]}
              />
              {records.contracts.length > 0 && (
                <RecordTable
                  empty=""
                  rows={records.contracts}
                  columns={[
                    ['Contract', (row) => <span className="font-mono text-xs text-navy">{row.contractNo}</span>],
                    ['Amount', (row) => peso(row.amount)],
                    ['Start', (row) => shortDate(row.startDate)],
                    ['Delivery due', (row) => shortDate(row.deliveryDeadline)],
                    ['Status', (row) => readable(row.status)],
                  ]}
                />
              )}
            </Section>

            <Section title="Delivery and Payment" icon={LayoutList}>
              <RecordTable
                empty="No delivery has been reported for this project yet."
                rows={records.deliveries}
                columns={[
                  ['Description', (row) => row.description ?? '—'],
                  ['Delivered', (row) => shortDate(row.deliveredAt)],
                  ['Inspected', (row) => shortDate(row.inspectedAt)],
                  ['Status', (row) => readable(row.status)],
                ]}
              />
              {records.payments.length > 0 && (
                <RecordTable
                  empty=""
                  rows={records.payments}
                  columns={[
                    [
                      'Disbursement',
                      (row) => <span className="font-mono text-xs text-navy">{row.disbursementNo}</span>,
                    ],
                    ['Amount', (row) => peso(row.amount)],
                    ['Released', (row) => shortDate(row.releasedAt)],
                    ['Status', (row) => readable(row.status)],
                  ]}
                />
              )}
            </Section>
          </div>
        )}

        {tab === 'timeline' && (
          <div className="mt-4">
            <Section title="Complete Project Timeline" icon={History}>
              {timeline ? (
                <ProjectTimeline events={timeline.events} disclosure={timeline.disclosure} />
              ) : (
                <p className="px-4 py-10 text-center text-[13px] text-text-faint">Loading timeline…</p>
              )}
            </Section>
          </div>
        )}

        {tab === 'documents' && (
          <div className="mt-4">
            <Section title="Supporting Documents" icon={Paperclip}>
              {documents.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] text-text-faint">
                    No public documents are attached to this project.
                  </p>
                  <p className="mx-auto mt-1.5 max-w-lg text-[12px] text-text-faint">
                    Only solicitation documents and signed contracts are published. Supplier eligibility files
                    and bid submissions are not public records.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border-muted">
                  {documents.map((document) => (
                    <li
                      key={document.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-medium text-navy">
                          <FileText size={14} className="shrink-0 text-text-faint" />
                          {document.label ?? document.filename}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-faint">
                          {document.filename} · {Math.max(1, Math.round(document.sizeBytes / 1024))} KB ·
                          attached to {document.attachedTo} · {shortDate(document.uploadedAt)}
                        </p>
                        <p
                          className="mt-0.5 font-mono text-[10px] break-all text-text-faint"
                          title="SHA-256 checksum — verify your download matches the published file"
                        >
                          {document.checksum.slice(0, 32)}…
                        </p>
                      </div>
                      <a
                        href={publicApi.projectDocumentUrl(project.id, document.id)}
                        className="flex shrink-0 items-center gap-1.5 rounded border border-navy px-3 py-1.5 text-[11px] font-medium tracking-[0.03em] text-navy uppercase hover:bg-accent hover:text-accent-fg"
                      >
                        <Download size={13} /> Download
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  )
}
