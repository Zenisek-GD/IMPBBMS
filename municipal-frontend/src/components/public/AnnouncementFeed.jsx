import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Pin, CalendarClock, FileWarning, ArrowRight, MapPin } from 'lucide-react'
import * as publicApi from '../../api/publicProjects'
import Pagination from '../ui/Pagination'
import { usePagination } from '../ui/usePagination'

// ─────────────────────────────────────────────────────────────────────────────
// The public announcements feed, laid out as a news section.
//
// The first item gets the lead treatment — wider measure, larger headline, full
// standfirst — and the rest run as a two-column grid of article cards beneath a
// rule. That is the shape a reader already knows from any news site, and it does
// something a flat list could not: it tells them which notice the office
// considers most important, which is exactly what the `pinned` flag means.
//
// Two kinds of entry share the feed. A *written notice* is posted by the BAC
// Secretariat or an administrator, and can exist before a procurement formally
// starts — which is the whole reason the office publishes early, to give
// prospective bidders time to get accredited. A *solicitation* is derived
// automatically from an RFQ that has gone live. The byline names which, so a
// reader can tell an official notice from an automatic listing.
// ─────────────────────────────────────────────────────────────────────────────

const peso = (value) =>
  value === null || value === undefined
    ? '—'
    : `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

// Short form in the kicker, full date-and-time only where a deadline makes the
// hour matter — a news page does not repeat a long date down the whole column.
const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'

const CATEGORY_LABELS = {
  procurementOpportunity: 'Procurement Opportunity',
  newProject: 'New Project',
  systemUpdate: 'System Update',
  general: 'General Notice',
}

// Category is carried by a small text kicker in the accent colour, the way a
// news site labels a section — not by a coloured block per card.
const CATEGORY_TONES = {
  procurementOpportunity: 'text-success',
  newProject: 'text-success',
  systemUpdate: 'text-text-secondary',
  general: 'text-text-secondary',
}

// Trims the body to a standfirst without cutting a word in half.
const excerpt = (text, limit) => {
  if (!text) return ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  return `${flat.slice(0, flat.lastIndexOf(' ', limit))}…`
}

function Kicker({ entry }) {
  const label = CATEGORY_LABELS[entry.category] ?? 'Notice'
  const tone = CATEGORY_TONES[entry.category] ?? 'text-text-secondary'

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium tracking-[0.06em] uppercase">
      <span className={tone}>{label}</span>
      {entry.pinned && (
        <>
          <span className="text-border-strong" aria-hidden>
            •
          </span>
          <span className="inline-flex items-center gap-1 text-text-faint">
            <Pin size={10} /> Pinned
          </span>
        </>
      )}
      <span className="text-border-strong" aria-hidden>
        •
      </span>
      <span className="text-text-faint">
        {entry.source === 'solicitation' ? 'Auto-listed' : 'Posted'}{' '}
        {shortDate(entry.publishedAt)}
      </span>
    </div>
  )
}

// The deadline, and where to bring the papers.
//
// This used to end in a "Submit requirements" button leading to an online form.
// There is no such form: eligibility documents are submitted in person at the BAC
// Secretariat office. So the callout gives a prospective bidder the two things
// they actually need — the cutoff, and that they have to come in.
function DeadlineNote({ deadline, daysRemaining, compact = false }) {
  const urgent = daysRemaining !== null && daysRemaining <= 3

  return (
    <div
      className={`mt-4 rounded-lg border px-4 py-3 ${
        urgent ? 'border-warning/30 bg-warning/10' : 'border-border-muted bg-sidebar'
      }`}
    >
      <p className="flex items-start gap-2 text-[12.5px] font-medium text-navy">
        <CalendarClock
          size={15}
          className={`mt-px shrink-0 ${urgent ? 'text-warning' : 'text-text-secondary'}`}
        />
        Requirements must be submitted by {dateTime(deadline)}
      </p>
      <p className="mt-1 pl-[23px] text-[12px] leading-relaxed text-text-secondary">
        {daysRemaining !== null && daysRemaining <= 0
          ? 'Closing today.'
          : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left.`}{' '}
        {!compact && (
          <>
            <MapPin size={11} className="mb-0.5 inline shrink-0" /> Bring your eligibility and
            accreditation documents to the BAC Secretariat office in person — they cannot be
            submitted online. The BAC verifies them and Admin/IT issues your account.
          </>
        )}
        {compact && 'Submit in person at the BAC Secretariat office.'}
      </p>
    </div>
  )
}

// Facts a derived solicitation carries that a written notice does not.
function SolicitationFacts({ entry, compact = false }) {
  return (
    <dl
      className={`mt-4 grid gap-3 border-t border-border-muted pt-4 ${
        compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
      }`}
    >
      <div>
        <dt className="text-[10.5px] tracking-[0.05em] text-text-faint uppercase">Mode</dt>
        <dd className="mt-1 text-[13px] text-text-secondary">{entry.mode ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-[10.5px] tracking-[0.05em] text-text-faint uppercase">Budget (ABC)</dt>
        <dd className="tabular-nums mt-1 text-[13.5px] font-semibold text-navy">
          {peso(entry.abc)}
        </dd>
      </div>
      <div className={compact ? 'col-span-2' : ''}>
        <dt className="text-[10.5px] tracking-[0.05em] text-text-faint uppercase">Bids close</dt>
        <dd className="tabular-nums mt-1 text-[13px] text-text-secondary">
          {shortDate(entry.closingDate)}
          {entry.closingInDays !== null && entry.closingInDays >= 0 && (
            <span className="text-text-faint"> · in {entry.closingInDays}d</span>
          )}
        </dd>
      </div>
    </dl>
  )
}

// ── The lead story ──────────────────────────────────────────────────────────
function LeadArticle({ entry }) {
  return (
    <article className="border-b border-border-muted pb-8">
      <Kicker entry={entry} />

      <h3 className="mt-3 max-w-3xl text-[24px] leading-[1.2] font-semibold tracking-[-0.025em] text-navy sm:text-[28px]">
        {entry.title}
      </h3>

      {entry.projectTitle && (
        <p className="mt-2 text-[13.5px] text-text-secondary">
          {entry.implementingUnit ? `${entry.implementingUnit} · ` : ''}
          {entry.projectTitle}
        </p>
      )}

      {/* The full body on the lead, not an excerpt: a procurement notice is short
          and the reader who came for it should not have to click through.
          `whitespace-pre-line` is what makes the plain-text authoring field
          enough — the paragraphs an officer typed survive without the form ever
          having accepted markup. */}
      {entry.body && (
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed whitespace-pre-line text-text-secondary">
          {entry.body}
        </p>
      )}

      {entry.referenceNo && (
        <p className="mt-4 font-mono text-[12px] text-text-faint">Ref. {entry.referenceNo}</p>
      )}

      {entry.source === 'solicitation' && <SolicitationFacts entry={entry} />}

      {entry.registrationDeadline && (
        <DeadlineNote
          deadline={entry.registrationDeadline}
          daysRemaining={entry.registrationClosesInDays}
        />
      )}

      {entry.projectId && (
        <Link
          to={`/projects/${entry.projectId}`}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          View the project record <ArrowRight size={14} />
        </Link>
      )}
    </article>
  )
}

// ── A card in the grid below the lead ───────────────────────────────────────
function ArticleCard({ entry }) {
  return (
    <article className="flex flex-col rounded-xl border border-border-muted bg-surface p-5 shadow-sm">
      <Kicker entry={entry} />

      <h3 className="mt-2.5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-navy">
        {entry.title}
      </h3>

      {entry.projectTitle && (
        <p className="mt-1 text-[12.5px] text-text-secondary">
          {entry.implementingUnit ? `${entry.implementingUnit} · ` : ''}
          {entry.projectTitle}
        </p>
      )}

      {entry.body && (
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-text-secondary">
          {excerpt(entry.body, 190)}
        </p>
      )}

      {entry.referenceNo && (
        <p className="mt-3 font-mono text-[11.5px] text-text-faint">Ref. {entry.referenceNo}</p>
      )}

      {entry.source === 'solicitation' && <SolicitationFacts entry={entry} compact />}

      {entry.registrationDeadline && (
        <DeadlineNote
          deadline={entry.registrationDeadline}
          daysRemaining={entry.registrationClosesInDays}
          compact
        />
      )}

      {entry.projectId && (
        <Link
          to={`/projects/${entry.projectId}`}
          className="mt-auto pt-4 text-[13px] font-medium text-success decoration-1 underline-offset-2 hover:underline"
        >
          View the project record →
        </Link>
      )}
    </article>
  )
}

export default function AnnouncementFeed() {
  // The result carries the fact that it arrived, so "loading" is derived rather
  // than tracked by a flag set synchronously inside an effect — which this
  // repo's React Compiler lint rules reject.
  const [result, setResult] = useState({ loaded: false, entries: [], failed: false })

  useEffect(() => {
    let cancelled = false
    publicApi
      .fetchAnnouncements()
      .then((data) => {
        if (!cancelled) setResult({ loaded: true, entries: data, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ loaded: true, entries: [], failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { entries, failed, loaded } = result

  // Paged over the whole feed, then split lead-and-rest *within* the page, so
  // page two gets its own lead rather than opening with a headless grid.
  const { pageRows, paginationProps } = usePagination(entries, 7)
  const [lead, ...rest] = pageRows

  if (!loaded) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-44 animate-pulse rounded-xl bg-sidebar" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((key) => (
            <div key={key} className="h-40 animate-pulse rounded-xl bg-sidebar" />
          ))}
        </div>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border-muted bg-surface px-4 py-16 text-center">
        <FileWarning size={22} className="text-text-faint" />
        <p className="text-[15px] font-medium text-navy">Announcements could not be loaded</p>
        <p className="max-w-md text-[13.5px] text-text-secondary">
          The service is not responding. Please try again shortly.
        </p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border-muted bg-surface px-4 py-16 text-center">
        <Megaphone size={22} className="text-text-faint" />
        <p className="text-[15px] font-medium text-navy">No announcements right now</p>
        <p className="max-w-md text-[13.5px] text-text-secondary">
          Notices about upcoming procurement, open opportunities and system updates appear here.
        </p>
      </div>
    )
  }

  return (
    <>
      {lead && <LeadArticle entry={lead} />}

      {rest.length > 0 && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {rest.map((entry) => (
            <ArticleCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {entries.length > pageRows.length && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border-muted bg-surface">
          <Pagination {...paginationProps} label="announcements" pageSizeOptions={[7, 13, 25]} />
        </div>
      )}
    </>
  )
}
