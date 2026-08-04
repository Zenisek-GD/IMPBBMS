import { apiClient } from './client'

export const fetchUsers = (params = {}) =>
  apiClient.get('/users', { params }).then((res) => res.data)

export const fetchRoles = () => apiClient.get('/users/roles').then((res) => res.data)

export const createUser = (payload) => apiClient.post('/users', payload).then((res) => res.data)

export const updateUser = (id, payload) =>
  apiClient.patch(`/users/${id}`, payload).then((res) => res.data)

export const resetUserPassword = (id) =>
  apiClient.post(`/users/${id}/reset-password`).then((res) => res.data)
