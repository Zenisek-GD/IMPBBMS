// ── ONE DASHBOARD PER ROLE ───────────────────────────────────────────────────
// Thirteen routes used to render one component showing the same four cards to
// everybody. This is the per-role description that replaces it: what the office
// does, which data its dashboard needs, and which figures matter to it.
//
// It is a config rather than seventeen components on purpose. The *shape* of a
// dashboard is the same everywhere — a line about the office, its own figures,
// its queue, where to go next — and only the content differs. Seventeen files
// repeating that shape would drift apart within a month.
//
// `needs` names sources from useDashboardData. Ask for nothing you do not draw:
// every entry is a request on sign-in.

const peso = (value) =>
  `₱${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

const count = (rows) => (Array.isArray(rows) ? rows.length : 0)
const countWhere = (rows, predicate) =>
  Array.isArray(rows) ? rows.filter(predicate).length : 0

// The two figures every office in the LGU is measured against, so several
// dashboards reuse them rather than restating the same two blocks.
const budgetStats = (data) =>
  data.budgetMonitor
    ? [
        {
          label: 'Appropriated',
          value: peso(data.budgetMonitor.totals.appropriated),
          hint: `FY${data.budgetMonitor.fiscalYear} by ordinance`,
        },
        {
          label: 'Obligated',
          value: peso(data.budgetMonitor.totals.obligated),
          hint: 'Committed by certified ORS',
        },
        {
          label: 'Unobligated',
          value: peso(data.budgetMonitor.totals.unobligated),
          hint: `${data.budgetMonitor.daysToYearEnd} days to year-end`,
          tone: 'warning',
        },
      ]
    : []

const DEFAULT = {
  needs: ['publicOverview'],
  stats: (data) => [
    {
      label: 'Published Projects',
      value: data.publicOverview?.totalProjects ?? '—',
      hint: 'On the transparency portal',
    },
  ],
  showActivity: false,
}

export const DASHBOARDS = {
  // ── Administration ────────────────────────────────────────────────────────
  systemAdministrator: {
    intro:
      'You administer accounts, offices and configuration. You do not act on procurement records — what you hold is the ability to let other people act on them.',
    needs: ['vendors', 'audit', 'publicOverview'],
    showActivity: true,
    stats: (data) => [
      {
        label: 'Bidders awaiting an account',
        value: countWhere(data.vendors, (v) => v.canCreateAccount),
        hint: 'Approved by the BAC, no login issued',
        tone: countWhere(data.vendors, (v) => v.canCreateAccount) > 0 ? 'warning' : undefined,
      },
      {
        label: 'Registered bidders',
        value: count(data.vendors),
        hint: 'All registration states',
      },
      {
        label: 'Published Projects',
        value: data.publicOverview?.totalProjects ?? '—',
        hint: 'Visible to the public',
      },
    ],
  },

  // ── Office of the Mayor (Head of the Procuring Entity) ─────────────────────
  hope: {
    intro:
      'As Head of the Procuring Entity you approve what the offices below you have prepared: the investment program, the executive budget, requisitions, and awards the BAC recommends.',
    needs: ['prs', 'appEntries', 'budgets', 'programs', 'rfqs', 'contracts', 'budgetMonitor', 'audit'],
    showActivity: true,
    stats: (data) => [
      ...budgetStats(data),
      {
        label: 'Awards to approve',
        value: countWhere(data.rfqs, (r) => r.status === 'evaluated'),
        hint: 'Recommended by the BAC',
      },
    ],
  },

  // ── Municipal Planning and Development Office ─────────────────────────────
  planningOfficer: {
    intro:
      'You write the development plan and the investment program, consolidate the offices’ budget requests against them, and sit on the Local Finance Committee.',
    needs: ['programs', 'budgets', 'appEntries', 'budgetMonitor'],
    stats: (data) => [
      { label: 'Investment programs', value: count(data.programs), hint: 'All years on record' },
      {
        label: 'APP entries',
        value: count(data.appEntries),
        hint: 'Procurement planned against the AIP',
      },
      ...budgetStats(data).slice(0, 2),
    ],
  },

  // ── Office of the Sangguniang Bayan ───────────────────────────────────────
  sanggunianSecretary: {
    intro:
      'You are the legislature’s clerk of record. You do not decide — you record what the Sanggunian adopted and what the province did with the ordinance afterwards.',
    needs: ['budgets', 'programs', 'budgetMonitor'],
    stats: (data) => [
      {
        label: 'Budgets awaiting the Sanggunian',
        value: countWhere(data.budgets, (b) => b.status === 'pendingSanggunianAction'),
        hint: 'Appropriation ordinance to record',
      },
      {
        label: 'Programs awaiting adoption',
        value: countWhere(data.programs, (p) => p.status === 'pendingSanggunianAdoption'),
        hint: 'Investment program resolutions',
      },
      ...budgetStats(data).slice(0, 1),
    ],
  },

  // ── Bids and Awards Committee ─────────────────────────────────────────────
  bacChairperson: {
    intro:
      'You preside over the committee: you determine the mode of procurement, chair the evaluation, decide requests for reconsideration, and recommend the award to the Mayor — who approves it.',
    needs: ['prs', 'rfqs', 'contracts', 'appEntries'],
    stats: (data) => [
      {
        label: 'Under evaluation',
        value: countWhere(data.rfqs, (r) => r.status === 'opened'),
        hint: 'Bids opened, scoring open',
      },
      {
        label: 'Awaiting mode determination',
        value: countWhere(data.prs, (p) => p.status === 'pendingModeDetermination'),
        hint: 'Cleared requisitions',
      },
      {
        label: 'Advertised',
        value: countWhere(data.rfqs, (r) => r.status === 'published'),
        hint: 'Open for submission',
      },
    ],
  },

  bacViceChairperson: {
    intro:
      'You hold the same authority as the Chairperson. The quorum rule requires the Chairperson or the Vice-Chairperson present at every meeting — which is why this office exists and why your screen is not narrower.',
    needs: ['prs', 'rfqs', 'contracts', 'appEntries'],
    stats: (data) => [
      {
        label: 'Under evaluation',
        value: countWhere(data.rfqs, (r) => r.status === 'opened'),
        hint: 'Bids opened, scoring open',
      },
      {
        label: 'Awaiting mode determination',
        value: countWhere(data.prs, (p) => p.status === 'pendingModeDetermination'),
        hint: 'Cleared requisitions',
      },
      {
        label: 'Advertised',
        value: countWhere(data.rfqs, (r) => r.status === 'published'),
        hint: 'Open for submission',
      },
    ],
  },

  bacMember: {
    intro:
      'You score bids against the rubric and vote on requests for reconsideration. Your scores are what the committee’s recommendation is built from.',
    needs: ['rfqs', 'prs'],
    stats: (data) => [
      {
        label: 'To evaluate',
        value: countWhere(data.rfqs, (r) => r.status === 'opened'),
        hint: 'Awaiting your score',
        tone: countWhere(data.rfqs, (r) => r.status === 'opened') > 0 ? 'warning' : undefined,
      },
      {
        label: 'Advertised',
        value: countWhere(data.rfqs, (r) => r.status === 'published'),
        hint: 'Not yet opened',
      },
      {
        label: 'Awarded',
        value: countWhere(data.rfqs, (r) => r.status === 'awarded'),
        hint: 'This committee’s completed work',
      },
    ],
  },

  bacSecretariat: {
    intro:
      'You are the committee’s support unit: you advertise procurements, keep the registry of suppliers, make the arrangements for its meetings, and take custody of the record. The committee decides; you document.',
    needs: ['prs', 'rfqs', 'vendors', 'contracts', 'appEntries'],
    stats: (data) => [
      {
        label: 'Registrations to review',
        value: countWhere(data.vendors, (v) => v.registrationStatus === 'submitted'),
        hint: 'Counter submissions received',
        tone:
          countWhere(data.vendors, (v) => v.registrationStatus === 'submitted') > 0
            ? 'warning'
            : undefined,
      },
      {
        label: 'Advertised',
        value: countWhere(data.rfqs, (r) => r.status === 'published'),
        hint: 'Open for submission',
      },
      {
        label: 'Contracts to draft',
        value: countWhere(data.contracts, (c) => c.status === 'draft'),
        hint: 'Award issued, contract not out',
      },
    ],
  },

  twgMember: {
    intro:
      'You assist the committee on the technical side: reviewing specifications and bidding documents, and providing the technical evaluation the BAC’s decision rests on.',
    needs: ['rfqs', 'prs'],
    stats: (data) => [
      {
        label: 'Awaiting technical input',
        value: countWhere(data.rfqs, (r) => r.status === 'opened'),
        hint: 'Bids opened',
        tone: countWhere(data.rfqs, (r) => r.status === 'opened') > 0 ? 'warning' : undefined,
      },
      {
        label: 'Advertised',
        value: countWhere(data.rfqs, (r) => r.status === 'published'),
        hint: 'Not yet opened',
      },
    ],
  },

  // ── The offices that request ──────────────────────────────────────────────
  headOfOffice: {
    intro:
      'You run an office: you prepare its budget request, plan its procurement in the APP, and endorse the requisitions your staff raise. Staff cannot endorse their own request — that signature is yours.',
    needs: ['prs', 'appEntries', 'budgets', 'programs', 'pendingItems'],
    stats: (data) => [
      {
        label: 'Awaiting your endorsement',
        value: countWhere(data.prs, (p) => p.status === 'pendingDepartmentHeadEndorsement'),
        hint: 'Requisitions from your office',
        tone:
          countWhere(data.prs, (p) => p.status === 'pendingDepartmentHeadEndorsement') > 0
            ? 'warning'
            : undefined,
      },
      {
        label: 'Requisitions in flight',
        value: countWhere(data.prs, (p) => !['approved', 'draft'].includes(p.status)),
        hint: 'Somewhere in the chain',
      },
      {
        label: 'Returned to you',
        value: countWhere(data.prs, (p) => p.status === 'returned'),
        hint: 'Need correcting and resubmitting',
        tone: countWhere(data.prs, (p) => p.status === 'returned') > 0 ? 'danger' : undefined,
      },
    ],
  },

  departmentRequester: {
    intro:
      'You prepare your office’s budget request, its APP entries, and its purchase requisitions. Each requisition goes to your head of office for endorsement before it moves.',
    needs: ['prs', 'appEntries', 'budgets', 'pendingItems'],
    stats: (data) => [
      {
        label: 'Drafts to submit',
        value: countWhere(data.prs, (p) => p.status === 'draft'),
        hint: 'Not yet in the chain',
      },
      {
        label: 'Returned to you',
        value: countWhere(data.prs, (p) => p.status === 'returned'),
        hint: 'Need correcting and resubmitting',
        tone: countWhere(data.prs, (p) => p.status === 'returned') > 0 ? 'danger' : undefined,
      },
      {
        label: 'Cleared for procurement',
        value: countWhere(data.prs, (p) => p.status === 'approved'),
        hint: 'Through the full chain',
      },
    ],
  },

  // ── The three officers of LGC Sec. 344, and the Budget Office ─────────────
  budgetOfficer: {
    intro:
      'You keep the appropriation register and certify that an appropriation exists before anything is bought. You also run the budget calendar and assemble the executive budget — but you neither approve it nor enact it.',
    needs: ['prs', 'appEntries', 'budgets', 'budgetMonitor', 'pendingItems'],
    stats: (data) => [
      ...budgetStats(data),
      {
        label: 'Awaiting your certification',
        value: countWhere(data.prs, (p) => p.status === 'pendingBudgetCertification'),
        hint: 'Requisitions needing an appropriation',
        tone:
          countWhere(data.prs, (p) => p.status === 'pendingBudgetCertification') > 0
            ? 'warning'
            : undefined,
      },
    ],
  },

  municipalAccountant: {
    intro:
      'LGC Sec. 344 names three officers, and you are the second: the Budget Officer certifies the appropriation exists, you obligate it, and the Treasurer certifies the cash. You also certify claims before they are paid.',
    needs: ['prs', 'invoices', 'contracts', 'budgetMonitor'],
    stats: (data) => [
      {
        label: 'Requisitions to obligate',
        value: countWhere(data.prs, (p) => p.status === 'pendingAccountantObligation'),
        hint: 'Raise the ORS (LGC Sec. 344)',
        tone:
          countWhere(data.prs, (p) => p.status === 'pendingAccountantObligation') > 0
            ? 'warning'
            : undefined,
      },
      {
        label: 'Invoices to certify',
        value: countWhere(data.invoices, (i) => i.status === 'submitted'),
        hint: 'Claim validity and documents',
        tone: countWhere(data.invoices, (i) => i.status === 'submitted') > 0 ? 'warning' : undefined,
      },
      ...budgetStats(data).slice(1, 3),
    ],
  },

  municipalTreasurer: {
    intro:
      'You hold the municipality’s cash. You certify it is actually there before a requisition proceeds (LGC Sec. 344), and you release it at the end — but you never certify the claim you are paying.',
    needs: ['prs', 'invoices', 'contracts', 'budgets', 'budgetMonitor'],
    stats: (data) => [
      {
        label: 'Requisitions to certify',
        value: countWhere(data.prs, (p) => p.status === 'pendingCashCertification'),
        hint: 'Availability of funds',
        tone:
          countWhere(data.prs, (p) => p.status === 'pendingCashCertification') > 0
            ? 'warning'
            : undefined,
      },
      {
        label: 'Vouchers to release',
        value: countWhere(data.invoices, (i) => i.status === 'certified'),
        hint: 'Certified by the Accountant',
        tone: countWhere(data.invoices, (i) => i.status === 'certified') > 0 ? 'warning' : undefined,
      },
      ...budgetStats(data).slice(1, 3),
    ],
  },

  // ── External parties ──────────────────────────────────────────────────────
  vendor: {
    intro:
      'You can see every procurement the municipality has advertised, submit bids, sign contracts awarded to you, and invoice for what you deliver.',
    needs: ['rfqs', 'contracts', 'invoices', 'publicOverview'],
    stats: (data) => [
      {
        label: 'Open opportunities',
        value: countWhere(data.rfqs, (r) => r.status === 'published'),
        hint: 'Accepting bids now',
      },
      {
        label: 'Contracts awaiting your signature',
        value: countWhere(
          data.contracts,
          (c) => c.status === 'pendingSignatures' && !c.signedByVendorAt
        ),
        hint: 'Sign to begin',
        tone: countWhere(
          data.contracts,
          (c) => c.status === 'pendingSignatures' && !c.signedByVendorAt
        )
          ? 'warning'
          : undefined,
      },
      {
        label: 'Invoices awaiting payment',
        value: countWhere(data.invoices, (i) => ['submitted', 'certified'].includes(i.status)),
        hint: 'Submitted, not yet released',
      },
    ],
  },

  observer: {
    intro:
      'You represent the public. You may attend the stages of the procurement process the BAC must open to observation, and file the observation report the IRR obliges you to file.',
    needs: ['appEntries', 'contracts', 'publicOverview'],
    stats: (data) => [
      {
        label: 'Published Projects',
        value: data.publicOverview?.totalProjects ?? '—',
        hint: `${data.publicOverview?.ongoing ?? 0} ongoing`,
      },
      {
        label: 'Approved APP entries',
        value: count(data.appEntries),
        hint: 'Published plan lines',
      },
      {
        label: 'Total contracted',
        value: peso(data.publicOverview?.totalContracted),
        hint: 'Awarded and signed',
      },
    ],
  },

  internalAuditor: {
    intro:
      'You read the whole record — including denied and returned actions. Your questions start above procurement: was the municipality ever authorised to buy this, and by whom.',
    needs: ['prs', 'appEntries', 'budgets', 'contracts', 'budgetMonitor', 'audit', 'pendingItems'],
    showActivity: true,
    stats: (data) => [
      ...budgetStats(data),
      {
        label: 'Returned requisitions',
        value: countWhere(data.prs, (p) => p.status === 'returned'),
        hint: 'Sent back at some stage',
      },
    ],
  },
}

export const dashboardFor = (role) => DASHBOARDS[role] ?? DEFAULT
