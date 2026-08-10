import { apiClient } from './client'

export const fetchSettings = () => apiClient.get('/settings').then((res) => res.data)

export const updateSettings = (payload) =>
  apiClient.patch('/settings', payload).then((res) => res.data)

// ── Navigation shortcuts ────────────────────────────────────────────────────
export const fetchNavShortcuts = () =>
  apiClient.get('/settings/shortcuts').then((res) => res.data)

export const updateNavShortcuts = (shortcuts) =>
  apiClient.patch('/settings/shortcuts', { shortcuts }).then((res) => res.data)

// ── Public branding (no auth) ───────────────────────────────────────────────
export const fetchPublicBranding = () =>
  apiClient.get('/public/branding').then((res) => res.data)

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
