// Bidder eligibility requirements transcribed from the Implementing Rules and
// Regulations of RA No. 12009, 1st Edition (as of March 30, 2026), published by
// the GPPB: https://www.gppb.gov.ph/wp-content/uploads/2026/05/IRR-of-RA-12009-1st-Edition.pdf
//
// Section references are cited per item so they can be re-verified against the
// source when the GPPB issues amendments. Treat this file as the single place
// to update when the IRR changes — the wizard renders entirely from it.
//
// Envelope structure (Sec. 54.1): bids are submitted in TWO sealed envelopes,
// submitted simultaneously. The FIRST holds the technical component *including*
// the eligibility requirements of Sec. 52; the SECOND holds the financial
// component. (This is a change from the three-envelope habit of RA 9184-era
// practice — do not reintroduce a third envelope.)

export const PROCUREMENT_CATEGORIES = [
  { key: 'goods', label: 'Goods' },
  { key: 'infrastructure', label: 'Infrastructure Projects' },
  { key: 'consulting', label: 'Consulting Services' },
]

// Sec. 20.2.9.1 — documents every bidder must keep uploaded and current in
// PhilGEPS to hold Platinum registration. The Platinum certificate is what the
// BAC actually collects (Sec. 52.1); these are what stand behind it.
const PHILGEPS_SUPPORTING_DOCUMENTS = [
  {
    id: 'sec-dti-cda',
    label: 'SEC / DTI / CDA registration certificate',
    help: 'SEC for corporations and partnerships, DTI for sole proprietorships, CDA for cooperatives.',
    citation: 'IRR Sec. 20.2.9.1(a)',
  },
  {
    id: 'gis',
    label: 'General Information Sheet (corporations only)',
    help: 'Must be updated and reflect beneficial ownership information as filed with the SEC.',
    citation: 'IRR Sec. 20.2.9.1(b)',
    appliesIf: (profile) => profile.organizationType === 'corporation',
  },
  {
    id: 'mayors-permit',
    label: "Mayor's Permit / Business Permit or equivalent",
    citation: 'IRR Sec. 20.2.9.1(c)',
  },
  {
    id: 'tax-clearance',
    label: 'BIR Tax Clearance',
    help: 'As finally reviewed and approved by the Bureau of Internal Revenue.',
    citation: 'IRR Sec. 20.2.9.1(d)',
  },
  {
    id: 'pcab-registry',
    label: 'PCAB License and Registration',
    help: 'Required of contractors.',
    citation: 'IRR Sec. 20.2.9.1(e)',
    appliesIf: (profile) => profile.category === 'infrastructure',
  },
  {
    id: 'afs',
    label: 'Audited Financial Statements',
    help: 'Stamped "Received" by the BIR, or an email confirmation from the BIR for online submission (RMC 49-2020).',
    citation: 'IRR Sec. 20.2.9.1(f)',
  },
]

const LEGAL_STEP = {
  id: 'legal',
  title: 'Legal Eligibility',
  envelope: 1,
  description:
    'Establishes legal capacity to contract with government. The PhilGEPS Platinum certificate is the document the BAC collects; the rest are what must be current in your PhilGEPS registration behind it.',
  items: [
    {
      id: 'philgeps-platinum',
      label: 'PhilGEPS Certificate of Registration (Platinum Membership)',
      help: 'Must be valid and updated. The certificate is effective for one year and must be renewed on expiry or updated within its validity.',
      citation: 'IRR Sec. 52.1, 54.2, 20.2.9(b)',
      required: true,
    },
    ...PHILGEPS_SUPPORTING_DOCUMENTS.map((doc) => ({ ...doc, required: true })),
    {
      id: 'jva',
      label: 'Joint Venture Agreement (or notarized undertaking)',
      help: 'If no JVA exists yet, all prospective partners submit notarized statements undertaking to enter into and abide by a JVA should the bid succeed. Failure to do so forfeits the bid security. Infrastructure JVs must comply with RA 4566 (Contractors’ License Law).',
      citation: 'IRR Sec. 52.2, 54.2(a)(v)',
      required: true,
      appliesIf: (profile) => profile.isJointVenture,
    },
    {
      id: 'foreign-reciprocity',
      label: 'Country reciprocity certification (foreign bidders)',
      help: 'A certification from the relevant government office of the bidder’s country stating that Filipinos may participate in its government procurement for the same item or product.',
      citation: 'IRR Sec. 54.2(a)(ix), 52.4.1.2(b)',
      required: true,
      appliesIf: (profile) => profile.isForeignBidder,
    },
  ],
}

const TECHNICAL_ITEMS = {
  goods: [
    {
      id: 'ongoing-contracts',
      label: 'Statement of all ongoing government and private contracts',
      help: 'Includes contracts awarded but not yet started, whether or not similar in nature and complexity to this project.',
      citation: 'IRR Sec. 52.1(a), 54.2(a)(ii)',
      required: true,
    },
    {
      id: 'slcc',
      label: 'Statement of Single Largest Completed Contract (SLCC)',
      help: 'Similar to the project being bid, completed within ten (10) years of bid submission unless the Invitation to Bid states a shorter period. Value adjusted to current prices using PSA consumer price indices must be at least 50% of the ABC.',
      citation: 'IRR Sec. 52.1(b), 52.4.1.3',
      required: true,
    },
    {
      id: 'technical-specs',
      label: 'Technical Specifications',
      help: 'May include production or delivery schedule, manpower requirements, and after-sales service or spare parts, where applicable.',
      citation: 'IRR Sec. 54.2(a)(vii)',
      required: true,
    },
  ],
  infrastructure: [
    {
      id: 'pcab-license',
      label: 'PCAB License and Registration',
      help: 'Must match the category, classification, and size range of the project. Required for the JV itself where the bidder is a joint venture.',
      citation: 'IRR Sec. 54.2(b)(ii)',
      required: true,
    },
    {
      id: 'ongoing-contracts',
      label: 'Statement of all ongoing government and private contracts',
      citation: 'IRR Sec. 52.1(a), 54.2(b)(iii)',
      required: true,
    },
    {
      id: 'slcc',
      label: 'Statement of Single Largest Completed Contract (SLCC)',
      help: 'Similar to the project being bid, at least 50% of the ABC, adjusted to current prices using PSA consumer price indices.',
      citation: 'IRR Sec. 52.1(b), 52.4.2',
      required: true,
    },
    {
      id: 'org-chart',
      label: 'Organizational chart for the project',
      citation: 'IRR Sec. 54.2(b)(viii)(1)',
      required: true,
    },
    {
      id: 'personnel-list',
      label: 'List of contractor personnel with qualifications',
      help: 'Project Manager, Project Engineers, Materials Engineers, Foremen and similar, with complete qualifications and experience data.',
      citation: 'IRR Sec. 54.2(b)(viii)(2)',
      required: true,
    },
    {
      id: 'equipment-list',
      label: 'List of major equipment units',
      help: 'Owned, leased, or under purchase agreement — supported by proof of ownership or a certification of availability from the lessor or vendor covering the project duration.',
      citation: 'IRR Sec. 54.2(b)(viii)(3)',
      required: true,
    },
  ],
  consulting: [
    {
      id: 'nationality-statement',
      label: 'Statement of nationality and registered professionals',
      help: 'Confirms nationality and that those who will actually perform the service are registered professionals authorised by the appropriate regulatory body, including their curricula vitae.',
      citation: 'IRR Sec. 52.1(d)',
      required: true,
    },
    {
      id: 'project-list',
      label: 'List of completed and ongoing projects',
      citation: 'IRR Sec. 54.2(c)(iii)',
      required: true,
    },
    {
      id: 'approach-workplan',
      label: 'Approach, work plan, and schedule',
      help: 'For architectural design, architectural plans and designs are not required during the consultant selection process.',
      citation: 'IRR Sec. 54.2(c)(iv)',
      required: true,
    },
    {
      id: 'org-chart',
      label: 'Organizational chart for the project',
      citation: 'IRR Sec. 54.2(c)(ii)',
      required: true,
    },
    {
      id: 'key-personnel',
      label: 'List of key personnel with qualifications',
      citation: 'IRR Sec. 54.2(c)(v)',
      required: true,
    },
  ],
}

const FINANCIAL_ITEMS = {
  goods: [
    {
      id: 'nfcc',
      label: 'NFCC computation',
      help: 'Net Financial Contracting Capacity must be at least equal to the ABC. NFCC = [(current assets − current liabilities) × 15] − value of all outstanding or uncompleted portions of ongoing contracts, including awarded contracts not yet started. Based on the latest AFS filed with the BIR.',
      citation: 'IRR Sec. 52.1(c), 52.4.1.4',
      required: true,
      alternativeOf: 'financial-capacity',
    },
    {
      id: 'line-of-credit',
      label: 'Committed Line of Credit (alternative to NFCC)',
      help: 'For Goods only, a bidder may submit a committed Line of Credit from a bank in lieu of the NFCC computation. It must be at least 10% of the ABC; if issued by a foreign bank it must be confirmed or authenticated by a local bank.',
      citation: 'IRR Sec. 52.1(c), 52.4.1.5',
      required: true,
      alternativeOf: 'financial-capacity',
    },
  ],
  infrastructure: [
    {
      id: 'nfcc',
      label: 'NFCC computation',
      help: 'Must be at least equal to the ABC. Unlike Goods, a committed Line of Credit is not offered as a substitute for Infrastructure Projects.',
      citation: 'IRR Sec. 52.1(c), 54.2(b)(v)',
      required: true,
    },
  ],
  consulting: [],
}

const SWORN_STEP = {
  id: 'undertakings',
  title: 'Sworn Statements & Bid Security',
  envelope: 1,
  description: 'Executed undertakings and the security that accompanies the technical component.',
  items: [
    {
      id: 'omnibus-sworn-statement',
      label: 'Omnibus Sworn Statement',
      help: 'Executed by the bidder or its duly authorised representative, in the form prescribed by the IRR.',
      citation: 'IRR Sec. 54.2, 54.3',
      required: true,
    },
    {
      id: 'bid-security',
      label: 'Bid Security',
      help: 'In the prescribed form, amount, and validity period stated in the Bidding Documents.',
      citation: 'IRR Sec. 54.2, 56',
      required: true,
    },
  ],
}

const FINANCIAL_BID_STEP = {
  id: 'financial-bid',
  title: 'Financial Component',
  envelope: 2,
  description:
    'The second sealed envelope, submitted at the same time as the first. It is opened only if your technical component is rated "passed". A bid whose total price exceeds the ABC is rated "failed".',
  items: [
    {
      id: 'bid-form',
      label: 'Duly signed Bid Form',
      citation: 'IRR Sec. 54.4, 58',
      required: true,
    },
    {
      id: 'price-schedule',
      label: 'Price Schedule / Bill of Quantities',
      help: 'In the forms prescribed by the Philippine Bidding Documents for this procurement.',
      citation: 'IRR Sec. 54.4',
      required: true,
    },
  ],
}

export const buildEligibilitySteps = (profile) => {
  const filterItems = (items) =>
    items.filter((item) => (item.appliesIf ? item.appliesIf(profile) : true))

  const steps = [
    { ...LEGAL_STEP, items: filterItems(LEGAL_STEP.items) },
    {
      id: 'technical',
      title: 'Technical Eligibility',
      envelope: 1,
      description: 'Demonstrates the technical capability and track record to deliver this project.',
      items: filterItems(TECHNICAL_ITEMS[profile.category] ?? []),
    },
    {
      id: 'financial',
      title: 'Financial Eligibility',
      envelope: 1,
      description: 'Demonstrates financial capacity to carry the contract.',
      items: filterItems(FINANCIAL_ITEMS[profile.category] ?? []),
      note:
        profile.category === 'goods'
          ? 'Submit either the NFCC computation or a committed Line of Credit — one of the two satisfies this requirement.'
          : null,
    },
    { ...SWORN_STEP, items: filterItems(SWORN_STEP.items) },
    { ...FINANCIAL_BID_STEP, items: filterItems(FINANCIAL_BID_STEP.items) },
  ]

  return steps.filter((step) => step.items.length > 0)
}

// Deadlines run from the last day of posting the Invitation to Bid / Request
// for Expression of Interest to the submission and receipt of bids.
export const SUBMISSION_PERIODS = {
  goods: 'Maximum 45 calendar days',
  infrastructure: 'Maximum 50 calendar days (ABC ₱50M and below) or 65 calendar days (above ₱50M)',
  consulting: 'Maximum 75 calendar days',
}

export const IRR_SOURCE = {
  label: 'IRR of RA No. 12009, 1st Edition (as of March 30, 2026)',
  url: 'https://www.gppb.gov.ph/wp-content/uploads/2026/05/IRR-of-RA-12009-1st-Edition.pdf',
}
