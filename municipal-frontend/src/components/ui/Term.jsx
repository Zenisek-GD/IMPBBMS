import { GLOSSARY, expandedTerm } from '../../config/glossary'

// ── TERM ─────────────────────────────────────────────────────────────────────
// One consistent rendering for procurement jargon, per the plain-language rule:
// normal words first, official term kept alongside.
//
//   <Term term="BAC" />            → "Bids and Awards Committee (BAC)" with a
//                                    "What is this?" tooltip on hover.
//   <Term term="BAC" short />      → "BAC" with the full name + explanation as
//                                    the tooltip, for repeats after the first
//                                    appearance on the same screen.
//   <Term term="BAC" help />       → short form plus an inline expandable
//                                    "What is this?" explanation.
//
// Legal and official names are never removed — they are translated in place.
export default function Term({ term, short = false, help = false, className = '' }) {
  const entry = GLOSSARY[term]
  if (!entry) return <span className={className}>{term}</span>

  if (help) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-x-1.5 ${className}`}>
        <abbr title={`${entry.full} — ${entry.what}`} className="cursor-help underline decoration-dotted underline-offset-2">
          {short ? entry.short : expandedTerm(term)}
        </abbr>
        <details className="inline text-[12px]">
          <summary className="cursor-pointer font-medium text-info hover:underline">
            What is this?
          </summary>
          <span className="mt-1 block max-w-xs rounded-md border border-border-muted bg-surface p-2 font-normal text-text-secondary shadow-sm">
            {entry.what}
          </span>
        </details>
      </span>
    )
  }

  if (short) {
    return (
      <abbr
        title={`${entry.full} — ${entry.what}`}
        className={`cursor-help underline decoration-dotted underline-offset-2 ${className}`}
      >
        {entry.short}
      </abbr>
    )
  }

  return (
    <abbr title={entry.what} className={className}>
      {expandedTerm(term)}
    </abbr>
  )
}
