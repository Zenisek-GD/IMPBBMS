import {
  FileText,
  Gavel,
  Users,
  UserPlus,
  Landmark,
  Award,
  Truck,
  FileClock,
  Settings,
  Building2,
  ShieldCheck,
  LayoutDashboard,
  ClipboardCheck,
  ClipboardList,
  CalendarClock,
  Megaphone,
  PiggyBank,
  Receipt,
  Banknote,
  Package,
  BarChart3,
  FileSignature,
  Inbox,
  Globe,
  Mail,
  ScrollText,
  TrendingUp,
  Target,
  ListTree,
  Scale,
  Eye,
} from 'lucide-react'

// One nav config per role from the system design doc, Section 2.1 / Section 11.
// `key` values must match the Role.key rows seeded by municipal_backend/seed.js.
//
// ── GROUPING ─────────────────────────────────────────────────────────────────
// Every role's sidebar is split into labelled groups rather than one long list.
// The first group is deliberately unlabelled — it holds the landing page, and a
// heading above a single "Workspace" link is noise. Below it the items are
// grouped by *stage of the procurement lifecycle*, not by page type, because
// that is the order the work actually happens in: plan, then solicit, then
// award, then pay. Sidebar.jsx draws the rule between groups and hides the
// headings when the rail is collapsed.
//
// ── LINKS ────────────────────────────────────────────────────────────────────
// Every href below resolves to a route that exists in App.jsx. An earlier
// version of this file carried twenty-one links to routes that were never
// built — /fund-verification, /supplier/bids, /bac-chair/post-qual and the like
// — which meant a sizeable part of every sidebar silently did nothing when
// clicked. Where a page for a stage does not exist, the item now points at the
// page that actually performs that stage (bid opening and post-qualification
// both live inside the Evaluation workspace, for instance) rather than at a
// placeholder.
export const ROLE_NAV = {
  systemAdministrator: {
    brandTitle: 'System Console',
    brandSubtitle: 'Administration',
    searchPlaceholder: 'Search system logs...',
    sections: [
      { items: [{ label: 'Administrator Dashboard', href: '/admin', icon: LayoutDashboard }] },
      {
        heading: 'Administration',
        items: [
          { label: 'Users & Roles', href: '/admin/users', icon: Users },
          // Admin/IT is the only office that can turn a BAC-approved
          // accreditation into a working account, so this queue is theirs.
          { label: 'Bidder Accounts', href: '/admin/bidder-accounts', icon: UserPlus },
          { label: 'Departments', href: '/admin/departments', icon: Building2 },
          { label: 'System Settings', href: '/admin/settings', icon: Settings },
          { label: 'Thresholds', href: '/admin/thresholds', icon: ShieldCheck },
          // The administrator's route to the public portal, for maintenance and
          // system notices.
          { label: 'Announcements', href: '/announcements/manage', icon: Megaphone },
        ],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Audit Trail', href: '/audit-log', icon: FileClock },
          { label: 'Public Messages', href: '/messages', icon: Mail },
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
        ],
      },
    ],
  },

  hope: {
    brandTitle: 'Executive Office',
    brandSubtitle: 'Office of the Mayor',
    searchPlaceholder: 'Search PR # or Dept...',
    sections: [
      { items: [{ label: 'Executive Dashboard', href: '/executive', icon: TrendingUp }] },
      {
        // The Mayor's own acts sit at the top of the chain, before anything is
        // procured: naming the year's priorities against the development plan,
        // endorsing the investment program, and approving the executive budget.
        heading: 'Planning & Budget',
        items: [
          { label: 'Development Plan & AIP', href: '/planning', icon: Target },
          { label: 'Executive Budget', href: '/budget/preparation', icon: Landmark },
        ],
      },
      {
        heading: 'Approvals',
        items: [
          { label: 'APP Approvals', href: '/app-entries', icon: ClipboardCheck },
          { label: 'PR Approvals', href: '/purchase-requisitions', icon: FileText },
          { label: 'Award Approvals', href: '/evaluation', icon: Award },
        ],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Decision Support', href: '/dss', icon: BarChart3 },
          { label: 'Budget Utilisation', href: '/budget/unexpended', icon: PiggyBank },
          // Complaints about a procurement route to the HoPE.
          { label: 'Public Messages', href: '/messages', icon: Mail },
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
        ],
      },
      {
        // Sec. 84 — "With respect to LGUs, the decision of the local chief
        // executive shall be final."
        heading: 'Remedies',
        items: [{ label: 'Protests', href: '/protests', icon: Scale }],
      },
    ],
  },

  bacChairperson: {
    brandTitle: 'BAC Chair',
    brandSubtitle: 'Bids & Awards Committee',
    searchPlaceholder: 'Search bids or PR #...',
    sections: [
      { items: [{ label: 'BAC Chair Dashboard', href: '/bac-chair', icon: LayoutDashboard }] },
      {
        // GPM, "Responsibilities of the BAC" item iv: determining the
        // eligibility of prospective bidders is the committee's act. The
        // Secretariat assembles and checks the file; the Chair rules on it.
        heading: 'Eligibility',
        items: [{ label: 'Bidder Eligibility', href: '/secretariat/vendors', icon: Users }],
      },
      {
        // Bid opening, scoring, post-qualification and the award recommendation
        // are all acts performed in the Evaluation workspace — they are stages
        // of one screen, not separate destinations.
        heading: 'Bidding',
        items: [
          { label: 'Evaluation & Award', href: '/evaluation', icon: Gavel },
          { label: 'Observers', href: '/observers', icon: Eye },
          { label: 'Protests', href: '/protests', icon: Scale },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
      },
      {
        heading: 'Contracts',
        items: [{ label: 'Contracts', href: '/contracts', icon: FileSignature }],
      },
    ],
  },

  // ── BAC Vice-Chairperson ──────────────────────────────────────────────────
  // Same workspace as the Chairperson, because the office exists precisely so
  // that the committee can sit when the Chairperson cannot: the quorum rule
  // requires "the Chairperson or the Vice-Chairperson" present at every meeting
  // and deliberation. A Vice-Chair with a narrower screen than the Chair could
  // not preside, which would defeat the point of designating one.
  bacViceChairperson: {
    brandTitle: 'BAC Vice-Chair',
    brandSubtitle: 'Bids & Awards Committee',
    searchPlaceholder: 'Search bids or PR #...',
    sections: [
      { items: [{ label: 'BAC Vice-Chair Dashboard', href: '/bac-chair', icon: LayoutDashboard }] },
      {
        heading: 'Eligibility',
        items: [{ label: 'Bidder Eligibility', href: '/secretariat/vendors', icon: Users }],
      },
      {
        heading: 'Bidding',
        items: [
          { label: 'Evaluation & Award', href: '/evaluation', icon: Gavel },
          { label: 'Observers', href: '/observers', icon: Eye },
          { label: 'Protests', href: '/protests', icon: Scale },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
      },
      {
        heading: 'Procurement',
        items: [{ label: 'Requisitions', href: '/purchase-requisitions', icon: FileSignature }],
      },
      {
        heading: 'Contracts',
        items: [{ label: 'Contracts', href: '/contracts', icon: FileSignature }],
      },
    ],
  },

  bacMember: {
    brandTitle: 'BAC Member',
    brandSubtitle: 'Bids & Awards Committee',
    searchPlaceholder: 'Search assigned bids...',
    sections: [
      { items: [{ label: 'BAC Member Dashboard', href: '/bac-member', icon: LayoutDashboard }] },
      {
        heading: 'Evaluation',
        items: [
          { label: 'Bid Evaluation', href: '/evaluation', icon: Gavel },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
      },
    ],
  },

  bacSecretariat: {
    brandTitle: 'BAC Secretariat',
    brandSubtitle: 'Procurement Operations',
    searchPlaceholder: 'Search PR # or RFQ...',
    sections: [
      { items: [{ label: 'Secretariat Dashboard', href: '/secretariat', icon: LayoutDashboard }] },
      {
        heading: 'Planning',
        items: [
          { label: 'APP Consolidation', href: '/app-entries', icon: ClipboardList },
          { label: 'PR Review', href: '/purchase-requisitions', icon: FileText },
        ],
      },
      {
        heading: 'Solicitation',
        items: [
          { label: 'RFQ / ITB', href: '/secretariat/rfq', icon: Megaphone },
          // Sits above vendor verification deliberately: a call for bidders is
          // posted first, and the applications it attracts are what the next
          // screen reviews.
          { label: 'Announcements', href: '/announcements/manage', icon: Megaphone },
          // Renamed: this office records the submission and checks the
          // requirements. Whether the bidder is *eligible* is the BAC's call.
          { label: 'Bidder Registrations', href: '/secretariat/vendors', icon: Users },
          // Project, contract and bidder enquiries from the public portal.
          { label: 'Public Messages', href: '/messages', icon: Mail },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
      },
      {
        // RA 12009 Sec. 43 — the Secretariat keeps the observer roster and
        // issues the invitations, as part of making the arrangements for the
        // committee's meetings.
        heading: 'Transparency',
        items: [{ label: 'Observers', href: '/observers', icon: Eye }],
      },
      {
        heading: 'Contracts',
        items: [
          { label: 'Contract Drafting', href: '/contracts', icon: FileSignature },
          { label: 'Pending Items', href: '/pending-items', icon: Package },
        ],
      },
    ],
  },

  twgMember: {
    brandTitle: 'Technical WG',
    brandSubtitle: 'Technical Working Group',
    searchPlaceholder: 'Search assigned bids...',
    sections: [
      { items: [{ label: 'TWG Dashboard', href: '/twg', icon: LayoutDashboard }] },
      {
        heading: 'Evaluation',
        items: [
          { label: 'Technical Evaluation', href: '/evaluation', icon: ClipboardCheck },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
      },
    ],
  },

  // ── Municipal Planning and Development Office ──────────────────────────────
  // Writes the development plan and the investment program, consolidates the
  // offices' budget requests against them, and sits on the Local Finance
  // Committee. Deliberately carries no procurement link: planning what the
  // municipality will do is a different job from buying it.
  planningOfficer: {
    brandTitle: 'Planning Office',
    brandSubtitle: 'Development & Investment Programming',
    searchPlaceholder: 'Search projects or goals...',
    sections: [
      { items: [{ label: 'Planning Dashboard', href: '/planning-office', icon: LayoutDashboard }] },
      {
        heading: 'Planning',
        items: [
          { label: 'Development Plan & AIP', href: '/planning', icon: Target },
          { label: 'APP Alignment', href: '/app-entries', icon: ClipboardList },
        ],
      },
      {
        heading: 'Budget',
        items: [
          { label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark },
          { label: 'Appropriation Register', href: '/budget/appropriations', icon: ScrollText },
        ],
      },
    ],
  },

  // ── Office of the Sangguniang Bayan ────────────────────────────────────────
  // The legislature's clerk of record. Records what the Sanggunian adopted and
  // enacted, and what the province did with the ordinance afterwards. It
  // decides nothing — which is why its sidebar is short.
  sanggunianSecretary: {
    brandTitle: 'Sangguniang Bayan',
    brandSubtitle: 'Ordinances & Resolutions',
    searchPlaceholder: 'Search ordinance or resolution...',
    sections: [
      { items: [{ label: 'Sanggunian Dashboard', href: '/sanggunian', icon: LayoutDashboard }] },
      {
        heading: 'Legislation',
        items: [
          { label: 'Appropriation Ordinance', href: '/budget/preparation', icon: Scale },
          { label: 'Development Plan & AIP', href: '/planning', icon: Target },
        ],
      },
      {
        heading: 'Records',
        items: [
          { label: 'Appropriation Register', href: '/budget/appropriations', icon: ScrollText },
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
        ],
      },
    ],
  },

  // ── Head of Office ────────────────────────────────────────────────────────
  // Same workspace as their staff: the office prepares its budget proposal, its
  // PPMP lines and its requisitions together. What the head adds is the
  // endorsement — step 15 — which staff cannot perform on their own request.
  headOfOffice: {
    brandTitle: 'Procurement Flow',
    brandSubtitle: 'Workflow Management',
    searchPlaceholder: 'Search PR # or Dept...',
    sections: [
      { items: [{ label: 'Office Head Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
      {
        heading: 'Planning',
        items: [
          // An office's year starts here, not at the APP: it asks for money
          // first, and only plans procurement against what it was granted.
          { label: 'Budget Proposal', href: '/budget/preparation', icon: Landmark },
          { label: 'Development Plan & AIP', href: '/planning', icon: ListTree },
          { label: 'APP Entries', href: '/app-entries', icon: ClipboardList },
          { label: 'Purchase Requisitions', href: '/purchase-requisitions', icon: FileText },
        ],
      },
      {
        heading: 'Implementation',
        items: [
          { label: 'Deliveries', href: '/deliveries', icon: Truck },
          { label: 'Pending Items', href: '/pending-items', icon: Package },
        ],
      },
    ],
  },
  departmentRequester: {
    brandTitle: 'Procurement Flow',
    brandSubtitle: 'Workflow Management',
    searchPlaceholder: 'Search PR # or Dept...',
    sections: [
      { items: [{ label: 'Department Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
      {
        heading: 'Planning',
        items: [
          // An office's year starts here, not at the APP: it asks for money
          // first, and only plans procurement against what it was granted.
          { label: 'Budget Proposal', href: '/budget/preparation', icon: Landmark },
          { label: 'Development Plan & AIP', href: '/planning', icon: ListTree },
          { label: 'APP Entries', href: '/app-entries', icon: ClipboardList },
          { label: 'Purchase Requisitions', href: '/purchase-requisitions', icon: FileText },
        ],
      },
      {
        heading: 'Implementation',
        items: [
          { label: 'Deliveries', href: '/deliveries', icon: Truck },
          { label: 'Pending Items', href: '/pending-items', icon: Package },
        ],
      },
    ],
  },

  budgetOfficer: {
    brandTitle: 'Budget Office',
    brandSubtitle: 'Appropriation & Certification',
    searchPlaceholder: 'Search PR # or account code...',
    sections: [
      { items: [{ label: 'Budget Dashboard', href: '/budget', icon: PiggyBank }] },
      {
        // Listed before the register because it comes before it in the year:
        // the register holds what the ordinance granted, and this is where the
        // ordinance is built.
        heading: 'Preparation',
        items: [
          { label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark },
          { label: 'Development Plan & AIP', href: '/planning', icon: ListTree },
        ],
      },
      {
        heading: 'Appropriation',
        items: [
          { label: 'Appropriation Register', href: '/budget/appropriations', icon: ScrollText },
          { label: 'Utilisation Monitor', href: '/budget/unexpended', icon: TrendingUp },
        ],
      },
      {
        heading: 'Certification',
        items: [
          { label: 'Certification Queue', href: '/purchase-requisitions', icon: ClipboardCheck },
          { label: 'APP Funding', href: '/app-entries', icon: ClipboardList },
        ],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Decision Support', href: '/dss', icon: BarChart3 },
          { label: 'Pending Items', href: '/pending-items', icon: Package },
        ],
      },
    ],
  },

  municipalAccountant: {
    brandTitle: 'Accounting Office',
    brandSubtitle: 'Claim Certification',
    searchPlaceholder: 'Search invoice or PO #...',
    sections: [
      { items: [{ label: 'Accounting Dashboard', href: '/finance', icon: Banknote }] },
      {
        // LGC Sec. 344 — the Accountant obligates the appropriation on a
        // requisition before it may be procured. This is the third of the
        // section's three officers, and the Accountant previously had no
        // requisition work at all: the Budget Officer both certified and
        // obligated.
        heading: 'Obligation',
        items: [{ label: 'Requisitions to obligate', href: '/purchase-requisitions', icon: Receipt }],
      },
      {
        heading: 'Disbursement',
        items: [{ label: 'Invoices & Vouchers', href: '/invoices', icon: Receipt }],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Contracts', href: '/contracts', icon: FileSignature },
          { label: 'Budget Utilisation', href: '/budget/unexpended', icon: TrendingUp },
        ],
      },
    ],
  },

  municipalTreasurer: {
    brandTitle: "Treasurer's Office",
    brandSubtitle: 'Disbursement & Release',
    searchPlaceholder: 'Search voucher or DV #...',
    sections: [
      { items: [{ label: 'Treasury Dashboard', href: '/finance', icon: Banknote }] },
      {
        // LGC Sec. 344's cash certification happens here, before procurement
        // starts — not at disbursement. It is listed first because it is the
        // earliest point in the lifecycle the Treasurer is accountable for.
        heading: 'Certification',
        items: [
          { label: 'Requisitions to Certify', href: '/purchase-requisitions', icon: FileText },
        ],
      },
      {
        // The Treasurer is one of the three statutory Local Finance Committee
        // members, so the budget forum and hearings are their work too — not
        // something the Budget Office does to them.
        heading: 'Finance Committee',
        items: [{ label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark }],
      },
      {
        heading: 'Disbursement',
        items: [{ label: 'Vouchers for Release', href: '/invoices', icon: Receipt }],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Contracts', href: '/contracts', icon: FileSignature },
          { label: 'Budget Utilisation', href: '/budget/unexpended', icon: TrendingUp },
        ],
      },
    ],
  },

  vendor: {
    brandTitle: 'Supplier Portal',
    brandSubtitle: 'Vendor Workspace',
    searchPlaceholder: 'Search opportunities...',
    sections: [
      { items: [{ label: 'Supplier Dashboard', href: '/supplier', icon: LayoutDashboard }] },
      {
        heading: 'Bidding',
        items: [
          { label: 'Opportunities', href: '/supplier/opportunities', icon: Inbox },
          { label: 'Conferences', href: '/conferences', icon: CalendarClock },
        ],
      },
      {
        heading: 'Contracts & Payment',
        items: [
          { label: 'Contracts', href: '/contracts', icon: FileSignature },
          { label: 'Invoices', href: '/invoices', icon: Receipt },
        ],
      },
      // A "Company" group used to sit here holding one link, "Eligibility &
      // Registration". Accreditation is submitted on paper at the BAC office, so
      // that page no longer exists and the group has nothing else in it — an
      // empty heading is worse than no heading.
      {
        // RA 12009 Sec. 83–85 — the bidder's remedy against a decision of the
        // BAC, and under Sec. 85 a precondition to any court action.
        heading: 'Remedies',
        items: [{ label: 'Protests', href: '/protests', icon: Scale }],
      },
    ],
  },

  observer: {
    brandTitle: 'Transparency Portal',
    brandSubtitle: 'Public Records',
    searchPlaceholder: 'Search published records...',
    sections: [
      { items: [{ label: 'Observer Dashboard', href: '/transparency', icon: LayoutDashboard }] },
      {
        heading: 'Published Records',
        items: [
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
          { label: 'Approved APP', href: '/app-entries', icon: ClipboardList },
          { label: 'Contracts', href: '/contracts', icon: FileSignature },
        ],
      },
      {
        // Sec. 43 — the six stages the BAC must open to observation, the
        // attendance record, and the observation report the IRR obliges an
        // observer to file.
        heading: 'Proceedings',
        items: [{ label: 'Observed proceedings', href: '/observers', icon: Eye }],
      },
    ],
  },

  internalAuditor: {
    brandTitle: 'Internal Audit',
    brandSubtitle: 'Compliance & Review',
    searchPlaceholder: 'Search any record or actor...',
    sections: [
      { items: [{ label: 'Audit Dashboard', href: '/audit', icon: LayoutDashboard }] },
      {
        heading: 'Audit',
        items: [
          { label: 'Audit Log', href: '/audit-log', icon: ScrollText },
          { label: 'Decision Support', href: '/dss', icon: BarChart3 },
        ],
      },
      {
        heading: 'Records',
        items: [
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
          // Reports that something published looks wrong come here.
          { label: 'Public Messages', href: '/messages', icon: Mail },
          // The auditor's questions start above procurement: was the LGU ever
          // authorised to buy this, and by whom.
          { label: 'Development Plan & AIP', href: '/planning', icon: Target },
          { label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark },
          { label: 'Contracts', href: '/contracts', icon: FileSignature },
          { label: 'Invoices', href: '/invoices', icon: Receipt },
          { label: 'Pending Items', href: '/pending-items', icon: Package },
        ],
      },
    ],
  },
}
