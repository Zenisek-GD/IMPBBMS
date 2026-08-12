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
  Stamp,
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
//
// ── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
// Each item carries an optional `shortcut` string (e.g. "Alt+1") so officers
// can navigate without reaching for the mouse. Shortcuts use `Alt+<number>`
// sequentially within each role, giving every sidebar destination a single
// consistent key combo. The hint is rendered in the sidebar and the actual
// binding is handled by the useKeyboardShortcuts hook.
export const ROLE_NAV = {
  systemAdministrator: {
    brandTitle: 'System Console',
    brandSubtitle: 'Administration',
    searchPlaceholder: 'Search system logs...',
    sections: [
      { items: [{ label: 'Administrator Dashboard', href: '/admin', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Administration',
        items: [
          { label: 'Users & Roles', href: '/admin/users', icon: Users, shortcut: 'Alt+2' },
          // Admin/IT is the only office that can turn a BAC-approved
          // accreditation into a working account, so this queue is theirs.
          { label: 'Bidder Accounts', href: '/admin/bidder-accounts', icon: UserPlus, shortcut: 'Alt+3' },
          { label: 'Departments', href: '/admin/departments', icon: Building2, shortcut: 'Alt+4' },
          { label: 'System Settings', href: '/admin/settings', icon: Settings, shortcut: 'Alt+5' },
          { label: 'Thresholds', href: '/admin/thresholds', icon: ShieldCheck, shortcut: 'Alt+6' },
          // The administrator's route to the public portal, for maintenance and
          // system notices.
          { label: 'Announcements', href: '/announcements/manage', icon: Megaphone, shortcut: 'Alt+7' },
          { label: 'Document Templates', href: '/documents/templates', icon: FileText },
        ],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Audit Trail', href: '/audit-log', icon: FileClock, shortcut: 'Alt+8' },
          { label: 'Public Messages', href: '/messages', icon: Mail, shortcut: 'Alt+9' },
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe, shortcut: 'Alt+0' },
        ],
      },
    ],
  },

  hope: {
    brandTitle: 'Executive Office',
    brandSubtitle: 'Office of the Mayor',
    searchPlaceholder: 'Search PR # or Dept...',
    sections: [
      { items: [{ label: 'Executive Dashboard', href: '/executive', icon: TrendingUp, shortcut: 'Alt+1' }] },
      {
        // The Mayor's own acts sit at the top of the chain, before anything is
        // procured: naming the year's priorities against the development plan,
        // endorsing the investment program, and approving the executive budget.
        heading: 'Planning & Budget',
        items: [
          { label: 'Development Plan & AIP', href: '/planning', icon: Target, shortcut: 'Alt+2' },
          { label: 'Executive Budget', href: '/budget/preparation', icon: Landmark, shortcut: 'Alt+3' },
        ],
      },
      {
        heading: 'Approvals',
        items: [
          { label: 'APP Approvals', href: '/app-entries', icon: ClipboardCheck, shortcut: 'Alt+4' },
          { label: 'PR Approvals', href: '/purchase-requisitions', icon: FileText, shortcut: 'Alt+5' },
          { label: 'Award Approvals', href: '/evaluation', icon: Award, shortcut: 'Alt+6' },
          { label: 'Document Approvals', href: '/documents', icon: Stamp },
        ],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Decision Support', href: '/dss', icon: BarChart3, shortcut: 'Alt+7' },
          { label: 'Budget Utilisation', href: '/budget/unexpended', icon: PiggyBank, shortcut: 'Alt+8' },
          // Complaints about a procurement route to the HoPE.
          { label: 'Public Messages', href: '/messages', icon: Mail, shortcut: 'Alt+9' },
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe, shortcut: 'Alt+0' },
        ],
      },
      {
        // Sec. 84 — "With respect to LGUs, the decision of the local chief
        // executive shall be final."
        heading: 'Remedies',
        items: [{ label: 'Protests', href: '/protests', icon: Scale, shortcut: 'Alt+p' }],
      },
    ],
  },

  bacChairperson: {
    brandTitle: 'BAC Chair',
    brandSubtitle: 'Bids & Awards Committee',
    searchPlaceholder: 'Search bids or PR #...',
    sections: [
      { items: [{ label: 'BAC Chair Dashboard', href: '/bac-chair', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        // GPM, "Responsibilities of the BAC" item iv: determining the
        // eligibility of prospective bidders is the committee's act. The
        // Secretariat assembles and checks the file; the Chair rules on it.
        heading: 'Eligibility',
        items: [{ label: 'Bidder Eligibility', href: '/secretariat/vendors', icon: Users, shortcut: 'Alt+2' }],
      },
      {
        // Bid opening, scoring, post-qualification and the award recommendation
        // are all acts performed in the Evaluation workspace — they are stages
        // of one screen, not separate destinations.
        heading: 'Bidding',
        items: [
          { label: 'Evaluation & Award', href: '/evaluation', icon: Gavel, shortcut: 'Alt+3' },
          { label: 'Observers', href: '/observers', icon: Eye, shortcut: 'Alt+4' },
          { label: 'Protests', href: '/protests', icon: Scale, shortcut: 'Alt+5' },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock, shortcut: 'Alt+6' },
        ],
      },
      {
        heading: 'Contracts',
        items: [{ label: 'Contracts', href: '/contracts', icon: FileSignature, shortcut: 'Alt+7' }],
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
      { items: [{ label: 'BAC Vice-Chair Dashboard', href: '/bac-chair', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Eligibility',
        items: [{ label: 'Bidder Eligibility', href: '/secretariat/vendors', icon: Users, shortcut: 'Alt+2' }],
      },
      {
        heading: 'Bidding',
        items: [
          { label: 'Evaluation & Award', href: '/evaluation', icon: Gavel, shortcut: 'Alt+3' },
          { label: 'Observers', href: '/observers', icon: Eye, shortcut: 'Alt+4' },
          { label: 'Protests', href: '/protests', icon: Scale, shortcut: 'Alt+5' },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock, shortcut: 'Alt+6' },
        ],
      },
      {
        heading: 'Procurement',
        items: [{ label: 'Requisitions', href: '/purchase-requisitions', icon: FileSignature, shortcut: 'Alt+7' }],
      },
      {
        heading: 'Contracts',
        items: [{ label: 'Contracts', href: '/contracts', icon: FileSignature, shortcut: 'Alt+8' }],
      },
    ],
  },

  bacMember: {
    brandTitle: 'BAC Member',
    brandSubtitle: 'Bids & Awards Committee',
    searchPlaceholder: 'Search assigned bids...',
    sections: [
      { items: [{ label: 'BAC Member Dashboard', href: '/bac-member', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Evaluation',
        items: [
          { label: 'Bid Evaluation', href: '/evaluation', icon: Gavel, shortcut: 'Alt+2' },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock, shortcut: 'Alt+3' },
        ],
      },
    ],
  },

  bacSecretariat: {
    brandTitle: 'BAC Secretariat',
    brandSubtitle: 'Procurement Operations',
    searchPlaceholder: 'Search PR # or RFQ...',
    sections: [
      { items: [{ label: 'Secretariat Dashboard', href: '/secretariat', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Planning',
        items: [
          { label: 'APP Consolidation', href: '/app-entries', icon: ClipboardList, shortcut: 'Alt+2' },
          { label: 'PR Review', href: '/purchase-requisitions', icon: FileText, shortcut: 'Alt+3' },
        ],
      },
      {
        heading: 'Solicitation',
        items: [
          { label: 'RFQ / ITB', href: '/secretariat/rfq', icon: Megaphone, shortcut: 'Alt+4' },
          // Sits above vendor verification deliberately: a call for bidders is
          // posted first, and the applications it attracts are what the next
          // screen reviews.
          { label: 'Invitation to Bid', href: '/announcements/itb', icon: Megaphone },
          { label: 'Announcements', href: '/announcements/manage', icon: Megaphone, shortcut: 'Alt+5' },
          // Renamed: this office records the submission and checks the
          // requirements. Whether the bidder is *eligible* is the BAC's call.
          { label: 'Bidder Registrations', href: '/secretariat/vendors', icon: Users, shortcut: 'Alt+6' },
          // Project, contract and bidder enquiries from the public portal.
          { label: 'Public Messages', href: '/messages', icon: Mail, shortcut: 'Alt+7' },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock, shortcut: 'Alt+8' },
        ],
      },
      {
        // RA 12009 Sec. 43 — the Secretariat keeps the observer roster and
        // issues the invitations, as part of making the arrangements for the
        // committee's meetings.
        heading: 'Transparency',
        items: [{ label: 'Observers', href: '/observers', icon: Eye, shortcut: 'Alt+9' }],
      },
      {
        heading: 'Contracts',
        items: [
          { label: 'Contract Drafting', href: '/contracts', icon: FileSignature, shortcut: 'Alt+0' },
          // Generated from the procurement record rather than retyped.
          { label: 'Official Documents', href: '/documents', icon: Stamp },
          { label: 'Document Templates', href: '/documents/templates', icon: FileText },
          { label: 'Pending Items', href: '/pending-items', icon: Package, shortcut: 'Alt+q' },
        ],
      },
    ],
  },

  twgMember: {
    brandTitle: 'Technical WG',
    brandSubtitle: 'Technical Working Group',
    searchPlaceholder: 'Search assigned bids...',
    sections: [
      { items: [{ label: 'TWG Dashboard', href: '/twg', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Evaluation',
        items: [
          { label: 'Technical Evaluation', href: '/evaluation', icon: ClipboardCheck, shortcut: 'Alt+2' },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock, shortcut: 'Alt+3' },
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
      { items: [{ label: 'Planning Dashboard', href: '/planning-office', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Planning',
        items: [
          { label: 'Development Plan & AIP', href: '/planning', icon: Target, shortcut: 'Alt+2' },
          { label: 'APP Alignment', href: '/app-entries', icon: ClipboardList, shortcut: 'Alt+3' },
        ],
      },
      {
        heading: 'Budget',
        items: [
          { label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark, shortcut: 'Alt+4' },
          { label: 'Appropriation Register', href: '/budget/appropriations', icon: ScrollText, shortcut: 'Alt+5' },
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
      { items: [{ label: 'Sanggunian Dashboard', href: '/sanggunian', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Legislation',
        items: [
          { label: 'Appropriation Ordinance', href: '/budget/preparation', icon: Scale, shortcut: 'Alt+2' },
          { label: 'Development Plan & AIP', href: '/planning', icon: Target, shortcut: 'Alt+3' },
        ],
      },
      {
        heading: 'Records',
        items: [
          { label: 'Appropriation Register', href: '/budget/appropriations', icon: ScrollText, shortcut: 'Alt+4' },
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe, shortcut: 'Alt+5' },
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
      { items: [{ label: 'Office Head Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Planning',
        items: [
          // An office's year starts here, not at the APP: it asks for money
          // first, and only plans procurement against what it was granted.
          { label: 'Budget Proposal', href: '/budget/preparation', icon: Landmark, shortcut: 'Alt+2' },
          { label: 'Development Plan & AIP', href: '/planning', icon: ListTree, shortcut: 'Alt+3' },
          { label: 'APP Entries', href: '/app-entries', icon: ClipboardList, shortcut: 'Alt+4' },
          { label: 'Purchase Requisitions', href: '/purchase-requisitions', icon: FileText, shortcut: 'Alt+5' },
          { label: 'Official Documents', href: '/documents', icon: Stamp },
        ],
      },
      {
        heading: 'Implementation',
        items: [
          { label: 'Deliveries', href: '/deliveries', icon: Truck, shortcut: 'Alt+6' },
          { label: 'Pending Items', href: '/pending-items', icon: Package, shortcut: 'Alt+7' },
        ],
      },
    ],
  },
  departmentRequester: {
    brandTitle: 'Procurement Flow',
    brandSubtitle: 'Workflow Management',
    searchPlaceholder: 'Search PR # or Dept...',
    sections: [
      { items: [{ label: 'Department Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Planning',
        items: [
          // An office's year starts here, not at the APP: it asks for money
          // first, and only plans procurement against what it was granted.
          { label: 'Budget Proposal', href: '/budget/preparation', icon: Landmark, shortcut: 'Alt+2' },
          { label: 'Development Plan & AIP', href: '/planning', icon: ListTree, shortcut: 'Alt+3' },
          { label: 'APP Entries', href: '/app-entries', icon: ClipboardList, shortcut: 'Alt+4' },
          { label: 'Purchase Requisitions', href: '/purchase-requisitions', icon: FileText, shortcut: 'Alt+5' },
          { label: 'Official Documents', href: '/documents', icon: Stamp },
        ],
      },
      {
        heading: 'Implementation',
        items: [
          { label: 'Deliveries', href: '/deliveries', icon: Truck, shortcut: 'Alt+6' },
          { label: 'Pending Items', href: '/pending-items', icon: Package, shortcut: 'Alt+7' },
        ],
      },
    ],
  },

  budgetOfficer: {
    brandTitle: 'Budget Office',
    brandSubtitle: 'Appropriation & Certification',
    searchPlaceholder: 'Search PR # or account code...',
    sections: [
      { items: [{ label: 'Budget Dashboard', href: '/budget', icon: PiggyBank, shortcut: 'Alt+1' }] },
      {
        // Listed before the register because it comes before it in the year:
        // the register holds what the ordinance granted, and this is where the
        // ordinance is built.
        heading: 'Preparation',
        items: [
          { label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark, shortcut: 'Alt+2' },
          { label: 'Development Plan & AIP', href: '/planning', icon: ListTree, shortcut: 'Alt+3' },
        ],
      },
      {
        heading: 'Appropriation',
        items: [
          { label: 'Appropriation Register', href: '/budget/appropriations', icon: ScrollText, shortcut: 'Alt+4' },
          { label: 'Utilisation Monitor', href: '/budget/unexpended', icon: TrendingUp, shortcut: 'Alt+5' },
        ],
      },
      {
        heading: 'Certification',
        items: [
          { label: 'Certification Queue', href: '/purchase-requisitions', icon: ClipboardCheck, shortcut: 'Alt+6' },
          { label: 'APP Funding', href: '/app-entries', icon: ClipboardList, shortcut: 'Alt+7' },
        ],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Decision Support', href: '/dss', icon: BarChart3, shortcut: 'Alt+8' },
          { label: 'Pending Items', href: '/pending-items', icon: Package, shortcut: 'Alt+9' },
        ],
      },
    ],
  },

  municipalAccountant: {
    brandTitle: 'Accounting Office',
    brandSubtitle: 'Claim Certification',
    searchPlaceholder: 'Search invoice or PO #...',
    sections: [
      { items: [{ label: 'Accounting Dashboard', href: '/finance', icon: Banknote, shortcut: 'Alt+1' }] },
      {
        // LGC Sec. 344 — the Accountant obligates the appropriation on a
        // requisition before it may be procured. This is the third of the
        // section's three officers, and the Accountant previously had no
        // requisition work at all: the Budget Officer both certified and
        // obligated.
        heading: 'Obligation',
        items: [{ label: 'Requisitions to obligate', href: '/purchase-requisitions', icon: Receipt, shortcut: 'Alt+2' }],
      },
      {
        heading: 'Disbursement',
        items: [{ label: 'Invoices & Vouchers', href: '/invoices', icon: Receipt, shortcut: 'Alt+3' }],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Contracts', href: '/contracts', icon: FileSignature, shortcut: 'Alt+4' },
          { label: 'Budget Utilisation', href: '/budget/unexpended', icon: TrendingUp, shortcut: 'Alt+5' },
        ],
      },
    ],
  },

  municipalTreasurer: {
    brandTitle: "Treasurer's Office",
    brandSubtitle: 'Disbursement & Release',
    searchPlaceholder: 'Search voucher or DV #...',
    sections: [
      { items: [{ label: 'Treasury Dashboard', href: '/finance', icon: Banknote, shortcut: 'Alt+1' }] },
      {
        // LGC Sec. 344's cash certification happens here, before procurement
        // starts — not at disbursement. It is listed first because it is the
        // earliest point in the lifecycle the Treasurer is accountable for.
        heading: 'Certification',
        items: [
          { label: 'Requisitions to Certify', href: '/purchase-requisitions', icon: FileText, shortcut: 'Alt+2' },
        ],
      },
      {
        // The Treasurer is one of the three statutory Local Finance Committee
        // members, so the budget forum and hearings are their work too — not
        // something the Budget Office does to them.
        heading: 'Finance Committee',
        items: [{ label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark, shortcut: 'Alt+3' }],
      },
      {
        heading: 'Disbursement',
        items: [{ label: 'Vouchers for Release', href: '/invoices', icon: Receipt, shortcut: 'Alt+4' }],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Contracts', href: '/contracts', icon: FileSignature, shortcut: 'Alt+5' },
          { label: 'Budget Utilisation', href: '/budget/unexpended', icon: TrendingUp, shortcut: 'Alt+6' },
        ],
      },
    ],
  },

  vendor: {
    brandTitle: 'Supplier Portal',
    brandSubtitle: 'Vendor Workspace',
    searchPlaceholder: 'Search opportunities...',
    sections: [
      { items: [{ label: 'Supplier Dashboard', href: '/supplier', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Bidding',
        items: [
          { label: 'Opportunities', href: '/supplier/opportunities', icon: Inbox, shortcut: 'Alt+2' },
          { label: 'Conferences', href: '/conferences', icon: CalendarClock, shortcut: 'Alt+3' },
        ],
      },
      {
        heading: 'Contracts & Payment',
        items: [
          { label: 'Contracts', href: '/contracts', icon: FileSignature, shortcut: 'Alt+4' },
          { label: 'Invoices', href: '/invoices', icon: Receipt, shortcut: 'Alt+5' },
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
        items: [{ label: 'Protests', href: '/protests', icon: Scale, shortcut: 'Alt+6' }],
      },
    ],
  },

  observer: {
    brandTitle: 'Transparency Portal',
    brandSubtitle: 'Public Records',
    searchPlaceholder: 'Search published records...',
    sections: [
      { items: [{ label: 'Observer Dashboard', href: '/transparency', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Published Records',
        items: [
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe, shortcut: 'Alt+2' },
          { label: 'Approved APP', href: '/app-entries', icon: ClipboardList, shortcut: 'Alt+3' },
          { label: 'Contracts', href: '/contracts', icon: FileSignature, shortcut: 'Alt+4' },
        ],
      },
      {
        // Sec. 43 — the six stages the BAC must open to observation, the
        // attendance record, and the observation report the IRR obliges an
        // observer to file.
        heading: 'Proceedings',
        items: [{ label: 'Observed proceedings', href: '/observers', icon: Eye, shortcut: 'Alt+5' }],
      },
    ],
  },

  internalAuditor: {
    brandTitle: 'Internal Audit',
    brandSubtitle: 'Compliance & Review',
    searchPlaceholder: 'Search any record or actor...',
    sections: [
      { items: [{ label: 'Audit Dashboard', href: '/audit', icon: LayoutDashboard, shortcut: 'Alt+1' }] },
      {
        heading: 'Audit',
        items: [
          { label: 'Audit Log', href: '/audit-log', icon: ScrollText, shortcut: 'Alt+2' },
          { label: 'Decision Support', href: '/dss', icon: BarChart3, shortcut: 'Alt+3' },
        ],
      },
      {
        heading: 'Records',
        items: [
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe, shortcut: 'Alt+4' },
          // Reports that something published looks wrong come here.
          { label: 'Public Messages', href: '/messages', icon: Mail, shortcut: 'Alt+5' },
          // The auditor's questions start above procurement: was the LGU ever
          // authorised to buy this, and by whom.
          { label: 'Development Plan & AIP', href: '/planning', icon: Target, shortcut: 'Alt+6' },
          { label: 'Budget Preparation', href: '/budget/preparation', icon: Landmark, shortcut: 'Alt+7' },
          // What the office actually issued, and who approved and downloaded
          // each one — the paper trail the audit log entries refer to.
          { label: 'Issued Documents', href: '/documents', icon: Stamp },
          { label: 'Contracts', href: '/contracts', icon: FileSignature, shortcut: 'Alt+8' },
          { label: 'Invoices', href: '/invoices', icon: Receipt, shortcut: 'Alt+9' },
          { label: 'Pending Items', href: '/pending-items', icon: Package, shortcut: 'Alt+0' },
        ],
      },
    ],
  },
}

// ── Admin shortcut override merging ──────────────────────────────────────────
// Takes the static sections for a role and an array of { href, shortcut }
// overrides from the database, returning new sections with the admin-set
// shortcut replacing the default where the hrefs match. The original config
// is never mutated — a new array is produced.
export function applyShortcutOverrides(sections, overrides) {
  if (!overrides || !Array.isArray(overrides) || overrides.length === 0) return sections

  const map = new Map(overrides.map((o) => [o.href, o.shortcut]))

  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const override = map.get(item.href)
      return override ? { ...item, shortcut: override } : item
    }),
  }))
}
