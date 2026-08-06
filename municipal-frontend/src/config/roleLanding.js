// Landing route per role after login. Each maps to that role's sample
// dashboard (see src/pages/dashboards/) and matches the first sidebar item
// in ROLE_NAV so the active nav state is correct on arrival.
const ROLE_LANDING_ROUTE = {
  systemAdministrator: '/admin',
  hope: '/executive',
  bacChairperson: '/bac-chair',
  // Shares the Chairperson's workspace — the office exists so the committee can
  // sit when the Chairperson is absent, so it needs the same screen.
  bacViceChairperson: '/bac-chair',
  bacMember: '/bac-member',
  bacSecretariat: '/secretariat',
  twgMember: '/twg',
  // The office head works the same screens as their staff — they prepare the
  // office's budget proposal and PPMP lines, and endorse what staff requisition.
  headOfOffice: '/dashboard',
  departmentRequester: '/dashboard',
  budgetOfficer: '/budget',
  // The two offices in the planning and budget-legislation chain land on the
  // screen they actually work in, not a summary dashboard — the Planning Office
  // lives in the development plan, and the Sanggunian's clerk of record lives in
  // the budget calendar.
  planningOfficer: '/planning',
  sanggunianSecretary: '/budget/preparation',
  municipalAccountant: '/finance',
  municipalTreasurer: '/finance',
  vendor: '/supplier',
  observer: '/transparency',
  internalAuditor: '/audit',
}

export const DEFAULT_LANDING_ROUTE = '/coming-soon'

export const landingRouteForRole = (role) => ROLE_LANDING_ROUTE[role] ?? DEFAULT_LANDING_ROUTE
