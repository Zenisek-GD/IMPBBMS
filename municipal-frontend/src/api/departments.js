import { apiClient } from './client'

export const fetchDepartments = (params = {}) =>
  apiClient.get('/departments', { params }).then((res) => res.data)

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
