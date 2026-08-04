import { apiClient } from './client'

export const fetchDocuments = (entityRef, entityId) =>
  apiClient.get('/documents', { params: { entityRef, entityId } }).then((res) => res.data)

// Multipart — the browser sets the boundary, so no Content-Type is passed.
export const uploadDocument = ({ file, entityRef, entityId, docType, label, onProgress }) => {
  const form = new FormData()
  form.append('file', file)
  form.append('entityRef', entityRef)
  form.append('entityId', entityId)
  if (docType) form.append('docType', docType)
  if (label) form.append('label', label)

  return apiClient
    .post('/documents', form, {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
    .then((res) => res.data)
}

export const deleteDocument = (id) => apiClient.delete(`/documents/${id}`).then((res) => res.data)

// Downloads go through axios so the session cookie is sent and a 403 surfaces
// as an error rather than the browser silently showing a JSON error page.
export const downloadDocument = async (id, filename) => {
  const response = await apiClient.get(`/documents/${id}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const MAX_UPLOAD_MB = 10

export const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx'

export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
