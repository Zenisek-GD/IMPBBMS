// Keep access to shared records aligned with the API's read permissions.
// A configured role can receive these grants without having a built-in name.
export const RECORD_PAGE_PERMISSIONS = {
  '/planning': ['planning.view'],
  '/budget/preparation': ['budget.view'],
  '/budget/controls': ['budget.view'],
  '/budget/appropriations': ['budget.view'],
  '/budget/unexpended': ['budget.view'],
  '/app-entries': ['app.view', 'app.viewPublished'],
  '/purchase-requisitions': ['pr.view'],
  '/invoices': ['payment.view', 'delivery.submitInvoice'],
}

export const canReadRecordPage = (path, permissions = []) =>
  RECORD_PAGE_PERMISSIONS[path]?.some((permission) => permissions.includes(permission))
