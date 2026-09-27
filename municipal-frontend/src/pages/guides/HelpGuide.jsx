import { useCallback, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  Play,
  Search,
  Video,
} from 'lucide-react'
import DashboardPage from '../../components/ui/DashboardPage'
import Modal from '../../components/ui/Modal'
import { useAuth } from '../../context/useAuth'
import { ALL_GUIDES, GUIDE_PHASES } from './guideCatalog'

const PROGRESS_KEY = 'help-guide-watched-v2'

const PHASE_TAB_LABELS = {
  planning: 'Planning Process',
  'budget-authority': 'Budget Process',
  'procurement-award': 'Procurement Process',
}

function readWatched(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => ALL_GUIDES.some((guide) => guide.id === id)) : []
  } catch {
    return []
  }
}

function getGuidePosition(guide) {
  const phase = GUIDE_PHASES.find((item) => item.id === guide.phaseId)
  const position = Math.max(0, phase?.guides.findIndex((item) => item.id === guide.id) ?? 0)
  return { current: position + 1, total: phase?.guides.length ?? 1 }
}

function getGuideNeighbors(guide) {
  const index = ALL_GUIDES.findIndex((item) => item.id === guide.id)

  return {
    previousGuide: index > 0 ? ALL_GUIDES[index - 1] : null,
    nextGuide: index >= 0 && index < ALL_GUIDES.length - 1 ? ALL_GUIDES[index + 1] : null,
  }
}

function GuideState({ guide, watched }) {
  if (watched) {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success"><CheckCircle2 size={13} aria-hidden="true" /> Viewed</span>
  }

  if (guide.ready) {
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-faint"><Video size={13} aria-hidden="true" /> {guide.duration}</span>
  }

  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-faint"><FileText size={13} aria-hidden="true" /> Written guide</span>
}

function GuideCard({ guide, watched, onOpen }) {
  const { current, total } = getGuidePosition(guide)

  return (
    <button
      type="button"
      onClick={() => onOpen(guide)}
      aria-label={`Open guide: ${guide.title}`}
      className="group grid min-w-0 grid-cols-[100px_minmax(0,1fr)] gap-3.5 rounded-xl border border-border-muted bg-surface p-3.5 text-left transition-[border-color,background-color] duration-150 hover:border-border-strong hover:bg-sidebar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none sm:grid-cols-[144px_minmax(0,1fr)] sm:gap-4 sm:p-4 xl:grid-cols-[172px_minmax(0,1fr)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-sidebar">
        {guide.poster ? (
          <img src={guide.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-faint"><BookOpen size={21} aria-hidden="true" /></div>
        )}
        {guide.ready && <span className="absolute bottom-2 left-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-fg"><Play size={12} fill="currentColor" aria-hidden="true" /></span>}
      </div>

      <div className="flex min-w-0 flex-col items-start py-0.5 sm:py-1">
        <GuideState guide={guide} watched={watched} />
        <h3 className="mt-1.5 text-[15px] font-semibold leading-5 tracking-[-0.018em] text-navy sm:text-[17px] sm:leading-6">
          {guide.title}
        </h3>
        <p className="ui-body mt-1.5 line-clamp-2 text-[13px] leading-5 text-text-secondary sm:line-clamp-3 sm:text-[14px] sm:leading-6">
          {guide.summary}
        </p>
        <div className="mt-auto flex w-full items-center justify-between gap-3 pt-4">
          <span className="inline-flex whitespace-nowrap rounded-md bg-eco-soft px-2.5 py-1 text-[12px] font-semibold text-accent sm:text-[13px]">
            {guide.phaseTitle} <span aria-hidden="true">·</span> Step {current} of {total}
          </span>
          <span className="hidden shrink-0 items-center gap-1 text-[13px] font-semibold text-accent sm:inline-flex">
            Open <ArrowRight size={15} aria-hidden="true" />
          </span>
        </div>
      </div>
    </button>
  )
}

function GuideLibrary({ watchedIds, onOpen }) {
  const [activePhaseId, setActivePhaseId] = useState(GUIDE_PHASES[0].id)
  const [query, setQuery] = useState('')
  const activePhase = GUIDE_PHASES.find((phase) => phase.id === activePhaseId) ?? GUIDE_PHASES[0]
  const normalizedQuery = query.trim().toLocaleLowerCase()

  const visibleGuides = useMemo(() => activePhase.guides
    .map((phaseGuide) => ALL_GUIDES.find((guide) => guide.id === phaseGuide.id))
    .filter(Boolean)
    .filter((guide) => !normalizedQuery || `${guide.title} ${guide.summary} ${guide.phaseTitle}`.toLocaleLowerCase().includes(normalizedQuery)), [activePhase, normalizedQuery])

  const handleSearch = (value) => {
    setQuery(value)
    const search = value.trim().toLocaleLowerCase()
    if (!search) return

    const firstMatch = ALL_GUIDES.find((guide) =>
      `${guide.title} ${guide.summary} ${guide.phaseTitle}`.toLocaleLowerCase().includes(search)
    )
    if (firstMatch) setActivePhaseId(firstMatch.phaseId)
  }

  return (
    <section aria-labelledby="guide-library-title">
      <h2 id="guide-library-title" className="sr-only">Process guides</h2>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <label className="order-1 flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-border-strong bg-surface px-4 text-text-faint focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 lg:order-2 lg:ml-auto lg:max-w-[19rem]">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search process guides</span>
          <input
            value={query}
            onChange={(event) => handleSearch(event.target.value)}
            type="search"
            placeholder="Find a process"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-navy outline-none placeholder:text-text-faint"
          />
        </label>

        <div className="order-2 min-w-0 overflow-x-auto rounded-xl border border-border-muted bg-surface p-1.5 [scrollbar-color:var(--color-border-strong)_transparent] [scrollbar-width:thin] lg:order-1 lg:flex-1">
          <div role="tablist" aria-label="Municipal workflow phases" className="flex min-w-max gap-1.5">
            {GUIDE_PHASES.map((phase) => {
              const selected = phase.id === activePhase.id
              return (
                <button
                  key={phase.id}
                  id={`guide-phase-tab-${phase.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="guide-phase-panel"
                  onClick={() => {
                    setActivePhaseId(phase.id)
                    setQuery('')
                  }}
                  className={`min-h-11 rounded-lg px-4 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? 'bg-accent text-accent-fg shadow-sm' : 'text-text-secondary hover:bg-sidebar hover:text-navy'}`}
                >
                  {PHASE_TAB_LABELS[phase.id] ?? phase.title}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div id="guide-phase-panel" role="tabpanel" aria-labelledby={`guide-phase-tab-${activePhase.id}`} className="mt-6 sm:mt-7">
        {visibleGuides.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            {visibleGuides.map((guide) => <GuideCard key={guide.id} guide={guide} watched={watchedIds.includes(guide.id)} onOpen={onOpen} />)}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface px-5 py-9 text-center">
            <p className="text-sm font-medium text-navy">No guide matches “{query.trim()}”.</p>
            <p className="ui-body mt-1 text-[13px] text-text-secondary">Try another process name or clear the search.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function GuideLearningNotes({ guide }) {
  const steps = guide.steps?.length ? guide.steps : guide.transcript ?? []

  return (
    <div className="border-t border-border-muted pt-5">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <section>
          <h3 className="text-[13px] font-semibold text-navy">Before you start</h3>
          <p className="ui-body mt-1.5 text-[13px] leading-5 text-text-secondary">{guide.before}</p>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold text-navy">What happens next</h3>
          <p className="ui-body mt-1.5 text-[13px] leading-5 text-text-secondary">{guide.next}</p>
        </section>
      </div>

      <section className="mt-5 rounded-lg bg-sidebar p-4">
        <h3 className="text-[13px] font-semibold text-navy">Check before you continue</h3>
        <p className="ui-body mt-1.5 text-[13px] leading-5 text-text-secondary">{guide.check}</p>
      </section>

      {steps.length > 0 && (
        <details className="group mt-5 border-t border-border-muted">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 pt-2 text-[13px] font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><BookOpen size={16} aria-hidden="true" /> Step-by-step instructions</span>
            <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-text-faint transition-transform group-open:rotate-90" />
          </summary>
          <ol className="list-decimal space-y-2.5 pb-1 pt-2 pl-5 marker:font-semibold marker:text-text-secondary">
            {steps.map((step, index) => (
              <li key={`${guide.id}-step-${index}`} className="ui-body pl-1 text-[13px] leading-5 text-text-secondary">{step}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

function GuideVideo({ guide, watched, onWatched }) {
  const [videoError, setVideoError] = useState(false)

  if (videoError) {
    return (
      <div role="alert" className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg bg-brand px-6 text-center text-brand-fg">
        <CircleHelp size={28} aria-hidden="true" />
        <p className="max-w-md text-sm font-medium">This video could not be loaded.</p>
        <a href={guide.video} className="rounded-md px-3 py-2 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">Open the video file</a>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-muted">
      <video
        className="block aspect-video w-full bg-brand object-contain"
        controls
        playsInline
        preload="metadata"
        poster={guide.poster}
        onError={() => setVideoError(true)}
        onEnded={onWatched}
        aria-label={`Video guide: ${guide.title}`}
      >
        <source src={guide.video} type="video/mp4" />
        Your browser cannot play this video. Try opening it in a modern browser.
      </video>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 text-[12px] text-text-secondary sm:px-4">
        <span className="inline-flex items-center gap-1.5"><Video size={13} aria-hidden="true" className="text-text-faint" /> Video guide</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 size={13} aria-hidden="true" className="text-text-faint" /> About {guide.duration}</span>
        {watched && <span className="inline-flex items-center gap-1.5 font-medium text-success"><CheckCircle2 size={13} aria-hidden="true" /> Viewed</span>}
      </div>
    </div>
  )
}

function GuideModal({ guide, watched, onClose, onWatched, onSelectGuide }) {
  const { current, total } = getGuidePosition(guide)
  const { previousGuide, nextGuide } = getGuideNeighbors(guide)

  return (
    <Modal
      title={guide.title}
      subtitle={`${guide.phaseTitle} · Step ${current} of ${total}`}
      onClose={onClose}
      size="2xl"
      placement="centered"
      floatingControls={(
        <div aria-label="Guide navigation" role="group">
          {previousGuide && (
            <button
              type="button"
              onClick={() => onSelectGuide(previousGuide)}
              aria-label={`Previous guide: ${previousGuide.title}`}
              className="absolute left-[calc(50%-42rem)] top-1/2 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-surface/95 text-navy shadow-[0_14px_32px_rgba(8,20,14,0.25)] transition-[background-color,color,transform] duration-150 hover:scale-105 hover:bg-accent hover:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none xl:left-0 xl:inline-flex 2xl:left-[calc(50%-42rem)]"
            >
              <ArrowLeft size={30} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
          {nextGuide && (
            <button
              type="button"
              onClick={() => onSelectGuide(nextGuide)}
              aria-label={`Next guide: ${nextGuide.title}`}
              className="absolute right-[calc(50%-42rem)] top-1/2 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-surface/95 text-navy shadow-[0_14px_32px_rgba(8,20,14,0.25)] transition-[background-color,color,transform] duration-150 hover:scale-105 hover:bg-accent hover:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none xl:right-0 xl:inline-flex 2xl:right-[calc(50%-42rem)]"
            >
              <ArrowRight size={30} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    >
      <div className="space-y-6">
        {guide.ready ? (
          <GuideVideo key={guide.id} guide={guide} watched={watched} onWatched={onWatched} />
        ) : (
          <div className="flex min-h-28 items-center gap-3 rounded-lg bg-sidebar px-4 py-5">
            <Clock3 size={20} aria-hidden="true" className="shrink-0 text-text-faint" />
            <div>
              <p className="text-sm font-semibold text-navy">Video walkthrough in preparation</p>
              <p className="ui-body mt-1 text-[13px] leading-5 text-text-secondary">Use the written guidance below to review this process.</p>
            </div>
          </div>
        )}
        <nav aria-label="Guide navigation" className="flex flex-col gap-2 border-b border-border-muted pb-5 sm:flex-row sm:items-center sm:justify-between xl:hidden">
          <div className="flex min-h-10 items-center">
            {previousGuide && (
              <button
                type="button"
                onClick={() => onSelectGuide(previousGuide)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-[13px] font-semibold text-text-secondary transition-colors hover:border-accent hover:bg-eco-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Previous step
              </button>
            )}
          </div>
          <div className="flex min-h-10 items-center sm:justify-end">
            {nextGuide && (
              <button
                type="button"
                onClick={() => onSelectGuide(nextGuide)}
                className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg bg-accent px-3.5 text-left text-[13px] font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium leading-4 opacity-85">Next step</span>
                  <span className="block max-w-[17rem] truncate leading-4">{nextGuide.title}</span>
                </span>
                <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
              </button>
            )}
          </div>
        </nav>
        <p className="ui-body text-[15px] leading-6 text-text-secondary">{guide.summary}</p>
        <GuideLearningNotes guide={guide} />
      </div>
    </Modal>
  )
}

function HelpGuideContent({ userId }) {
  const storageKey = `${PROGRESS_KEY}:${userId ?? 'account'}`
  const [watchedIds, setWatchedIds] = useState(() => readWatched(storageKey))
  const [selectedGuide, setSelectedGuide] = useState(null)

  const markWatched = useCallback((id) => {
    setWatchedIds((current) => {
      if (current.includes(id)) return current
      const next = [...current, id]
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Progress remains available for this visit. */ }
      return next
    })
  }, [storageKey])

  return (
    <DashboardPage className="gap-7 pb-10 sm:gap-8 sm:pb-12">
      <header className="px-0.5 pt-2 sm:pt-3">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-navy sm:text-[2.35rem]">Help &amp; Guide</h1>
      </header>

      <GuideLibrary watchedIds={watchedIds} onOpen={setSelectedGuide} />

      {selectedGuide && (
        <GuideModal
          guide={selectedGuide}
          watched={watchedIds.includes(selectedGuide.id)}
          onClose={() => setSelectedGuide(null)}
          onWatched={() => markWatched(selectedGuide.id)}
          onSelectGuide={setSelectedGuide}
        />
      )}
    </DashboardPage>
  )
}

export default function HelpGuide() {
  const { user } = useAuth()
  return <HelpGuideContent key={user?.id ?? 'account'} userId={user?.id} />
}
