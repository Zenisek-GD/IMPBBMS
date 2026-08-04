import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Building2,
  Wallet,
  CheckCircle2,
  Loader2,
  CalendarClock,
  ArrowRight,
  FileWarning,
  Landmark,
} from 'lucide-react'
import * as publicApi from '../../api/publicProjects'
import PublicHeader from '../../components/public/PublicHeader'
import PublicFooter from '../../components/public/PublicFooter'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

// The default landing page of the whole system. A visitor arrives here with no
// account and no prompt to create one: the procurement record is the front
// door, and signing in is the exception reserved for the officials who have to
// act on it.

const peso = (value) =>
  value === null || value === undefined
    ? '—'
    : `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

// Status is carried by the badge alone. There used to be a coloured bar down
// the left edge of every card and a status-coloured progress bar to match,
// which meant a grid of six projects showed six large blocks of green and
// orange before any of the text registered — decoration competing with the
// figures rather than supporting them. The badge is small, labelled and
// sufficient; the progress bar is now neutral so length, not hue, carries it.
const CATEGORY_STYLES = {
  completed: {
    label: 'Completed',
    className: 'border-success/25 bg-success/10 text-success',
    icon: CheckCircle2,
  },
  ongoing: {
    label: 'Ongoing',
    className: 'border-warning/25 bg-warning/10 text-warning',
    icon: Loader2,
  },
  upcoming: {
    label: 'Upcoming',
    className: 'border-border-muted bg-sidebar text-text-secondary',
    icon: CalendarClock,
  },
}

const TABS = [
  { key: 'all', label: 'All Projects' },
  { key: 'completed', label: 'Completed' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'upcoming', label: 'Upcoming' },
]

// The figures band. These cards lift off the hero rather than sitting flat on
// the canvas — the overlap is what makes the top of the page read as one
// composed block instead of a heading with boxes underneath it.
function StatTile({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-lg border border-border-muted bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-chip text-navy">
            <Icon size={14} />
          </span>
        )}
        <p className="text-[10.5px] font-medium tracking-[0.05em] text-text-faint uppercase">{label}</p>
      </div>
      <p className="tabular-nums mt-2.5 text-[22px] leading-none font-semibold tracking-[-0.02em] text-navy">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11.5px] leading-snug text-text-faint">{hint}</p>}
    </div>
  )
}

function ProjectCard({ project }) {
  const style = CATEGORY_STYLES[project.category] ?? CATEGORY_STYLES.upcoming
  const { financials } = project

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group flex flex-col gap-3.5 rounded-lg border border-border-muted bg-surface p-4 transition-colors duration-150 hover:border-border-strong focus:ring-2 focus:ring-accent/40 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10.5px] font-medium tracking-[0.04em] uppercase ${style.className}`}
            >
              <style.icon size={11} /> {style.label}
            </span>
            {project.implementingUnitCode && (
              <span className="rounded-sm border border-border-muted bg-sidebar px-1.5 py-0.5 font-mono text-[10.5px] text-text-secondary">
                {project.implementingUnitCode}
              </span>
            )}
            <span className="text-[10.5px] tracking-[0.04em] text-text-faint uppercase">
              FY {project.fiscalYear}
            </span>
          </div>

          <h3 className="mt-2 text-[14.5px] leading-snug font-semibold text-navy decoration-1 underline-offset-2 group-hover:underline">
            {project.projectTitle}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">{project.implementingUnit}</p>
        </div>

        <ArrowRight
          size={16}
          className="mt-0.5 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-navy"
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-[10.5px] tracking-[0.04em] uppercase">
          <span className="font-medium text-text-secondary">{project.phaseLabel}</span>
          <span className="tabular-nums text-text-faint">{project.progressPercent}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${project.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border-muted pt-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] tracking-[0.04em] text-text-faint uppercase">Approved Budget</p>
          <p className="tabular-nums mt-0.5 text-[13px] font-semibold text-navy">{peso(financials.budget)}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-[0.04em] text-text-faint uppercase">Contract Amount</p>
          <p className="tabular-nums mt-0.5 text-[13px] font-semibold text-navy">
            {peso(financials.contractAmount)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10px] tracking-[0.04em] text-text-faint uppercase">Awarded To</p>
          <p className="mt-0.5 truncate text-[12.5px] text-text-secondary">{project.awardedTo ?? '—'}</p>
        </div>
      </div>
    </Link>
  )
}

export default function PublicTransparency() {
  const [overview, setOverview] = useState(null)
  const [filters, setFilters] = useState(null)

  // The result carries the query it answers. Loading is then derived — the
  // result is stale exactly when it does not match the current filters — rather
  // than tracked by a flag flipped synchronously inside the effect, which
  // triggers a cascading render on every filter change.
  const [result, setResult] = useState({ key: null, projects: [], failed: false })

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
      // If this fails the project request below fails too, and that is what
      // surfaces the error state. Leaving the header figures blank is enough.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Typing shouldn't fire a request per keystroke against a public endpoint.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Serialised so the effect depends on one stable value, and so the result can
  // be tagged with the query it answers.
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

  // Four per page. The cards sit two-up on desktop, so four is two rows —
  // which, under the header, stat tiles and filter bar, keeps the whole page
  // close to a single screen instead of an endless column of cards. Readers
  // who want more can raise it from the control itself.
  //
  // Changing the search or a filter replaces the array, which resets the page
  // automatically.
  const { pageRows: pageProjects, paginationProps } = usePagination(projects, 4)

  const tabCounts = useMemo(
    () => ({
      all: overview?.totalProjects ?? 0,
      completed: overview?.completed ?? 0,
      ongoing: overview?.ongoing ?? 0,
      upcoming: overview?.upcoming ?? 0,
    }),
    [overview]
  )

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader lguName={overview?.lgu?.name} />

      <main className="flex-1">
        {/* ── PAGE HEADING ───────────────────────────────────────────────────
            A records portal, not a product page. This replaced a full-bleed
            dark hero carrying a slogan, a paragraph of prose and three
            marketing pills — roughly 500px of screen before a visitor reached a
            single figure. A citizen arriving here already knows why they came;
            what they need is the office that published the records, the year
            they cover, and then the records. */}
        <section className="border-b border-border-muted bg-surface">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8">
            <p className="text-[10.5px] font-medium tracking-[0.1em] text-text-faint uppercase">
              Republic of the Philippines
              {overview?.lgu?.name ? ` · ${overview.lgu.name}` : ''}
            </p>
            <h1 className="mt-1 text-[19px] leading-tight font-semibold tracking-[-0.015em] text-navy">
              Procurement Transparency Portal
            </h1>
            <p className="mt-1 max-w-3xl text-[12.5px] text-text-secondary">
              Published procurement records — plans, bidding, awards, contracts and payments, each with the
              officials who approved it. Open to the public under RA 12009; no account required.
            </p>
          </div>
        </section>

        <div className="mx-auto mt-5 w-full max-w-7xl px-4 sm:px-8">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Published Projects"
              value={overview?.totalProjects ?? '—'}
              hint={
                overview
                  ? `${overview.ongoing} ongoing · ${overview.completed} completed · ${overview.upcoming} upcoming`
                  : undefined
              }
              icon={Building2}
            />
            <StatTile
              label="Approved Budget"
              value={overview ? peso(overview.totalBudget) : '—'}
              hint="Authorised by ordinance"
              icon={Landmark}
            />
            <StatTile
              label="Total Contracted"
              value={overview ? peso(overview.totalContracted) : '—'}
              // Savings compare like with like: the contracted value against the
              // budget of the projects that were actually contracted, not against
              // every project on the plan.
              hint={
                overview?.contractedProjects
                  ? `${peso(overview.budgetOfContracted - overview.totalContracted)} below budget across ${
                      overview.contractedProjects
                    } awarded ${overview.contractedProjects === 1 ? 'project' : 'projects'}`
                  : undefined
              }
              icon={CheckCircle2}
            />
            <StatTile
              label="Total Disbursed"
              value={overview ? peso(overview.totalDisbursed) : '—'}
              hint="Released from the treasury"
              icon={Wallet}
            />
          </section>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-8">
          {/* One toolbar surface rather than four controls loose on the canvas.
            Search, category and the two filters are a single act — narrowing
            the list — so they belong in a single container. */}
          <section className="mt-8 overflow-hidden rounded-lg border border-border-muted bg-surface shadow-sm">
            <div className="relative border-b border-border-muted">
              <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-text-faint" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search projects by title, description or reference code…"
                aria-label="Search projects"
                className="w-full bg-transparent py-3.5 pr-4 pl-11 text-[13.5px] text-navy placeholder:text-text-faint focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-2.5">
              {/* Segmented control: one connected group reads as "pick one of
                these", which four separate outlined buttons did not. */}
              <div className="flex flex-wrap items-center gap-1 rounded-md bg-sidebar p-0.5">
                {TABS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    aria-pressed={tab === item.key}
                    className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                      tab === item.key
                        ? 'bg-surface text-navy shadow-sm'
                        : 'text-text-secondary hover:text-navy'
                    }`}
                  >
                    {item.label}
                    <span
                      className={`tabular-nums rounded px-1.5 py-px text-[10.5px] ${
                        tab === item.key ? 'bg-chip text-navy' : 'text-text-faint'
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
                  className="rounded-md border border-border-muted bg-surface px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
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
                  className="max-w-[15rem] rounded-md border border-border-muted bg-surface px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
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
          </section>

          <section className="mt-6" aria-live="polite">
            {failed ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border-muted bg-surface px-4 py-12 text-center">
                <FileWarning size={22} className="text-text-faint" />
                <p className="text-sm font-medium text-navy">Records could not be loaded</p>
                <p className="max-w-md text-[13px] text-text-secondary">
                  The transparency service is not responding. Please try again shortly.
                </p>
              </div>
            ) : isLoading && projects.length === 0 ? (
              // Skeletons rather than a line of text: the layout holds its shape
              // while loading, so the page does not jump when the data lands.
              <div className="grid gap-4 lg:grid-cols-2">
                {[0, 1, 2, 3].map((key) => (
                  <div
                    key={key}
                    className="h-44 animate-pulse rounded-lg border border-border-muted bg-surface"
                  />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border-muted bg-surface px-4 py-12 text-center">
                <Search size={22} className="text-text-faint" />
                <p className="text-sm font-medium text-navy">No projects match your search</p>
                <p className="max-w-md text-[13px] text-text-secondary">
                  Try a different keyword, or clear the filters to see every published project.
                </p>
              </div>
            ) : (
              <>
                {search && <p className="mb-4 text-[13px] text-text-faint">Matching “{search}”</p>}
                <div className="grid gap-4 lg:grid-cols-2">
                  {pageProjects.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>

                {/* Paged rather than an endless column. A citizen looking for one
                  project should not have to scroll past every other one to
                  reach the end of the list, and the count tells them how much
                  there is before they start. */}
                <div className="mt-4 overflow-hidden rounded-lg border border-border-muted bg-surface">
                  <Pagination {...paginationProps} label="projects" pageSizeOptions={[4, 8, 16, 32]} />
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
