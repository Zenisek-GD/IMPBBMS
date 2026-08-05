// Landing route per role after login. Each maps to that role's sample
// dashboard (see src/pages/dashboards/) and matches the first sidebar item
// in ROLE_NAV so the active nav state is correct on arrival.
const ROLE_LANDING_ROUTE = {
  systemAdministrator: '/admin',
  hope: '/executive',
  bacChairperson: '/bac-chair',
  bacMember: '/bac-member',
  bacSecretariat: '/secretariat',
  twgMember: '/twg',
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
