import { apiClient } from './client'

export const fetchReportCatalog = async (signal) => (await apiClient.get('/reports/catalog', { signal })).data
export const fetchReport = async (type, params, signal) => (await apiClient.get(`/reports/${type}`, { params, signal })).data
export const fetchPendingCounts = async (signal) => (await apiClient.get('/reports/pending-counts', { signal })).data
export const exportReportCsv = async (type, params) => (await apiClient.get(`/reports/${type}`, { params: { ...params, format: 'csv' }, responseType: 'blob' })).data
