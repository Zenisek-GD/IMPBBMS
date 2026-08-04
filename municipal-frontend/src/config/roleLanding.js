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
  municipalAccountant: '/finance',
  municipalTreasurer: '/finance',
  vendor: '/supplier',
  observer: '/transparency',
  internalAuditor: '/audit',
}

export const DEFAULT_LANDING_ROUTE = '/coming-soon'

export const landingRouteForRole = (role) => ROLE_LANDING_ROUTE[role] ?? DEFAULT_LANDING_ROUTE
