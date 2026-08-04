import { apiClient } from './client'

export const fetchSettings = () => apiClient.get('/settings').then((res) => res.data)

export const updateSettings = (payload) =>
  apiClient.patch('/settings', payload).then((res) => res.data)

export const LGU_TYPE_LABELS = {
  province: 'Province',
  city: 'City',
  municipality: 'Municipality',
  barangay: 'Barangay',
}

export const INCOME_CLASS_LABELS = {
  '1st': '1st class',
  '2nd': '2nd class',
  '3rd': '3rd class',
  '4th': '4th class',
  '5th': '5th class',
}
