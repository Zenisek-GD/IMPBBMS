// ── PLAIN-LANGUAGE GLOSSARY ──────────────────────────────────────────────────
// Procurement runs on acronyms that new and older staff should not have to
// memorise before they can work. Every entry keeps the official term (it still
// matters for documents, audit trails and reports) and pairs it with the words
// people actually use.
//
// Pattern: first appearance on a screen shows "Full name (SHORT)"; repeats use
// the short form with the full name as a tooltip. The <Term /> component in
// components/ui/Term.jsx renders both forms so screens stay consistent.
export const GLOSSARY = {
  BAC: {
    short: 'BAC',
    full: 'Bids and Awards Committee',
    what: 'The committee that advertises procurements, evaluates bids and recommends the award.',
  },
  TWG: {
    short: 'TWG',
    full: 'Technical Working Group',
    what: 'The technical team that assists the BAC with eligibility checks, bid evaluation and post-qualification.',
  },
  HoPE: {
    short: 'HoPE',
    full: 'Head of the Procuring Entity / Mayor',
    what: 'The Mayor, who approves awards and holds final accountability for each procurement.',
  },
  AIP: {
    short: 'AIP',
    full: 'Annual Investment Program',
    what: 'The year\u2019s list of costed projects drawn from the development plan.',
  },
  APP: {
    short: 'APP',
    full: 'Annual Procurement Plan',
    what: 'The year\u2019s list of what the municipality will procure, against which requisitions are checked.',
  },
  ABC: {
    short: 'ABC',
    full: 'Approved Budget for the Contract',
    what: 'The maximum amount the municipality may spend on this contract.',
  },
  RFQ: {
    short: 'RFQ',
    full: 'Request for Quotation',
    what: 'The solicitation document inviting suppliers to submit bids.',
  },
  NOA: {
    short: 'NOA',
    full: 'Notice of Award',
    what: 'The written notice accepting a bidder\u2019s proposal and confirming the award.',
  },
  ITB: {
    short: 'ITB',
    full: 'Invitation to Bid',
    what: 'The public notice inviting bidders to participate in a procurement.',
  },
  PR: {
    short: 'PR',
    full: 'Purchase Requisition',
    what: 'A requesting office\u2019s formal request to procure goods, works or services.',
  },
  Obligation: {
    short: 'Obligation',
    full: 'Confirm budget obligation',
    what: 'Recording that a sum is set aside (obligated) against an appropriation so it cannot be spent twice.',
  },
  PostQualification: {
    short: 'Post-qualification',
    full: 'Final supplier verification',
    what: 'Verifying the lowest responsive bidder\u2019s documents and capability before the award is confirmed.',
  },
}

// "Full name (SHORT)" for first appearances.
export const expandedTerm = (key) => {
  const entry = GLOSSARY[key]
  if (!entry) return key
  if (entry.short === entry.full) return entry.full
  return `${entry.full} (${entry.short})`
}

// Tooltip text for repeated short forms.
export const termTitle = (key) => {
  const entry = GLOSSARY[key]
  if (!entry) return undefined
  return `${entry.full} — ${entry.what}`
}
