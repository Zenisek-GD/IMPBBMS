import { apiClient } from './client'

export const fetchDepartments = (params = {}) =>
  apiClient.get('/departments', { params }).then((res) => res.data)

// Names and codes of the active offices, readable by any signed-in user. Use
// this in forms that have to name an office — `fetchDepartments` is the
// administrator's listing and 403s for everyone else.
export const fetchOfficeDirectory = () =>
  apiClient.get('/departments/directory').then((res) => res.data)

export const createDepartment = (payload) =>
  apiClient.post('/departments', payload).then((res) => res.data)

export const updateDepartment = (id, payload) =>
  apiClient.patch(`/departments/${id}`, payload).then((res) => res.data)

export const DEPARTMENT_TYPES = [
  { key: 'endUser', label: 'End-User Department' },
  { key: 'committee', label: 'Committee Unit' },
  { key: 'support', label: 'Support Office' },
  { key: 'executive', label: 'Executive Office' },
]

export const departmentTypeLabel = (key) =>
  DEPARTMENT_TYPES.find((type) => type.key === key)?.label ?? key
