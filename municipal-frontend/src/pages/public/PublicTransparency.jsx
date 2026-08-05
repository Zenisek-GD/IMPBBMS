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
} from 'lucide-react'
import * as publicApi from '../../api/publicProjects'
import PublicHeader from '../../components/public/PublicHeader'
import PublicFooter from '../../components/public/PublicFooter'
import AnnouncementFeed from '../../components/public/AnnouncementFeed'
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

const CATEGORY_STYLES = {
  completed: { label: 'Completed', chip: 'bg-chip text-success', icon: CheckCircle2 },
  ongoing: { label: 'Ongoing', chip: 'bg-warning/10 text-warning', icon: Loader2 },
  upcoming: {
    label: 'Upcoming',
    chip: 'bg-sidebar text-text-secondary',
    icon: CalendarClock,
  },
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'upcoming', label: 'Upcoming' },
]

// ── The dark feature tile ───────────────────────────────────────────────────
// The reference anchors its figure row with one near-black card among light
// ones. The chart inside is a real breakdown of the published portfolio by
// lifecycle stage, not decoration — three segments that sum to the number above
// them.
function FeatureTile({ overview }) {
  const total = overview?.totalProjects ?? 0
  const segments = [
    { key: 'ongoing', label: 'Ongoing', value: overview?.ongoing ?? 0, className: 'bg-eco' },
    {
      key: 'completed',
      label: 'Completed',
      value: overview?.completed ?? 0,
      className: 'bg-eco/55',
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      value: overview?.upcoming ?? 0,
      className: 'bg-white/25',
    },
  ]

  return (
    <div className="rounded-xl bg-brand p-5">
      <p className="text-[11px] font-medium tracking-[0.08em] text-topnav-link uppercase">
        Published projects
      </p>

      <div className="mt-3 flex items-end gap-2">
        <p className="tabular-nums text-[30px] leading-none font-semibold tracking-[-0.03em] text-brand-fg">
          {overview ? total : '—'}
        </p>
        <span className="pb-0.5 text-[12px] text-topnav-link">on the public record</span>
      </div>

      {/* One bar, three real segments. A legend rather than axis labels: at this
          size a labelled axis is unreadable, and the figures are named below. */}
      <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-white/10">
        {total > 0 &&
          segments.map((s) => (
            <span
              key={s.key}
              className={s.className}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ))}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[12px]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.className}`} />
            <span className="text-topnav-link">{s.label}</span>
            <span className="tabular-nums ml-auto font-medium text-brand-fg">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// A light figure tile. `delta` is optional and only ever passed a value the data
// genuinely supports.
function StatTile({ label, value, delta, hint }) {
  return (
    <div className="flex flex-col rounded-xl border border-border-muted bg-surface p-5 shadow-sm">
      <p className="text-[11px] font-medium tracking-[0.08em] text-text-faint uppercase">{label}</p>

      <p className="tabular-nums mt-3 text-[26px] leading-none font-semibold tracking-[-0.025em] text-navy">
        {value}
      </p>

      {delta && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-success">
          <ArrowDownRight size={13} className="shrink-0" />
          {delta}
        </p>
      )}

      {hint && <p className="mt-auto pt-3 text-[12px] leading-snug text-text-faint">{hint}</p>}
    </div>
  )
}

// ── Project card ────────────────────────────────────────────────────────────
// Card/box layout, kept as it was by request. Restyled to the reference: larger
// radius, hairline border on white, soft green status chip, green progress bar.
function ProjectCard({ project }) {
  const style = CATEGORY_STYLES[project.category] ?? CATEGORY_STYLES.upcoming
  const { financials } = project

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-border-muted bg-surface p-5 shadow-sm transition-colors duration-150 hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${style.chip}`}
            >
              <style.icon size={12} /> {style.label}
            </span>
            {project.implementingUnitCode && (
              <span className="rounded-full border border-border-muted px-2.5 py-1 font-mono text-[11px] text-text-secondary">
                {project.implementingUnitCode}
              </span>
            )}
            <span className="text-[11px] tracking-[0.04em] text-text-faint uppercase">
              FY {project.fiscalYear}
            </span>
          </div>

          <h3 className="mt-3 text-[16px] leading-snug font-semibold tracking-[-0.01em] text-navy decoration-1 underline-offset-2 group-hover:underline">
            {project.projectTitle}
          </h3>
          <p className="mt-1 text-[13px] text-text-secondary">{project.implementingUnit}</p>
        </div>

        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-muted text-text-faint transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg">
          <ArrowRight size={15} />
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] tracking-[0.04em] uppercase">
          <span className="font-medium text-text-secondary">{project.phaseLabel}</span>
          <span className="tabular-nums text-text-faint">{project.progressPercent}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${project.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border-muted pt-4 sm:grid-cols-3">
        <div>
          <p className="text-[10.5px] tracking-[0.05em] text-text-faint uppercase">Approved budget</p>
          <p className="tabular-nums mt-1 text-[14.5px] font-semibold text-navy">
            {peso(financials.budget)}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] tracking-[0.05em] text-text-faint uppercase">Contract amount</p>
          <p className="tabular-nums mt-1 text-[14.5px] font-semibold text-navy">
            {peso(financials.contractAmount)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10.5px] tracking-[0.05em] text-text-faint uppercase">Awarded to</p>
          <p className="mt-1 truncate text-[13px] text-text-secondary">{project.awardedTo ?? '—'}</p>
        </div>
      </div>
    </Link>
  )
}

export default function PublicTransparency() {
  const [overview, setOverview] = useState(null)
  const [filters, setFilters] = useState(null)

  const [result, setResult] = useState({ key: null, projects: [], failed: false })

  // ── Which section is showing ──────────────────────────────────────────────
  // Derived from the URL, not held in state. The section links live in the
  // header now, and the header is rendered by pages that know nothing about this
  // component — so `?view=` is the one place both can agree on. It also gives
  // each section a shareable link and makes the browser Back button work
  // between them, which a useState toggle could not.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'announcements' ? 'announcements' : 'projects'

  const [tab, setTab] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [fiscalYear, setFiscalYear] = useState('')
  const [department, setDepartment] = useState('')

  useEffect(() => {
    document.title = 'Procurement Transparency Portal'
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

  // The hero buttons scroll as well as switch, since the reader is above the
  // records when they press one. The header pills only switch — they are already
  // in view and yanking the page would be disorienting.
  const showSection = (next) => {
    setSearchParams(next === 'announcements' ? { view: 'announcements' } : {})
    document.getElementById('records')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const pillClass = (active) =>
    `rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
      active
        ? 'bg-accent text-accent-fg'
        : 'text-text-secondary hover:bg-sidebar hover:text-navy'
    }`

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader lguName={overview?.lgu?.name} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          {/* ── HERO ────────────────────────────────────────────────────────
              One column, left-aligned, plenty of air. No decorative artwork:
              the headline states what the site is, and the two pills are the
              only things asking to be clicked. */}
          <section className="pt-12 pb-10 sm:pt-16 sm:pb-12">
            <p className="text-[11px] font-medium tracking-[0.12em] text-text-faint uppercase">
              Republic of the Philippines
              {overview?.lgu?.name ? ` · ${overview.lgu.name}` : ''}
            </p>

            <h1 className="mt-4 max-w-3xl text-[32px] leading-[1.12] font-semibold tracking-[-0.03em] text-navy sm:text-[42px]">
              Every peso of municipal procurement, on the public record.
            </h1>

            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-text-secondary sm:text-[16.5px]">
              Procurement plans, bidding, awards, contracts and payments — each published with the
              office that raised it and the officials who approved it. Open to everyone under RA
              12009. No account required.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => showSection('projects')}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-medium text-accent-fg transition-opacity hover:opacity-90 focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:outline-none"
              >
                Browse projects
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => showSection('announcements')}
                className="inline-flex items-center gap-2 rounded-full border border-border-strong px-5 py-2.5 text-[13.5px] font-medium text-navy transition-colors hover:bg-sidebar focus:ring-2 focus:ring-accent/20 focus:outline-none"
              >
                Announcements
              </button>
            </div>
          </section>

          {/* ── FIGURES ─────────────────────────────────────────────────────
              One dark tile among three light ones, as in the reference. */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
            <FeatureTile overview={overview} />

            <StatTile
              label="Approved budget"
              value={overview ? compactPeso(overview.totalBudget) : '—'}
              hint="Authorised by appropriation ordinance"
            />

            <StatTile
              label="Total contracted"
              value={overview ? compactPeso(overview.totalContracted) : '—'}
              // A real figure, not a period-over-period invention: what the
              // awarded projects were budgeted at, less what they were let for.
              delta={savings ? `${compactPeso(savings)} below budget` : undefined}
              hint={
                overview?.contractedProjects
                  ? `Across ${overview.contractedProjects} awarded ${
                      overview.contractedProjects === 1 ? 'project' : 'projects'
                    }`
                  : undefined
              }
            />

            <StatTile
              label="Total disbursed"
              value={overview ? compactPeso(overview.totalDisbursed) : '—'}
              hint={
                releaseRate !== null
                  ? `${releaseRate}% of contracted value released from the treasury`
                  : 'Released from the treasury'
              }
            />
          </section>

          {/* ── RECORDS ─────────────────────────────────────────────────── */}
          <div id="records" className="scroll-mt-6 pt-14 pb-16">
            {/* The section switch used to sit here as a pill group. It moved to
                the header, so this is now just the heading for whichever section
                the header selected — duplicating the control in both places
                would leave two "you are here" indicators to keep in step. */}
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-navy">
                {view === 'announcements' ? 'Announcements' : 'Procurement projects'}
              </h2>
              <p className="text-[13px] text-text-faint">
                {view === 'announcements'
                  ? 'Notices, open procurements and system updates'
                  : `${tabCounts.all} published ${tabCounts.all === 1 ? 'project' : 'projects'}`}
              </p>
            </div>

            {view === 'announcements' ? (
              <div className="mt-8">
                <AnnouncementFeed />
              </div>
            ) : (
              <>
                {/* Controls on one card surface, pill filters inside it. */}
                <div className="mt-6 flex flex-col gap-4 rounded-xl border border-border-muted bg-surface p-4">
                  <div className="relative">
                    <Search
                      size={16}
                      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint"
                    />
                    <input
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Search by title, description or reference code"
                      aria-label="Search projects"
                      className="w-full rounded-full border border-border-muted bg-canvas py-2.5 pr-4 pl-10 text-[14px] text-navy transition-colors placeholder:text-text-faint focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {TABS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setTab(item.key)}
                          aria-pressed={tab === item.key}
                          className={pillClass(tab === item.key)}
                        >
                          {item.label}
                          <span
                            className={`tabular-nums ml-1.5 text-[11.5px] ${
                              tab === item.key ? 'opacity-70' : 'text-text-faint'
                            }`}
                          >
                            {tabCounts[item.key]}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <select
                        value={fiscalYear}
                        onChange={(event) => setFiscalYear(event.target.value)}
                        aria-label="Filter by fiscal year"
                        className="rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-[12.5px] text-text-secondary transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
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
                        className="max-w-[14rem] rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-[12.5px] text-text-secondary transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                      >
                        <option value="">All offices</option>
                        {(filters?.departments ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

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
                    <div className="grid gap-4 lg:grid-cols-2">
                      {[0, 1, 2, 3].map((key) => (
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

                      <div className="grid gap-4 lg:grid-cols-2">
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

      <PublicFooter />
    </div>
  )
}
