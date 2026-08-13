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
    icon: CheckCircle2,
  },
  ongoing: {
    label: 'Ongoing',
    chip: 'bg-warning/10 text-warning',
    band: 'border-warning/25 bg-warning/10 text-warning',
    icon: Loader2,
  },
  upcoming: {
    label: 'Upcoming',
    chip: 'bg-sidebar text-text-secondary',
    band: 'border-border-muted bg-sidebar text-text-secondary',
    icon: CalendarClock,
  },
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'upcoming', label: 'Upcoming' },
]

// ── The search field ────────────────────────────────────────────────────────
// Promoted out of the filter card and into the masthead. On a transparency
// portal the visitor almost always arrives with a specific thing in mind — a
// barangay, an office, a road — so search is the primary control, not one of
// five sitting in a toolbar below the fold. Rendered in exactly one place at a
// time: the masthead on the front page, the toolbar once a section is chosen.
// `bare` drops the border and shadow for use inside the masthead's combined
// control bar, where the bar itself already provides them.
function SearchField({ value, onChange, className = '', bare = false }) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by reference or project title"
        aria-label="Search projects"
        className={`w-full py-2.5 pr-4 pl-10 text-[14px] text-navy transition-colors placeholder:text-text-faint focus:outline-none ${
          bare
            ? 'rounded-full bg-transparent focus:ring-2 focus:ring-accent/15'
            : 'rounded-full border border-border-muted bg-surface shadow-sm focus:border-accent focus:ring-2 focus:ring-accent/15'
        }`}
      />
    </div>
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
      className: 'bg-accent/50',
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      value: overview?.upcoming ?? 0,
      className: 'bg-border-strong',
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
      className="overflow-hidden rounded-xl border border-border-muted bg-border-muted shadow-sm"
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
          <p className="text-[11px] font-medium tracking-[0.08em] text-text-faint uppercase">
            On the public record
          </p>

          <p className="tabular-nums mt-2.5 text-[26px] leading-none font-semibold tracking-[-0.025em] text-navy">
            {overview ? total : '—'}
            <span className="ml-1.5 text-[13px] font-normal tracking-normal text-text-secondary">
              {total === 1 ? 'project' : 'projects'}
            </span>
          </p>

          {/* Three real segments summing to the figure above. Kept from the old
              tile — it is the one piece of that card that earned its space. */}
          <div className="mt-3.5 flex h-1.5 overflow-hidden rounded-full bg-track">
            {total > 0 &&
              segments.map((s) => (
                <span
                  key={s.key}
                  className={s.className}
                  style={{ width: `${(s.value / total) * 100}%` }}
                />
              ))}
          </div>

          {/* Hidden on a phone: the filter pills a few hundred pixels below
              carry these same three counts, and on the narrowest screen the
              legend wraps to three lines to repeat them. The bar keeps the
              proportion visible without the words. */}
          <ul className="mt-2.5 hidden flex-wrap items-center gap-x-3.5 gap-y-1 sm:flex">
            {segments.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-1.5 text-[11.5px] text-text-secondary"
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
            <p className="text-[11px] font-medium tracking-[0.08em] text-text-faint uppercase">
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

            {/* The qualifying note is what makes a figure quotable rather than
                just large. It is the first thing to go on a phone, where it
                would otherwise cost more height than the figure it explains. */}
            <p className="mt-auto hidden pt-3 text-[12px] leading-snug text-text-faint sm:block">
              {cell.note}
            </p>
          </div>
        ))}
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

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <section
            key={item.title}
            className="rounded-xl border border-border-muted bg-surface p-5 shadow-sm"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
              <item.icon size={17} />
            </span>
            <h3 className="mt-3.5 text-[15px] font-semibold text-navy">{item.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-secondary">{item.body}</p>
          </section>
        ))}
      </div>

      {/* Contact used to be its own nav section, which put "write to us" at the
          same rank as "here is the record" — and asked for a message before the
          reader had been told what the portal holds or who runs it. It reads
          better as the last thing in About: you learn what is published, what is
          withheld and why, and then you are given somewhere to say it is wrong. */}
      <section
        id="contact"
        className="scroll-mt-24 rounded-xl border border-border-muted bg-surface p-5 shadow-sm"
      >
        <h3 className="text-[15px] font-semibold text-navy">Found something wrong?</h3>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-text-secondary">
          If a figure here does not match a document you hold, or a project is missing, tell the
          municipality. Reports are routed to the office responsible for the record concerned.
        </p>
        <div className="mt-5 border-t border-border-muted pt-5">
          <ContactPanel />
        </div>
      </section>

      {overview?.lgu?.name && (
        <p className="text-[12.5px] text-text-faint">
          Published by {overview.lgu.name} under RA 12009 and its Implementing Rules and Regulations.
        </p>
      )}
    </div>
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
      <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-border-muted bg-surface px-4 py-16 text-center">
        <FileWarning size={22} className="text-text-faint" />
        <p className="text-[15px] font-medium text-navy">The directory could not be loaded</p>
        <p className="max-w-md text-[13.5px] text-text-secondary">
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

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.key}
            className="flex flex-col rounded-xl border border-border-muted bg-surface p-5 shadow-sm"
          >
            <h3 className="text-[15px] font-semibold text-navy">{group.heading}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{group.blurb}</p>

            <ul className="mt-4 flex flex-col divide-y divide-border-muted border-t border-border-muted">
              {group.members.map((official) => (
                <li key={official.id} className="flex items-baseline gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-navy">{official.name}</p>
                    <p className="truncate text-[12px] text-text-secondary">{official.roleName}</p>
                  </div>
                  {official.officeCode && (
                    <span className="shrink-0 rounded-full border border-border-muted px-2 py-0.5 font-mono text-[10.5px] text-text-faint">
                      {official.officeCode}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-[12.5px] leading-relaxed text-text-faint">
        Positions currently filled, as recorded in this system. Contact details are not published —
        to write to the municipality, use the form under{' '}
        <Link to="/?view=about#contact" className="text-navy underline underline-offset-2">
          About
        </Link>
        .
      </p>
    </div>
  )
}

function ProjectCard({ project }) {
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
      className="group flex flex-col overflow-hidden rounded-xl border border-border-muted bg-surface shadow-sm transition-colors duration-150 hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
    >
      {/* Status band across the head of the card, per the wireframe. It carries
          the stage count in words — "3 of 8 steps done" — which is the wireframe's
          own idea and a better one than the percentage this used to show. */}
      <div
        className={`flex items-center gap-1.5 border-b px-4 py-2 text-[11.5px] font-medium ${style.band}`}
      >
        <style.icon size={13} className="shrink-0" />
        <span>{style.label}</span>
        <span className="opacity-60">—</span>
        <span className="tabular-nums">
          {stage} of {LIFECYCLE_STAGE_COUNT} steps done
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* The wireframe sets the reference code in its own blue. This uses
                the system's existing accent — the layout idea worth taking is
                "the code is a distinct, scannable identifier at the top of the
                card", not the colour it was drawn in. */}
            {project.referenceNo && (
              <p className="truncate font-mono text-[11.5px] font-medium text-accent">
                {project.referenceNo}
              </p>
            )}

            <h3 className="mt-1.5 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-navy decoration-1 underline-offset-2 group-hover:underline">
              {project.projectTitle}
            </h3>

            <p className="mt-1 truncate text-[12.5px] text-text-secondary">
              {project.implementingUnit}
            </p>
          </div>

          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-muted text-text-faint transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg">
            <ArrowRight size={14} />
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-sidebar px-2 py-1 text-[11px] font-medium text-text-secondary">
            {project.procurementMode}
          </span>
          {project.implementingUnitCode && (
            <span className="rounded-md border border-border-muted px-2 py-1 font-mono text-[10.5px] text-text-faint">
              {project.implementingUnitCode}
            </span>
          )}
          <span className="text-[11px] tracking-[0.04em] text-text-faint uppercase">
            FY {project.fiscalYear}
          </span>
        </div>

        {/* Amount over its label, as in the wireframe: the figure is what the
            eye is looking for, and the label only qualifies it. */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0">
            <p className="tabular-nums text-[17px] leading-none font-semibold tracking-[-0.015em] text-navy">
              {peso(headlineValue)}
            </p>
            <p className="mt-1 text-[10.5px] tracking-[0.05em] text-text-faint uppercase">
              {headlineLabel}
            </p>
          </div>

          <div className="shrink-0 text-right">
            {project.awardedTo ? (
              <p className="flex items-center justify-end gap-1 text-[11.5px] text-success">
                <CheckCircle2 size={12} className="shrink-0" />
                <span className="max-w-[9rem] truncate">{project.awardedTo}</span>
              </p>
            ) : (
              <p className="tabular-nums text-[11.5px] text-text-faint">
                {project.bidsReceived} bid{project.bidsReceived === 1 ? '' : 's'}
              </p>
            )}
            {isAwarded && financials.budget > financials.contractAmount && (
              <p className="tabular-nums mt-1 text-[11px] text-text-faint">
                {compactPeso(financials.budget - financials.contractAmount)} below budget
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Progress rail on the bottom edge, as in the wireframe. Segmented rather
          than continuous so it counts the stages named in the band above. */}
      <div className="flex gap-px px-4 pb-4" aria-hidden="true">
        {Array.from({ length: LIFECYCLE_STAGE_COUNT }, (_, index) => (
          <span
            key={index}
            className={`h-1 flex-1 first:rounded-l-full last:rounded-r-full ${
              index < stage ? 'bg-accent' : 'bg-track'
            }`}
          />
        ))}
      </div>
    </Link>
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

  useEffect(() => {
    document.title = branding?.systemName
      ? `${branding.systemName} — Transparency Portal`
      : 'Procurement Transparency Portal'
  }, [branding])

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

  useEffect(() => {
    let cancelled = false
    publicApi
      .fetchPublicProjects(JSON.parse(queryKey))
      .then((data) => {
        if (!cancelled) setResult({ key: queryKey, projects: data, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: queryKey, projects: [], failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [queryKey])

  const { projects, failed } = result
  const isLoading = result.key !== queryKey

  const { pageRows: pageProjects, paginationProps } = usePagination(projects, 6)

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

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          {/* ── MASTHEAD ────────────────────────────────────────────────────
              Centred, per the wireframe: a small verified-record badge, the
              portal's name, one line of subtext, and a single control bar
              holding search and the category select.
              The badge states the statute rather than a technology claim —
              these records are published under RA 12009 and signed off by named
              officials, which is what the reader is being asked to trust. */}
          {showsIntro && (
          <section className="pt-10 pb-8 text-center sm:pt-14 sm:pb-9">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface px-3 py-1 text-[11.5px] font-medium text-text-secondary shadow-sm">
              <ShieldCheck size={13} className="shrink-0 text-accent" />
              Official public record
              {overview?.lgu?.name ? ` · ${overview.lgu.name}` : ''}
            </p>

            <h1 className="mx-auto mt-5 max-w-3xl text-[27px] leading-[1.14] font-semibold tracking-[-0.03em] text-navy sm:text-[36px]">
              Procurement Transparency Portal
            </h1>

            <p className="mx-auto mt-3.5 max-w-2xl text-[14.5px] leading-relaxed text-text-secondary sm:text-[15.5px]">
              Every municipal procurement — plan, bidding, award, contract and payment — published
              with the office that raised it and the officials who approved it, as required by RA
              12009. No account required.
            </p>

            {/* Search and scope in one bar, as drawn. Two controls on one
                surface read as a single question — "which records?" — where the
                old toolbar's five read as a form to fill in. */}
            <div className="mx-auto mt-7 flex max-w-3xl flex-col gap-2 rounded-2xl border border-border-muted bg-surface p-2 shadow-sm sm:flex-row sm:items-center sm:rounded-full">
              <SearchField
                value={searchInput}
                onChange={setSearchInput}
                className="flex-1"
                bare
              />
              <div className="hidden h-6 w-px shrink-0 bg-border-muted sm:block" />
              <select
                value={tab}
                onChange={(event) => setTab(event.target.value)}
                aria-label="Filter by status"
                className="shrink-0 rounded-full bg-transparent px-3.5 py-2 text-[13.5px] font-medium text-navy transition-colors hover:bg-sidebar focus:ring-2 focus:ring-accent/20 focus:outline-none"
              >
                {TABS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.key === 'all' ? 'All projects' : item.label}
                  </option>
                ))}
              </select>
            </div>
          </section>
          )}

          {/* ── FIGURES ───────────────────────────────────────────────────── */}
          {showsIntro && (
            <LedgerStrip overview={overview} savings={savings} releaseRate={releaseRate} />
          )}

          {/* ── RECORDS ─────────────────────────────────────────────────── */}
          <div id="records" className={`scroll-mt-6 pb-16 ${showsIntro ? 'pt-9' : 'pt-10'}`}>
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
              <p className="text-[13px] text-text-faint">
                {view === 'announcements'
                  ? 'Notices, open procurements and system updates'
                  : view === 'about'
                    ? 'What is published here, and why'
                    : view === 'officials'
                      ? 'Who is accountable for these records'
                      : // "shown", not "published": with a filter applied this is
                        // the size of the list on screen, and saying "published"
                        // would misreport the size of the record.
                        `${projects.length} shown`}
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
                      />
                      <select
                        value={tab}
                        onChange={(event) => setTab(event.target.value)}
                        aria-label="Filter by status"
                        className="rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
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

                  <button
                    type="button"
                    onClick={() => setRefineOpen((open) => !open)}
                    aria-expanded={refineOpen}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors focus:ring-2 focus:ring-accent/20 focus:outline-none ${
                      refineOpen || fiscalYear || department
                        ? 'border-accent/40 bg-chip text-navy'
                        : 'border-border-muted text-text-secondary hover:border-border-strong hover:text-navy'
                    }`}
                  >
                    <SlidersHorizontal size={13} className="shrink-0" />
                    Refine
                    {(fiscalYear || department) && (
                      <span className="tabular-nums rounded-full bg-accent px-1.5 text-[10.5px] text-accent-fg">
                        {[fiscalYear, department].filter(Boolean).length}
                      </span>
                    )}
                    <ChevronDown
                      size={13}
                      className={`shrink-0 transition-transform ${refineOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                {refineOpen && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border-muted bg-surface p-3.5">
                    <select
                      value={fiscalYear}
                      onChange={(event) => setFiscalYear(event.target.value)}
                      aria-label="Filter by fiscal year"
                      className="rounded-full border border-border-muted bg-canvas px-3.5 py-1.5 text-[12.5px] text-text-secondary transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                    >
                      <option value="">All fiscal years</option>
                      {(filters?.fiscalYears ?? []).map((year) => (
                        <option key={year} value={year}>
                          FY {year}
                        </option>
                      ))}
                    </select>

                    <select
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      aria-label="Filter by implementing office"
                      className="max-w-[16rem] rounded-full border border-border-muted bg-canvas px-3.5 py-1.5 text-[12.5px] text-text-secondary transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                    >
                      <option value="">All offices</option>
                      {(filters?.departments ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    {(fiscalYear || department) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFiscalYear('')
                          setDepartment('')
                        }}
                        className="rounded-full px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:bg-sidebar hover:text-navy"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <section className="mt-6" aria-live="polite">
                  {failed ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-border-muted bg-surface px-4 py-16 text-center">
                      <FileWarning size={22} className="text-text-faint" />
                      <p className="text-[15px] font-medium text-navy">Records could not be loaded</p>
                      <p className="max-w-md text-[13.5px] text-text-secondary">
                        The transparency service is not responding. Please try again shortly.
                      </p>
                    </div>
                  ) : isLoading && projects.length === 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {[0, 1, 2, 3, 4, 5].map((key) => (
                        <div
                          key={key}
                          className="h-56 animate-pulse rounded-xl border border-border-muted bg-sidebar"
                        />
                      ))}
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-border-muted bg-surface px-4 py-16 text-center">
                      <Building2 size={22} className="text-text-faint" />
                      <p className="text-[15px] font-medium text-navy">
                        No projects match your search
                      </p>
                      <p className="max-w-md text-[13.5px] text-text-secondary">
                        Try a different keyword, or clear the filters to see every published project.
                      </p>
                    </div>
                  ) : (
                    <>
                      {search && (
                        <p className="mb-4 text-[13px] text-text-faint">
                          {projects.length} {projects.length === 1 ? 'result' : 'results'} for “
                          {search}”
                        </p>
                      )}

                      {/* Three across on a wide screen, per the wireframe. Two
                          columns wasted the right-hand third of a desktop
                          window and made each card taller than it needed to be. */}
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {pageProjects.map((project) => (
                          <ProjectCard key={project.id} project={project} />
                        ))}
                      </div>

                      <div className="mt-5 overflow-hidden rounded-xl border border-border-muted bg-surface">
                        <Pagination
                          {...paginationProps}
                          label="projects"
                          pageSizeOptions={[6, 12, 24]}
                        />
                      </div>
                    </>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      <PublicFooter transparencyFooter={branding?.transparencyFooter} />
    </div>
  )
}
