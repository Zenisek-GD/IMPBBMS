import { apiClient } from './client'

export const fetchNotifications = (params = {}) =>
  apiClient.get('/notifications', { params }).then((res) => res.data)

export const markRead = (id) => apiClient.post(`/notifications/${id}/read`).then((res) => res.data)

export const markAllRead = () => apiClient.post('/notifications/read-all').then((res) => res.data)
