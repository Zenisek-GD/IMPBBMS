import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Search,
  ArrowRight,
  ArrowDownRight,
  FileWarning,
  Building2,
  CheckCircle2,
  Loader2,
  CalendarClock,
  Scale,
  Lock,
  FileCheck2,
  SlidersHorizontal,
  ChevronDown,
  Plus,
  Minus,
  ShieldCheck,
} from 'lucide-react'
import * as publicApi from '../../api/publicProjects'
import { fetchPublicBranding } from '../../api/settings'
import PublicHeader from '../../components/public/PublicHeader'
import PublicFooter from '../../components/public/PublicFooter'
import AnnouncementFeed from '../../components/public/AnnouncementFeed'
import ContactPanel from '../../components/public/ContactPanel'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

// ─────────────────────────────────────────────────────────────────────────────
// The front door of the whole system: a visitor arrives with no account and no
// prompt to create one.
//
// Styled after the supplied dashboard reference — its design language, not its
// content. What was taken: generous corner radii, pill-shaped controls, one dark
// "feature" tile anchoring a row of light ones, small-caps muted labels above
// large figures, soft green chips, and a delta line under each figure. What was
// not: its colour-saturated charts everywhere, and any figure the data does not
// actually support. Every delta below is computed from real published records —
// there is no "than last month" here, because this system has no month-over-month
// series to honestly compare against.
//
// Backgrounds are white, per instruction: page and cards share one white, and
// hairline borders do the separating. That makes `border-border-muted` load
// bearing on every card rather than decorative.
// ─────────────────────────────────────────────────────────────────────────────

const peso = (value) =>
  value === null || value === undefined
    ? '—'
    : `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const compactPeso = (value) => {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  if (n >= 1_000_000_000) return `₱${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`
  return peso(n)
}

// `band` is the tinted strip across the head of a project card; `chip` is the
// inline pill used wherever a status appears in running text.
const CATEGORY_STYLES = {
  completed: {
    label: 'Completed',
    chip: 'bg-chip text-success',
    band: 'border-success/20 bg-chip text-success',
    text: 'text-success',
    icon: CheckCircle2,
  },
  ongoing: {
    label: 'Ongoing',
    chip: 'bg-warning/10 text-warning',
    band: 'border-warning/25 bg-warning/10 text-warning',
    text: 'text-warning',
    icon: Loader2,
  },
  upcoming: {
    label: 'Upcoming',
    chip: 'bg-sidebar text-navy',
    band: 'border-border-muted bg-sidebar text-navy',
    text: 'text-navy',
    icon: CalendarClock,
  },
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'upcoming', label: 'Upcoming' },
]

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'budget', label: 'Largest budget' },
  { key: 'title', label: 'Title A–Z' },
]

// Home spotlight: one open call + one recent award surfaced from data the page
// already holds, so the front page answers "what can I bid on" and "what was
// just awarded" without an extra fetch or a click into Announcements.
function HomeSpotlight({ projects, announcements }) {
  const openCall =
    (announcements ?? []).find(
      (entry) => entry?.source === 'solicitation' && entry?.closingInDays !== null && entry.closingInDays >= 0
    ) ??
    (announcements ?? []).find((entry) => entry?.source === 'solicitation') ??
    null
  const recentAward = (projects ?? []).find((project) => project?.awardedTo) ?? null

  if (!openCall && !recentAward) return null

  return (
    <section aria-label="Highlights" className="mt-4 grid gap-4 md:grid-cols-2">
      {openCall && (
        <Link
          to={openCall.projectId ? `/projects/${openCall.projectId}` : '/?view=announcements'}
          className="group rounded-xl border border-border-strong bg-surface p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-[11px] font-medium tracking-[0.06em] text-success uppercase">
            Open bidding now
          </p>
          <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold text-navy group-hover:underline">
            {openCall.title}
          </h3>
          <p className="mt-1 text-[12.5px] text-navy">
            {openCall.implementingUnit ? `${openCall.implementingUnit} • ` : ''}
            {openCall.referenceNo ?? ''}
          </p>
          <p className="tabular-nums mt-2 text-[13px] font-medium text-navy">
            {openCall.closingInDays !== null && openCall.closingInDays >= 0
              ? `Closes in ${openCall.closingInDays}d • ${openCall.closingDate ? new Date(openCall.closingDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
              : 'See announcement for deadline'}
          </p>
        </Link>
      )}
      {recentAward && (
        <Link
          to={`/projects/${recentAward.id}`}
          className="group rounded-xl border border-border-strong bg-surface p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-[11px] font-medium tracking-[0.06em] text-navy uppercase">
            Recently awarded
          </p>
          <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold text-navy group-hover:underline">
            {recentAward.projectTitle}
          </h3>
          <p className="mt-1 text-[12.5px] text-navy">
            {recentAward.awardedTo ?? ''}
          </p>
          <p className="tabular-nums mt-2 text-[13px] font-medium text-navy">
            {compactPeso(recentAward.financials?.contractAmount ?? recentAward.financials?.budget)}
          </p>
        </Link>
      )}
    </section>
  )
}

// ── The search field ────────────────────────────────────────────────────────
// Promoted out of the filter card and into the masthead. On a transparency
// portal the visitor almost always arrives with a specific thing in mind — a
// barangay, an office, a road — so search is the primary control, not one of
// five sitting in a toolbar below the fold. Rendered in exactly one place at a
// time: the masthead on the front page, the toolbar once a section is chosen.
// `bare` drops the border and shadow for use inside the masthead's combined
// control bar, where the bar itself already provides them.
function SearchField({ value, onChange, className = '', bare = false, id = 'portal-search' }) {
  return (
    <div className={`relative ${className}`} role="search">
      <label htmlFor={id} className="sr-only">
        Search procurement records by reference, title, office, or barangay
      </label>
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-navy"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by reference, title, office, or barangay"
        aria-label="Search procurement records by reference, title, office, or barangay"
        className={`w-full py-2.5 pr-4 pl-10 text-[14px] text-navy transition-colors placeholder:text-text-secondary focus:outline-none ${
          bare
            ? 'rounded-md bg-transparent focus:ring-2 focus:ring-accent/15'
            : 'rounded-md border border-border-strong bg-surface shadow-sm focus:border-accent focus:ring-2 focus:ring-accent/15'
        }`}
      />
    </div>
  )
}

// Highlights the matched substring in card titles so a search result explains
// why it matched. Case-insensitive, and bails out when there is no query.
function Highlighted({ text, query }) {
  if (!text || !query) return <>{text}</>
  const needle = query.trim().toLowerCase()
  if (!needle) return <>{text}</>
  const haystack = String(text)
  const index = haystack.toLowerCase().indexOf(needle)
  if (index === -1) return <>{text}</>
  return (
    <>
      {haystack.slice(0, index)}
      <mark className="rounded-sm bg-warning/20 px-0.5 text-inherit">
        {haystack.slice(index, index + needle.length)}
      </mark>
      {haystack.slice(index + needle.length)}
    </>
  )
}

// ── Key figures ─────────────────────────────────────────────────────────────
// Four figures on one hairline-divided rail, replacing four stacked cards.
//
// The previous treatment spent its one dark "feature" tile — by far the
// strongest visual signal on the page — on the project count, the least useful
// number here, while the money sat in lighter cards beside it. The eye landed
// hardest on the weakest content. It also repeated the ongoing/completed/
// upcoming split that the filter pills below already carry.
//
// Same four figures, same computed deltas, one quarter of the vertical space,
// and the count is now sized as what it is: a label for the list beneath it.
function LedgerStrip({ overview, savings, releaseRate }) {
  const total = overview?.totalProjects ?? 0

  const segments = [
    { key: 'ongoing', label: 'Ongoing', value: overview?.ongoing ?? 0, className: 'bg-accent' },
    {
      key: 'completed',
      label: 'Completed',
      value: overview?.completed ?? 0,
      className: 'bg-eco',
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      value: overview?.upcoming ?? 0,
      className: 'bg-text-faint',
    },
  ]

  const cells = [
    {
      label: 'Approved budget',
      value: overview ? compactPeso(overview.totalBudget) : '—',
      note: 'Authorised by appropriation ordinance',
    },
    {
      label: 'Total contracted',
      value: overview ? compactPeso(overview.totalContracted) : '—',
      delta: savings ? `${compactPeso(savings)} below budget` : null,
      note: overview?.contractedProjects
        ? `Across ${overview.contractedProjects} awarded ${
            overview.contractedProjects === 1 ? 'project' : 'projects'
          }`
        : 'No awards published yet',
    },
    {
      label: 'Total disbursed',
      value: overview ? compactPeso(overview.totalDisbursed) : '—',
      note:
        releaseRate !== null
          ? `${releaseRate}% of contracted value released`
          : 'Released from the treasury',
    },
  ]

  return (
    <section
      aria-label="Key figures"
      className="overflow-hidden rounded-xl border border-border-strong bg-border-strong shadow-sm"
    >
      {/* Hairlines come from a 1px grid gap showing the container colour
          through, rather than `divide-*`. Divide utilities follow document
          order, so on a wrapped two-column grid they draw rules in the wrong
          places; the gap draws them correctly at every breakpoint.
          Two across on a phone and four from `lg`: stacking all four full-width
          cost ~330px on mobile, and wrapping to 2×2 between 1024 and 1279px
          cost ~130px — the difference between the first project clearing the
          fold on a laptop and missing it. */}
      <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
        <div className="bg-surface p-4 sm:p-5">
          <p className="text-[12px] font-medium tracking-[0.06em] text-navy uppercase">
            On the public record
          </p>

          <p className="tabular-nums mt-2.5 text-[26px] leading-none font-semibold tracking-[-0.025em] text-navy">
            {overview ? total : '—'}
            <span className="ml-1.5 text-[13px] font-normal tracking-normal text-navy">
              {total === 1 ? 'project' : 'projects'}
            </span>
          </p>

          {/* Three real segments summing to the figure above. Kept from the old
              tile — it is the one piece of that card that earned its space. */}
          <div
            className="mt-3.5 flex h-1.5 overflow-hidden rounded-full bg-track"
            role="img"
            aria-label={`${overview?.ongoing ?? 0} ongoing, ${overview?.completed ?? 0} completed, ${overview?.upcoming ?? 0} upcoming`}
          >
            {total > 0 &&
              segments.map((s) => (
                <span
                  key={s.key}
                  className={s.className}
                  style={{ width: `${(s.value / total) * 100}%` }}
                />
              ))}
          </div>

          {/* Always visible now: on mobile the filter pills sit far below, so
              hiding the legend left the bar unexplained. Wraps to two lines
              at most on narrow screens. */}
          <ul className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {segments.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-1.5 text-[12px] text-navy"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.className}`} />
                {s.label}
                <span className="tabular-nums font-medium text-navy">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col bg-surface p-4 sm:p-5">
            <p className="text-[12px] font-medium tracking-[0.06em] text-navy uppercase">
              {cell.label}
            </p>

            <p className="tabular-nums mt-2.5 text-[21px] leading-none font-semibold tracking-[-0.025em] text-navy sm:text-[26px]">
              {cell.value}
            </p>

            {cell.delta && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-success">
                <ArrowDownRight size={13} className="shrink-0" />
                {cell.delta}
              </p>
            )}

            {/* Qualifying note is what makes a figure quotable rather than just
                large. Always rendered now — on mobile it clamps to two lines
                instead of vanishing, so numbers never appear unqualified. */}
            <p className="mt-auto line-clamp-2 pt-2 text-[12px] leading-snug text-navy sm:pt-3">
              {cell.note}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-strong bg-surface px-4 py-2.5 sm:px-5">
        <p className="text-[12px] text-navy">
          Live from published plans, awards and payments
        </p>
        <details className="text-[12px] text-navy">
          <summary className="cursor-pointer font-medium text-navy underline-offset-2 hover:underline">
            How figures are computed
          </summary>
          <p className="mt-1 max-w-xl leading-relaxed">
            Savings compare contracted value against the budget of awarded projects only.
            Release rate is disbursed over contracted. Only approved and published records are counted.
          </p>
        </details>
      </div>
    </section>
  )
}

// ── Project card ────────────────────────────────────────────────────────────
// Card/box layout, kept as it was by request. Restyled to the reference: larger
// radius, hairline border on white, soft green status chip, green progress bar.
// ── ABOUT ────────────────────────────────────────────────────────────────────
// The fourth section in the header's pill. It exists because the answers to the
// three questions a citizen actually arrives with — what is this, is it
// complete, and how do I bid — were previously buried in a three-dot menu or not
// stated at all.
//
// Every claim here is one the system can stand behind. There is no "our mission"
// paragraph, because a transparency portal that opens with marketing copy has
// already told you what it is.
function AboutPanel({ overview }) {
  const items = [
    {
      icon: Scale,
      title: 'What the law requires',
      body: 'RA 12009, the New Government Procurement Act, and its Implementing Rules require procurement information to be publicly accessible. This portal is how this municipality meets that — it is not a summary written after the fact, it is the record itself.',
    },
    {
      icon: Building2,
      title: 'What is published',
      body: 'Approved procurement plans, advertised biddings, awarded contracts, deliveries and payments. Each record carries the office that raised it and the officials who signed it, so a project can be traced from the plan it came from to the peso that paid for it.',
    },
    {
      icon: Lock,
      title: 'What is not published — and why',
      body: 'Drafts, internal remarks, evaluator scores and anything before an award are withheld. Publishing a bid under evaluation would let a competitor read it; publishing a draft would present a proposal as a decision. Records appear here once they are approved.',
    },
    {
      icon: FileCheck2,
      title: 'Becoming a bidder',
      body: 'Eligibility requirements are submitted in person at the BAC Secretariat office. The Secretariat checks each requirement, the Bids and Awards Committee determines eligibility, and Admin/IT issues the account. There is no online sign-up.',
    },
  ]

  const steps = [
    { n: '1', title: 'Visit the BAC Secretariat', body: 'Bring eligibility and accreditation documents in person during office hours.' },
    { n: '2', title: 'BAC verifies eligibility', body: 'The Secretariat checks each requirement; the BAC determines eligibility.' },
    { n: '3', title: 'Receive your bidder account', body: 'Admin/IT issues the account. Watch Announcements for open opportunities.' },
  ]

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <section
            key={item.title}
            className="rounded-xl border border-border-strong bg-surface p-5 shadow-sm"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
              <item.icon size={17} />
            </span>
            <h3 className="mt-3.5 text-[15px] font-semibold text-navy">{item.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-navy">{item.body}</p>
          </section>
        ))}
      </div>

      {/* Three-step bidder journey: the most-asked citizen task, visualised so
          nobody has to infer the process from a paragraph. Anchored for direct
          links from the masthead CTAs. */}
      <section
        id="bidder"
        aria-label="How to become a bidder in three steps"
        className="scroll-mt-24 rounded-xl border border-border-strong bg-surface p-5 shadow-sm"
      >
        <h3 className="text-[15px] font-semibold text-navy">How to become a bidder in 3 steps</h3>
        <p className="mt-1 text-[13px] text-navy">
          There is no online sign-up. Accreditation happens at the counter.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.n} className="rounded-lg bg-sidebar p-4">
              <p className="flex size-7 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-fg">
                {step.n}
              </p>
              <p className="mt-2.5 text-[13.5px] font-semibold text-navy">{step.title}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-navy">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12.5px] text-navy">
          Bring questions to the BAC Secretariat office in person. Check{' '}
          <Link to="/?view=announcements" className="font-medium text-navy underline underline-offset-2">
            Announcements
          </Link>{' '}
          for calls that are open now.
        </p>
      </section>

      {/* Contact used to be its own nav section, which put "write to us" at the
          same rank as "here is the record" — and asked for a message before the
          reader had been told what the portal holds or who runs it. It reads
          better as the last thing in About: you learn what is published, what is
          withheld and why, and then you are given somewhere to say it is wrong. */}
      <section
        id="contact"
        className="scroll-mt-24 rounded-xl border border-border-strong bg-surface p-5 shadow-sm"
      >
        <h3 className="text-[15px] font-semibold text-navy">Found something wrong?</h3>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-navy">
          If a figure here does not match a document you hold, or a project is missing, tell the
          municipality. Reports are routed to the office responsible for the record concerned.
        </p>
        <div className="mt-5 border-t border-border-muted pt-5">
          <ContactPanel />
        </div>
      </section>

      {overview?.lgu?.name && (
        <p className="text-[12.5px] text-navy">
          Published by {overview.lgu.name} under RA 12009 and its Implementing Rules and Regulations.
        </p>
      )}
    </div>
  )
}

function RecordViewSwitch({ view, onChange }) {
  const optionClass = (key) =>
    `min-h-9 px-3 text-[12px] font-medium transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
      view === key ? 'bg-surface text-navy shadow-sm' : 'text-text-secondary hover:text-navy'
    }`

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Choose record layout">
      <span className="text-[12px] font-medium text-text-secondary">View</span>
      <div className="flex overflow-hidden rounded-md border border-border-muted bg-sidebar">
        <button type="button" aria-pressed={view === 'grid'} onClick={() => onChange('grid')} className={optionClass('grid')}>
          Cards
        </button>
        <button type="button" aria-pressed={view === 'table'} onClick={() => onChange('table')} className={`border-l border-border-muted ${optionClass('table')}`}>
          Table
        </button>
      </div>
    </div>
  )
}

// The landing page answers the questions that decide whether a citizen needs
// to search records, read the full portal guide, or visit the BAC Secretariat.
// Native <details> keeps this compact on a phone and fully usable by keyboard
// without adding a second state machine to a public page.
function LandingFaq() {
  const [openQuestion, setOpenQuestion] = useState(0)
  const items = [
    {
      question: 'What records can I find here?',
      answer: 'Search approved procurement plans, advertised opportunities, awarded contracts, deliveries and payments. Use Projects for the full public record and Announcements for current notices.',
    },
    {
      question: 'Why can’t I see every bid or draft?',
      answer: 'Drafts, internal remarks and bids under evaluation are withheld. Publishing them early could expose a competitor’s submission or present a proposal as an official decision.',
    },
    {
      question: 'How does a supplier become a bidder?',
      answer: 'Bring eligibility and accreditation requirements to the BAC Secretariat in person. The BAC verifies eligibility, then Admin/IT issues an account. There is no online sign-up.',
    },
    {
      question: 'What if a published record looks wrong or incomplete?',
      answer: 'Use the report form in About this portal. Your message is routed to the office responsible for the record so it can be reviewed through the official process.',
    },
  ]

  return (
    <section aria-labelledby="landing-faq-title" className="mt-6 overflow-hidden rounded-xl border border-border-strong bg-surface shadow-sm">
      <div className="grid md:grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.28fr)]">
        <div className="flex min-h-80 flex-col border-b border-border-muted px-6 py-7 sm:px-8 sm:py-8 md:border-r md:border-b-0">
          <div>
            <h2 id="landing-faq-title" className="max-w-xs text-[25px] leading-[1.08] font-semibold tracking-[-0.03em] text-navy sm:text-[29px]">
              Frequently asked questions
            </h2>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-text-secondary">
              Clear answers before you search a public procurement record, visit the BAC Secretariat, or report a concern.
            </p>
          </div>

          <div className="mt-auto pt-8">
            <p className="text-[13px] font-semibold text-navy">Still have a question?</p>
            <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-text-secondary">
              Tell the municipality if a published record looks incomplete or incorrect.
            </p>
            <Link
              to="/?view=about#contact"
              className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Report a concern <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="px-5 py-3 sm:px-7 sm:py-5">
          {items.map((item, index) => {
            const open = openQuestion === index
            const Icon = open ? Minus : Plus
            return (
              <div key={item.question} className="border-b border-border-muted last:border-b-0">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`landing-faq-answer-${index}`}
                  onClick={() => setOpenQuestion((current) => (current === index ? null : index))}
                  className="flex min-h-14 w-full items-center gap-4 py-3 text-left focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                >
                  <span className="w-6 shrink-0 tabular-nums text-[11.5px] text-text-secondary">{String(index + 1).padStart(2, '0')}</span>
                  <span className="flex-1 text-[13.5px] font-medium text-navy">{item.question}</span>
                  <Icon size={16} className="shrink-0 text-navy" aria-hidden="true" />
                </button>
                {open && (
                  <div id={`landing-faq-answer-${index}`} className="pb-4 pl-10 pr-8">
                    <p className="max-w-2xl text-[12.5px] leading-relaxed text-text-secondary">{item.answer}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// Mirrors LIFECYCLE_PHASES in municipal_backend/services/projectLifecycle.js.
// The API sends progressPercent as (stageIndex + 1) / stageCount, so the count
// is recoverable from it — but only if both sides agree, hence the constant.
const LIFECYCLE_STAGE_COUNT = 8

// ── OFFICIALS ────────────────────────────────────────────────────────────────
// Who is accountable for the records on this portal, grouped by the body they
// sit on. The API sends them already ordered as an organisation chart, so the
// grouping here preserves the order it was given rather than re-sorting.
//
// No contact details, by design — the API does not send them. A citizen with
// something to say uses the form under About, which routes by subject; a
// published mailbox for each named officer is a different thing entirely.
const OFFICIAL_GROUPS = [
  {
    key: 'hope',
    heading: 'Head of the Procuring Entity',
    blurb: 'Approves awards and holds final accountability for each procurement.',
    roles: ['hope'],
  },
  {
    key: 'bac',
    heading: 'Bids and Awards Committee',
    blurb:
      'Advertises, receives and evaluates bids, and recommends the award. Quorum and composition follow RA 12009 and its IRR.',
    roles: ['bacChairperson', 'bacViceChairperson', 'bacMember', 'bacSecretariat', 'twgMember'],
  },
  {
    key: 'finance',
    heading: 'Budget, accounting and treasury',
    blurb:
      'Certify that funds exist, obligate them against an appropriation, and release payment.',
    roles: ['budgetOfficer', 'municipalAccountant', 'municipalTreasurer'],
  },
  {
    key: 'oversight',
    heading: 'Planning and oversight',
    blurb: 'Prepare the procurement plan and audit how it was carried out.',
    roles: ['planningOfficer', 'internalAuditor'],
  },
]

function OfficialsPanel({ officials, failed }) {
  if (failed) {
    return (
      <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 py-16 text-center">
        <FileWarning size={22} className="text-navy" />
        <p className="text-[15px] font-medium text-navy">The directory could not be loaded</p>
        <p className="max-w-md text-[13.5px] text-navy">
          The transparency service is not responding. Please try again shortly.
        </p>
      </div>
    )
  }

  if (officials === null) {
    return (
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="h-44 animate-pulse rounded-xl border border-border-muted bg-sidebar"
          />
        ))}
      </div>
    )
  }

  const groups = OFFICIAL_GROUPS.map((group) => ({
    ...group,
    members: officials.filter((official) => group.roles.includes(official.roleKey)),
  })).filter((group) => group.members.length > 0)

  const initials = (name) =>
    String(name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '•'

  const scrollToContact = (event) => {
    event.preventDefault()
    window.location.hash = ''
    // About view renders ContactPanel; navigate there first when needed, then
    // scroll once it exists. Same-page case scrolls immediately.
    const target = document.getElementById('contact')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.location.href = '/?view=about#contact'
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.key}
            className="flex flex-col rounded-xl border border-border-strong bg-surface p-5 shadow-sm"
          >
            <h3 className="text-[15px] font-semibold text-navy">{group.heading}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-navy">{group.blurb}</p>

            <ul className="mt-4 flex flex-col divide-y divide-border-muted border-t border-border-muted">
              {group.members.map((official) => (
                <li key={official.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-tint text-[12px] font-semibold text-navy"
                  >
                    {initials(official.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-navy">{official.name}</p>
                    <p className="truncate text-[12px] text-navy">{official.roleName}</p>
                  </div>
                  {official.officeCode && (
                    <span className="shrink-0 rounded-full border border-border-muted px-2 py-0.5 font-mono text-[10.5px] text-navy">
                      {official.officeCode}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-[12.5px] leading-relaxed text-navy">
        Positions currently filled, as recorded in this system. Contact details are not published —
        to write to the municipality, use the form under{' '}
        <a
          href="/?view=about#contact"
          onClick={scrollToContact}
          className="font-medium text-navy underline underline-offset-2"
        >
          About
        </a>
        .
      </p>
    </div>
  )
}

function ProjectCard({ project, query = '' }) {
  const style = CATEGORY_STYLES[project.category] ?? CATEGORY_STYLES.upcoming
  const { financials } = project

  // "13%" on a project where nothing has been bought read as "13% built". It is
  // actually stage 1 of 8 of the procurement process. Named stages and a
  // stepper say that; a percentage bar cannot, and a misread figure on a
  // transparency portal is a liability rather than a cosmetic problem.
  const stage = Math.min(
    LIFECYCLE_STAGE_COUNT,
    Math.max(1, Math.round((project.progressPercent / 100) * LIFECYCLE_STAGE_COUNT))
  )

  // One figure, not three. A project without an award showed "Contract amount —"
  // and "Awarded to —" and still paid full height for them.
  const isAwarded = financials.contractAmount !== null && financials.contractAmount !== undefined
  const headlineLabel = isAwarded ? 'Contract amount' : 'Approved budget'
  const headlineValue = isAwarded ? financials.contractAmount : financials.budget

  return (
    <Link
      to={`/projects/${project.id}`}
      aria-label={`${project.projectTitle} — view project record`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
    >
      {/* Status band across the head of the card. Carries the stage count in
          words — "3 of 8 steps" — which says more than a percentage bar could.
          The segmented rail below was removed: it duplicated this same count
          on every card. */}
      <div
        className={`flex items-center gap-1.5 border-b px-4 py-2 text-[12px] font-medium ${style.band}`}
      >
        <style.icon size={13} className="shrink-0" aria-hidden="true" />
        <span>{style.label}</span>
        <span aria-hidden="true" className="text-current opacity-50">
          •
        </span>
        <span className="tabular-nums">
          {stage} of {LIFECYCLE_STAGE_COUNT} steps
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {project.referenceNo && (
              <p className="truncate font-mono text-[12px] font-medium text-accent">
                <Highlighted text={project.referenceNo} query={query} />
              </p>
            )}

            <h3 className="mt-1.5 line-clamp-2 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-navy decoration-1 underline-offset-2 group-hover:underline">
              <Highlighted text={project.projectTitle} query={query} />
            </h3>

            <p className="mt-1 line-clamp-2 text-[12.5px] text-navy">
              {project.implementingUnit}
            </p>
          </div>

          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-muted text-navy transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg">
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-sidebar px-2 py-1 text-[12px] font-medium text-navy">
            {project.procurementMode}
          </span>
          {project.implementingUnitCode && (
            <span className="rounded-md border border-border-muted px-2 py-1 font-mono text-[10.5px] text-navy">
              {project.implementingUnitCode}
            </span>
          )}
          <span className="text-[12px] tracking-[0.04em] text-navy uppercase">
            FY {project.fiscalYear}
          </span>
        </div>

        {/* Amount over its label: the figure is what the eye is looking for,
            and the label only qualifies it. */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0">
            <p className="tabular-nums text-[17px] leading-none font-semibold tracking-[-0.015em] text-navy">
              {peso(headlineValue)}
            </p>
            <p className="mt-1 text-[12px] tracking-[0.05em] text-navy uppercase">
              {headlineLabel}
            </p>
          </div>

          <div className="max-w-[12rem] shrink-0 text-right">
            {project.awardedTo ? (
              <p className="flex items-center justify-end gap-1 text-[12px] text-success">
                <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" />
                <span className="line-clamp-2">{project.awardedTo}</span>
              </p>
            ) : (
              <p className="tabular-nums text-[12px] text-navy">
                {project.bidsReceived} bid{project.bidsReceived === 1 ? '' : 's'}
              </p>
            )}
            {isAwarded && financials.budget > financials.contractAmount && (
              <p className="tabular-nums mt-1 text-[12px] text-navy">
                {compactPeso(financials.budget - financials.contractAmount)} below budget
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// A register view complements cards for residents who want to browse and
// compare a handful of records, and for suppliers, auditors and researchers
// who need to scan many official entries without opening each one. Both views
// point at the same published record; this is a presentation choice only.
function ProjectRecordsTable({ projects, query }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-strong bg-surface">
      <table className="w-full min-w-[860px] text-left">
        <thead className="bg-sidebar">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-sidebar px-4 py-3 text-[12px] font-medium tracking-[0.035em] text-navy uppercase">Record</th>
            <th scope="col" className="px-4 py-3 text-[12px] font-medium tracking-[0.035em] text-navy uppercase">Office</th>
            <th scope="col" className="px-4 py-3 text-[12px] font-medium tracking-[0.035em] text-navy uppercase">Method / FY</th>
            <th scope="col" className="px-4 py-3 text-[12px] font-medium tracking-[0.035em] text-navy uppercase">Public status</th>
            <th scope="col" className="px-4 py-3 text-[12px] font-medium tracking-[0.035em] text-navy uppercase">Updated</th>
            <th scope="col" className="px-4 py-3 text-right text-[12px] font-medium tracking-[0.035em] text-navy uppercase">Amount</th>
            <th scope="col" className="px-4 py-3 text-[12px] font-medium tracking-[0.035em] text-navy uppercase"><span className="sr-only">Open record</span></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const style = CATEGORY_STYLES[project.category] ?? CATEGORY_STYLES.upcoming
            const stage = Math.min(
              LIFECYCLE_STAGE_COUNT,
              Math.max(1, Math.round((project.progressPercent / 100) * LIFECYCLE_STAGE_COUNT))
            )
            const awarded = project.financials?.contractAmount !== null && project.financials?.contractAmount !== undefined
            const amount = awarded ? project.financials.contractAmount : project.financials?.budget

            return (
              <tr key={project.id} className="group border-t border-border-muted align-top hover:bg-sidebar/60">
                <td className="sticky left-0 z-[1] bg-surface px-4 py-3.5 group-hover:bg-sidebar">
                  <Link to={`/projects/${project.id}`} className="block min-w-[18rem] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                    {project.referenceNo && (
                      <p className="font-mono text-[12px] font-medium text-accent">
                        <Highlighted text={project.referenceNo} query={query} />
                      </p>
                    )}
                    <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-navy hover:underline">
                      <Highlighted text={project.projectTitle} query={query} />
                    </p>
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-[13px] leading-relaxed text-text-secondary">{project.implementingUnit || 'Not specified'}</td>
                <td className="px-4 py-3.5 text-[13px] text-text-secondary">
                  <p>{project.procurementMode || 'Not specified'}</p>
                  <p className="mt-1 text-[12px] text-text-faint">FY {project.fiscalYear || '—'}</p>
                </td>
                <td className="px-4 py-3.5 text-[13px]">
                  <p className={`flex items-center gap-1.5 font-medium ${style.text}`}>
                    <style.icon size={13} aria-hidden="true" /> {style.label}
                  </p>
                  <p className="mt-1 text-[12px] text-text-secondary">{stage} of {LIFECYCLE_STAGE_COUNT} procurement steps</p>
                </td>
                <td className="px-4 py-3.5 text-[13px] text-text-secondary whitespace-nowrap">
                  {project.lastUpdatedAt
                    ? new Date(project.lastUpdatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not available'}
                </td>
                <td className="tabular-nums px-4 py-3.5 text-right text-[14px] font-semibold whitespace-nowrap text-navy">
                  {peso(amount)}
                  <p className="mt-1 text-[12px] font-normal text-text-faint">{awarded ? 'Contract amount' : 'Approved budget'}</p>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <Link to={`/projects/${project.id}`} className="inline-flex min-h-11 items-center text-[13px] font-medium text-navy underline decoration-border-strong underline-offset-4 hover:decoration-accent focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                    View record
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PublicTransparency() {
  const [overview, setOverview] = useState(null)
  const [filters, setFilters] = useState(null)
  const [branding, setBranding] = useState(null)
  const [officials, setOfficials] = useState(null)
  const [officialsFailed, setOfficialsFailed] = useState(false)

  const [result, setResult] = useState({ key: null, projects: [], failed: false })

  // ── Which section is showing ──────────────────────────────────────────────
  // Derived from the URL, not held in state. The section links live in the
  // header now, and the header is rendered by pages that know nothing about this
  // component — so `?view=` is the one place both can agree on. It also gives
  // each section a shareable link and makes the browser Back button work
  // between them, which a useState toggle could not.
  //
  // `home` is the default and shows the masthead, the figures and the projects
  // together — a first-time visitor should not have to pick a section before
  // seeing anything.
  //
  // `contact` is kept in the accepted list but resolves to About, where the form
  // now lives. Links to ?view=contact were shared before the move, and a URL a
  // citizen has bookmarked should not start returning the wrong page.
  const [searchParams] = useSearchParams()
  const requested = searchParams.get('view')
  const normalised = requested === 'contact' ? 'about' : requested
  const view = ['announcements', 'about', 'officials', 'projects'].includes(normalised)
    ? normalised
    : 'home'

  // The hero and the key figures are orientation, so they belong to the front
  // page and to nothing else. Once a reader has chosen a section they have their
  // bearings and the space is better spent on the records.
  const showsIntro = view === 'home'

  const [tab, setTab] = useState('all')
  // Fiscal year and office are refinements, not navigation: they are only worth
  // screen space once a reader has a list too long to scan. Collapsed by
  // default, and opened for them if a filter is already applied via the URL.
  const [refineOpen, setRefineOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [fiscalYear, setFiscalYear] = useState('')
  const [department, setDepartment] = useState('')
  const [procMode, setProcMode] = useState('')
  const [sort, setSort] = useState('newest')
  const [recordView, setRecordView] = useState('grid')
  const [requestVersion, setRequestVersion] = useState(0)
  const [spotlight, setSpotlight] = useState([])

  useEffect(() => {
    const lguName = overview?.lgu?.name
    const base = branding?.systemName ?? 'ProcureNance'
    document.title = lguName
      ? `${lguName} Procurement Record — ${base}`
      : `${base} — Procurement Transparency Portal`
    // Keep the meta description in sync so shared links name the LGU, not the
    // generic product. Created once in index.html, updated here when known.
    const meta = document.querySelector('meta[name="description"]')
    if (meta && lguName) {
      meta.setAttribute(
        'content',
        `Procurement plans, biddings, awards, contracts and payments published by ${lguName} under RA 12009. No account required.`
      )
    }
  }, [branding, overview])

  // Deep-link scrolling for `/?view=about#contact` and `/?view=about#bidder`:
  // react-router leaves the hash untouched, so scroll after the section renders.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const id = hash.slice(1)
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => clearTimeout(timer)
  }, [view])

  // Fetch branding for the public portal header and footer.
  useEffect(() => {
    let cancelled = false
    fetchPublicBranding()
      .then((result) => {
        if (!cancelled) setBranding(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([publicApi.fetchPublicOverview(), publicApi.fetchPublicFilters()])
      .then(([overviewResult, filtersResult]) => {
        if (cancelled) return
        setOverview(overviewResult)
        setFilters(filtersResult)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Fetched only when the section is opened: it is one of five, and most
  // visitors never ask for it.
  useEffect(() => {
    if (view !== 'officials' || officials !== null) return
    let cancelled = false
    publicApi
      .fetchPublicOfficials()
      .then((data) => {
        if (!cancelled) setOfficials(data)
      })
      .catch(() => {
        if (!cancelled) setOfficialsFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [view, officials])

  // Spotlight source for the home highlights. One lightweight fetch; failure is
  // silent because the highlights are progressive enhancement, not the record.
  useEffect(() => {
    if (view !== 'home') return
    let cancelled = false
    publicApi
      .fetchAnnouncements()
      .then((data) => {
        if (!cancelled) setSpotlight(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [view])

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const queryKey = JSON.stringify({
    ...(search ? { search } : {}),
    ...(tab !== 'all' ? { category: tab } : {}),
    ...(fiscalYear ? { fiscalYear } : {}),
    ...(department ? { department } : {}),
  })
  const requestKey = `${queryKey}:${requestVersion}`

  useEffect(() => {
    let cancelled = false
    publicApi
      .fetchPublicProjects(JSON.parse(queryKey))
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, projects: data, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, projects: [], failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [queryKey, requestKey])

  const { projects, failed } = result
  const isLoading = result.key !== requestKey

  // Client-side refinements the backend list endpoint does not take: procurement
  // mode and sort order. Applied here over the already-fetched published set so
  // refining never costs a round trip.
  const modeOptions = useMemo(() => {
    const modes = new Map()
    for (const project of projects) {
      if (project?.procurementMode) modes.set(project.procurementMode, true)
    }
    return [...modes.keys()].sort((a, b) => String(a).localeCompare(String(b)))
  }, [projects])

  const visibleProjects = useMemo(() => {
    let rows = procMode ? projects.filter((p) => p?.procurementMode === procMode) : [...projects]
    if (sort === 'budget') {
      rows.sort((a, b) => (Number(b?.financials?.budget ?? 0) - Number(a?.financials?.budget ?? 0)))
    } else if (sort === 'title') {
      rows.sort((a, b) => String(a?.projectTitle ?? '').localeCompare(String(b?.projectTitle ?? '')))
    } else {
      rows.sort((a, b) => {
        const da = a?.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0
        const db = b?.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0
        if (db !== da) return db - da
        return (Number(b?.fiscalYear ?? 0) - Number(a?.fiscalYear ?? 0)) || String(a?.projectTitle ?? '').localeCompare(String(b?.projectTitle ?? ''))
      })
    }
    return rows
  }, [projects, procMode, sort])

  const { pageRows: pageProjects, paginationProps } = usePagination(visibleProjects, 9)

  const tabCounts = useMemo(
    () => ({
      all: overview?.totalProjects ?? 0,
      completed: overview?.completed ?? 0,
      ongoing: overview?.ongoing ?? 0,
      upcoming: overview?.upcoming ?? 0,
    }),
    [overview]
  )

  // Both derived from figures the API already publishes, so neither invents a
  // trend. Savings is budget-of-contracted minus contracted; the release rate is
  // disbursed over contracted.
  const savings =
    overview?.contractedProjects && overview.budgetOfContracted > overview.totalContracted
      ? overview.budgetOfContracted - overview.totalContracted
      : null

  const releaseRate =
    overview?.totalContracted > 0
      ? Math.round((overview.totalDisbursed / overview.totalContracted) * 100)
      : null

  // `showSection` and `pillClass` went with the masthead's two CTA buttons and
  // the status pill row: sections are switched from the header, and status is a
  // select now. Nothing in this component moves the reader between sections any
  // more, so neither helper has a caller.

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader lguName={overview?.lgu?.name} systemName={branding?.systemName} />

      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          {/* ── MASTHEAD ────────────────────────────────────────────────────
              Light panel: badge, LGU-named title, one line of subtext, a
              single search+scope bar, and the two primary citizen jobs as
              CTAs. No dark tile, no grid lines — flat surface with a firm
              outline so it sits on the tinted canvas. */}
          {showsIntro && (
          <section className="pt-6 sm:pt-8">
            <div className="overflow-hidden rounded-2xl border border-border-strong bg-surface px-5 py-8 text-center shadow-sm sm:px-8 sm:py-10">
              <Link
                to="/?view=about"
                className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-sidebar px-3 py-1 text-[12px] font-medium text-navy transition-colors hover:text-navy"
              >
                <ShieldCheck size={13} className="shrink-0 text-accent" aria-hidden="true" />
                Official public record
                {overview?.lgu?.name ? ` · ${overview.lgu.name}` : ''}
              </Link>

              <h1 className="mx-auto mt-4 max-w-3xl text-[27px] leading-[1.14] font-semibold tracking-[-0.03em] text-navy sm:text-[36px]">
                {overview?.lgu?.name
                  ? `${overview.lgu.name} Procurement Record`
                  : 'Procurement Transparency Portal'}
              </h1>

              <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-navy sm:text-[15px]">
                Every procurement — plan, bidding, award, contract and payment — published
                with the office that raised it and the officials who approved it, as required by RA
                12009. No account required.
              </p>

              {/* Search and scope in one bar. Two controls on one surface read
                  as a single question — "which records?" */}
              <div className="mx-auto mt-6 flex max-w-3xl flex-col gap-2 rounded-2xl border border-border-strong bg-surface p-2 text-left shadow-sm sm:flex-row sm:items-center sm:rounded-full">
                <SearchField
                  value={searchInput}
                  onChange={setSearchInput}
                  className="flex-1"
                  bare
                  id="masthead-search"
                />
                <div className="hidden h-6 w-px shrink-0 bg-border-strong sm:block" />
                <label htmlFor="masthead-status" className="sr-only">
                  Filter projects by status
                </label>
                <select
                  id="masthead-status"
                  value={tab}
                  onChange={(event) => setTab(event.target.value)}
                  className="shrink-0 rounded-full bg-transparent px-3.5 py-2 text-[13.5px] font-medium text-navy transition-colors hover:bg-sidebar focus:ring-2 focus:ring-accent/20 focus:outline-none"
                >
                  {TABS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.key === 'all' ? `All projects (${tabCounts.all})` : `${item.label} (${tabCounts[item.key] ?? 0})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <a
                  href="#records"
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90"
                >
                  Find a project <ArrowDownRight size={14} aria-hidden="true" />
                </a>
                <Link
                  to="/?view=about#bidder"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-4 py-2 text-[13px] font-medium text-navy transition-colors hover:bg-sidebar"
                >
                  How to become a bidder <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
          )}

          {/* ── FIGURES ───────────────────────────────────────────────────── */}
          {showsIntro && (
            <div className="mt-4">
              <LedgerStrip overview={overview} savings={savings} releaseRate={releaseRate} />
              <HomeSpotlight projects={projects} announcements={spotlight} />
            </div>
          )}

          {/* ── RECORDS ─────────────────────────────────────────────────── */}
          <div id="records" className={`scroll-mt-6 ${showsIntro ? 'pt-9 pb-6' : 'pt-10 pb-16'}`}>
            {/* The section switch used to sit here as a pill group. It moved to
                the header, so this is now just the heading for whichever section
                the header selected — duplicating the control in both places
                would leave two "you are here" indicators to keep in step. */}
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-navy">
                {view === 'announcements'
                  ? 'Announcements'
                  : view === 'about'
                    ? 'About this portal'
                    : view === 'officials'
                      ? 'Officials'
                      : 'Procurement Records'}
              </h2>
              <p className="text-[13px] text-navy">
                {view === 'announcements'
                  ? 'Notices, open procurements and system updates'
                  : view === 'about'
                    ? 'What is published here, and why'
                    : view === 'officials'
                      ? 'Who is accountable for these records'
                      : `${visibleProjects.length} published • page ${paginationProps.page} of ${Math.max(1, Math.ceil(visibleProjects.length / paginationProps.pageSize))}`}
              </p>
            </div>

            {view === 'officials' ? (
              <OfficialsPanel officials={officials} failed={officialsFailed} />
            ) : view === 'about' ? (
              <AboutPanel overview={overview} />
            ) : view === 'announcements' ? (
              <div className="mt-8">
                <AnnouncementFeed />
              </div>
            ) : (
              <>
                {/* The old toolbar put a search field, four pills and two
                    dropdowns above the first project — offering to narrow a
                    list the reader had not yet seen.
                    On the front page search and scope now live in the masthead
                    bar, so all that is left here is Refine. On the Projects
                    section, which has no masthead, they reappear here rather
                    than being unreachable. */}
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                  {!showsIntro && (
                    <>
                      <SearchField
                        value={searchInput}
                        onChange={setSearchInput}
                        className="w-full sm:mr-auto sm:w-80"
                        id="projects-search"
                      />
                      <label htmlFor="projects-status" className="sr-only">
                        Filter projects by status
                      </label>
                      <select
                        id="projects-status"
                        value={tab}
                        onChange={(event) => setTab(event.target.value)}
                        className="rounded-md border border-border-strong bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-navy transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                      >
                        {TABS.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.key === 'all' ? 'All projects' : item.label} ({tabCounts[item.key]}
                            )
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <label htmlFor="sort-order" className="sr-only">
                    Sort projects
                  </label>
                  <select
                    id="sort-order"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                    className="rounded-md border border-border-strong bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-navy transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <RecordViewSwitch view={recordView} onChange={setRecordView} />

                  <button
                    type="button"
                    onClick={() => setRefineOpen((open) => !open)}
                    aria-expanded={refineOpen}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors focus:ring-2 focus:ring-accent/20 focus:outline-none ${
                      refineOpen || fiscalYear || department || procMode
                        ? 'border-accent/40 bg-chip text-navy'
                        : 'border-border-strong text-navy hover:text-navy'
                    }`}
                  >
                    <SlidersHorizontal size={13} className="shrink-0" />
                    Refine
                    {(fiscalYear || department || procMode) && (
                      <span className="tabular-nums rounded-full bg-accent px-1.5 text-[10.5px] text-accent-fg">
                        {[fiscalYear, department, procMode].filter(Boolean).length}
                      </span>
                    )}
                    <ChevronDown
                      size={13}
                      className={`shrink-0 transition-transform ${refineOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                {refineOpen && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border-strong bg-surface p-3.5">
                    <label htmlFor="filter-fy" className="sr-only">
                      Filter by fiscal year
                    </label>
                    <select
                      id="filter-fy"
                      value={fiscalYear}
                      onChange={(event) => setFiscalYear(event.target.value)}
                      className="rounded-md border border-border-strong bg-canvas px-3.5 py-1.5 text-[12.5px] text-navy transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                    >
                      <option value="">All fiscal years</option>
                      {(filters?.fiscalYears ?? []).map((year) => (
                        <option key={year} value={year}>
                          FY {year}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="filter-office" className="sr-only">
                      Filter by implementing office
                    </label>
                    <select
                      id="filter-office"
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      className="max-w-[16rem] rounded-md border border-border-strong bg-canvas px-3.5 py-1.5 text-[12.5px] text-navy transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                    >
                      <option value="">All offices</option>
                      {(filters?.departments ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="filter-mode" className="sr-only">
                      Filter by procurement mode
                    </label>
                    <select
                      id="filter-mode"
                      value={procMode}
                      onChange={(event) => setProcMode(event.target.value)}
                      className="max-w-[16rem] rounded-md border border-border-strong bg-canvas px-3.5 py-1.5 text-[12.5px] text-navy transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                    >
                      <option value="">All procurement modes</option>
                      {modeOptions.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>

                    {(fiscalYear || department || procMode) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFiscalYear('')
                          setDepartment('')
                          setProcMode('')
                        }}
                        className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-navy transition-colors hover:bg-sidebar hover:text-navy"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <section className="mt-6" aria-live="polite">
                  {failed ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 py-16 text-center" role="status">
                      <FileWarning size={22} className="text-navy" />
                      <p className="text-[15px] font-medium text-navy">Records could not be loaded</p>
                      <p className="max-w-md text-[13.5px] leading-relaxed text-navy">
                        The transparency service is temporarily unavailable. Your search and filters have not changed; please try again shortly.
                      </p>
                      <button
                        type="button"
                        onClick={() => setRequestVersion((current) => current + 1)}
                        className="mt-3 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2"
                      >
                        Try again
                      </button>
                    </div>
                  ) : isLoading && projects.length === 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((key) => (
                        <div
                          key={key}
                          className="h-56 animate-pulse rounded-xl border border-border-muted bg-sidebar"
                        />
                      ))}
                    </div>
                  ) : visibleProjects.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 py-16 text-center" role="status">
                      <Building2 size={22} className="text-navy" />
                      <p className="text-[15px] font-medium text-navy">
                        No projects match your search
                      </p>
                      <p className="max-w-md text-[13.5px] leading-relaxed text-navy">
                        Try another keyword, remove one filter, or clear all filters to see every published project.
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {(filters?.fiscalYears ?? []).slice(0, 3).map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={() => {
                              setFiscalYear(String(year))
                              setSearchInput('')
                              setDepartment('')
                              setProcMode('')
                            }}
                            className="rounded-md border border-border-strong px-3.5 py-1.5 text-[12.5px] font-medium text-navy transition-colors hover:text-navy"
                          >
                            Browse FY {year}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setSearchInput('')
                            setFiscalYear('')
                            setDepartment('')
                            setProcMode('')
                            setTab('all')
                          }}
                          className="rounded-md bg-accent px-3.5 py-1.5 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-90"
                        >
                          Clear all filters
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {search && (
                        <p className="mb-4 text-[13px] text-navy">
                          {visibleProjects.length} {visibleProjects.length === 1 ? 'result' : 'results'} for “
                          {search}”
                        </p>
                      )}

                      {recordView === 'grid' ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {pageProjects.map((project) => (
                            <ProjectCard key={project.id} project={project} query={search} />
                          ))}
                        </div>
                      ) : (
                        <ProjectRecordsTable projects={pageProjects} query={search} />
                      )}

                      <div className="mt-5">
                        <Pagination
                          {...paginationProps}
                          label="projects"
                          pageSizeOptions={[9, 18, 36]}
                        />
                      </div>
                    </>
                  )}
                </section>
              </>
            )}
          </div>

          {showsIntro && (
            <div className="pb-16">
              <LandingFaq />
            </div>
          )}
        </div>
      </main>

      <PublicFooter
        transparencyFooter={branding?.transparencyFooter}
        lguName={overview?.lgu?.name}
        lguAddress={overview?.lgu?.address}
        systemName={branding?.systemName}
      />
    </div>
  )
}
