import {
  FileText,
  Gavel,
  Users,
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
  ScrollText,
  TrendingUp,
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
    topLinks: [
      { label: 'Overview', href: '/admin' },
      { label: 'Audit', href: '/audit-log' },
    ],
    searchPlaceholder: 'Search system logs...',
    sections: [
      { items: [{ label: 'Oversight', href: '/admin', icon: LayoutDashboard }] },
      {
        heading: 'Administration',
        items: [
          { label: 'Users & Roles', href: '/admin/users', icon: Users },
          { label: 'Departments', href: '/admin/departments', icon: Building2 },
          { label: 'System Settings', href: '/admin/settings', icon: Settings },
          { label: 'Thresholds', href: '/admin/thresholds', icon: ShieldCheck },
        ],
      },
      {
        heading: 'Oversight',
        items: [
          { label: 'Audit Trail', href: '/audit-log', icon: FileClock },
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
        ],
      },
    ],
  },

  hope: {
    brandTitle: 'Executive Office',
    brandSubtitle: 'Office of the Mayor',
    topLinks: [
      { label: 'Insights', href: '/executive' },
      { label: 'Approvals', href: '/purchase-requisitions' },
    ],
    searchPlaceholder: 'Search PR # or Dept...',
    sections: [
      { items: [{ label: 'Executive Insights', href: '/executive', icon: TrendingUp }] },
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
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
        ],
      },
    ],
  },

  bacChairperson: {
    brandTitle: 'BAC Chair',
    brandSubtitle: 'Bids & Awards Committee',
    topLinks: [
      { label: 'Workspace', href: '/bac-chair' },
      { label: 'Evaluation', href: '/evaluation' },
    ],
    searchPlaceholder: 'Search bids or PR #...',
    sections: [
      { items: [{ label: 'Workspace', href: '/bac-chair', icon: LayoutDashboard }] },
      {
        // Bid opening, scoring, post-qualification and the award recommendation
        // are all acts performed in the Evaluation workspace — they are stages
        // of one screen, not separate destinations.
        heading: 'Bidding',
        items: [
          { label: 'Evaluation & Award', href: '/evaluation', icon: Gavel },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
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
    topLinks: [{ label: 'Workspace', href: '/bac-member' }],
    searchPlaceholder: 'Search assigned bids...',
    sections: [
      { items: [{ label: 'Workspace', href: '/bac-member', icon: LayoutDashboard }] },
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
    topLinks: [
      { label: 'Workspace', href: '/secretariat' },
      { label: 'Vendors', href: '/secretariat/vendors' },
    ],
    searchPlaceholder: 'Search PR # or RFQ...',
    sections: [
      { items: [{ label: 'Workspace', href: '/secretariat', icon: LayoutDashboard }] },
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
          { label: 'Vendor Verification', href: '/secretariat/vendors', icon: Users },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
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
    topLinks: [{ label: 'Workspace', href: '/twg' }],
    searchPlaceholder: 'Search assigned bids...',
    sections: [
      { items: [{ label: 'Workspace', href: '/twg', icon: LayoutDashboard }] },
      {
        heading: 'Evaluation',
        items: [
          { label: 'Technical Evaluation', href: '/evaluation', icon: ClipboardCheck },
          { label: 'Live Conference', href: '/conferences', icon: CalendarClock },
        ],
      },
    ],
  },

  departmentRequester: {
    brandTitle: 'Procurement Flow',
    brandSubtitle: 'Workflow Management',
    topLinks: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Requisitions', href: '/purchase-requisitions' },
      { label: 'Deliveries', href: '/deliveries' },
    ],
    searchPlaceholder: 'Search PR # or Dept...',
    sections: [
      { items: [{ label: 'Workspace', href: '/dashboard', icon: LayoutDashboard }] },
      {
        heading: 'Planning',
        items: [
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
    topLinks: [
      { label: 'Monitor', href: '/budget' },
      { label: 'Appropriations', href: '/budget/appropriations' },
    ],
    searchPlaceholder: 'Search PR # or account code...',
    sections: [
      { items: [{ label: 'Budget Monitor', href: '/budget', icon: PiggyBank }] },
      {
        heading: 'Appropriation',
        items: [
          { label: 'Appropriation Register', href: '/budget/appropriations', icon: Landmark },
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
    topLinks: [
      { label: 'Processing', href: '/finance' },
      { label: 'Invoices', href: '/invoices' },
    ],
    searchPlaceholder: 'Search invoice or PO #...',
    sections: [
      { items: [{ label: 'Payment Hub', href: '/finance', icon: Banknote }] },
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
    topLinks: [
      { label: 'Releases', href: '/finance' },
      { label: 'Vouchers', href: '/invoices' },
    ],
    searchPlaceholder: 'Search voucher or DV #...',
    sections: [
      { items: [{ label: 'Payment Hub', href: '/finance', icon: Banknote }] },
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
    topLinks: [
      { label: 'Opportunities', href: '/supplier/opportunities' },
      { label: 'Contracts', href: '/contracts' },
    ],
    searchPlaceholder: 'Search opportunities...',
    sections: [
      { items: [{ label: 'Supplier Home', href: '/supplier', icon: LayoutDashboard }] },
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
      {
        heading: 'Company',
        items: [{ label: 'Eligibility & Registration', href: '/supplier/eligibility', icon: ClipboardCheck }],
      },
    ],
  },

  observer: {
    brandTitle: 'Transparency Portal',
    brandSubtitle: 'Public Records',
    topLinks: [{ label: 'Published Records', href: '/transparency-portal' }],
    searchPlaceholder: 'Search published records...',
    sections: [
      { items: [{ label: 'Overview', href: '/transparency', icon: LayoutDashboard }] },
      {
        heading: 'Published Records',
        items: [
          { label: 'Transparency Portal', href: '/transparency-portal', icon: Globe },
          { label: 'Approved APP', href: '/app-entries', icon: ClipboardList },
          { label: 'Contracts', href: '/contracts', icon: FileSignature },
        ],
      },
    ],
  },

  internalAuditor: {
    brandTitle: 'Internal Audit',
    brandSubtitle: 'Compliance & Review',
    topLinks: [
      { label: 'Audit Log', href: '/audit-log' },
      { label: 'Records', href: '/transparency-portal' },
    ],
    searchPlaceholder: 'Search any record or actor...',
    sections: [
      { items: [{ label: 'Audit Home', href: '/audit', icon: LayoutDashboard }] },
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
          { label: 'Contracts', href: '/contracts', icon: FileSignature },
          { label: 'Invoices', href: '/invoices', icon: Receipt },
          { label: 'Pending Items', href: '/pending-items', icon: Package },
        ],
      },
    ],
  },
}
