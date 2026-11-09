import { apiClient } from './client'

export const fetchBackupStatus = () =>
  apiClient.get('/backup/status').then((res) => res.data)

export const fetchBackupList = () =>
  apiClient.get('/backup/list').then((res) => res.data)

export const createBackup = (payload = {}) =>
  apiClient.post('/backup/create', payload).then((res) => res.data)

export const deleteBackup = (filename) =>
  apiClient.delete(`/backup/${encodeURIComponent(filename)}`).then((res) => res.data)

export const inspectBackupFile = (file) => {
  const formData = new FormData()
  formData.append('backup', file)
  return apiClient.post('/backup/inspect', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((res) => res.data)
}

export const inspectStoredBackup = (filename) =>
  apiClient.post('/backup/inspect', { filename }).then((res) => res.data)

export const restoreBackupFile = (file, confirmationPhrase) => {
  const formData = new FormData()
  formData.append('backup', file)
  formData.append('confirm', 'true')
  formData.append('confirmationPhrase', confirmationPhrase)
  return apiClient.post('/backup/restore', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((res) => res.data)
}

export const restoreStoredBackup = (filename, confirmationPhrase) =>
  apiClient.post('/backup/restore', {
    filename,
    confirm: true,
    confirmationPhrase,
  }).then((res) => res.data)

export const fetchScheduleConfig = () =>
  apiClient.get('/backup/schedule').then((res) => res.data)

export const updateScheduleConfig = (payload) =>
  apiClient.patch('/backup/schedule', payload).then((res) => res.data)

export const downloadBackupUrl = (filename) =>
  `/api/backup/download/${encodeURIComponent(filename)}`
