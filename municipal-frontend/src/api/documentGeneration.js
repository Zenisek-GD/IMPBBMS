import { apiClient } from './client'

// Template management and document generation. Mounted at /api/doc-generation
// rather than /api/documents, which is the raw attachment store.

// ── Templates ────────────────────────────────────────────────────────────────
export const fetchTemplateOptions = () =>
  apiClient.get('/doc-generation/templates/options').then((res) => res.data)

export const fetchTemplates = (params = {}) =>
  apiClient.get('/doc-generation/templates', { params }).then((res) => res.data)

export const fetchTemplate = (id) =>
  apiClient.get(`/doc-generation/templates/${id}`).then((res) => res.data)

export const fetchTemplateVersion = (versionId) =>
  apiClient.get(`/doc-generation/template-versions/${versionId}`).then((res) => res.data)

export const createTemplate = (payload) =>
  apiClient.post('/doc-generation/templates', payload).then((res) => res.data)

export const updateTemplate = (id, payload) =>
  apiClient.patch(`/doc-generation/templates/${id}`, payload).then((res) => res.data)

export const saveTemplateVersion = (id, payload) =>
  apiClient.post(`/doc-generation/templates/${id}/versions`, payload).then((res) => res.data)

export const activateTemplateVersion = (id, versionId) =>
  apiClient.post(`/doc-generation/templates/${id}/versions/${versionId}/activate`).then((res) => res.data)

export const archiveTemplate = (id) =>
  apiClient.post(`/doc-generation/templates/${id}/archive`).then((res) => res.data)

export const previewTemplate = (payload) =>
  apiClient.post('/doc-generation/templates/preview', payload).then((res) => res.data)

// ── Generated documents ──────────────────────────────────────────────────────
export const fetchDocuments = (params = {}) =>
  apiClient.get('/doc-generation/documents', { params }).then((res) => res.data)

export const fetchDocument = (id) =>
  apiClient.get(`/doc-generation/documents/${id}`).then((res) => res.data)

export const fetchDocumentsForRecord = (entityRef, entityId) =>
  apiClient.get(`/doc-generation/documents/for/${entityRef}/${entityId}`).then((res) => res.data)

export const generateDocument = (payload) =>
  apiClient.post('/doc-generation/documents', payload).then((res) => res.data)

export const updateDocumentBody = (id, bodyHtml) =>
  apiClient.patch(`/doc-generation/documents/${id}/body`, { bodyHtml }).then((res) => res.data)

export const approveDocument = (id) =>
  apiClient.post(`/doc-generation/documents/${id}/approve`).then((res) => res.data)

export const publishDocument = (id) =>
  apiClient.post(`/doc-generation/documents/${id}/publish`).then((res) => res.data)

export const unpublishDocument = (id, reason) =>
  apiClient.post(`/doc-generation/documents/${id}/unpublish`, { reason }).then((res) => res.data)

export const voidDocument = (id, reason) =>
  apiClient.post(`/doc-generation/documents/${id}/void`, { reason }).then((res) => res.data)

// The PDF comes back as a blob and is handed to the browser as a download. It
// goes through axios rather than a bare link so the session cookie and the
// audit log entry both happen — a plain <a href> would download it without the
// server ever recording who took a copy.
export const downloadDocumentPdf = async (id, { regenerate = false, filename } = {}) => {
  const response = await apiClient.get(`/doc-generation/documents/${id}/pdf`, {
    params: regenerate ? { regenerate: 'true' } : {},
    responseType: 'blob',
  })

  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename ?? `${id}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on the next tick — revoking synchronously can cancel the download
  // in some browsers before it has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const TEMPLATE_STATUS_TONES = {
  draft: 'neutral',
  active: 'success',
  archived: 'warning',
}

export const DOCUMENT_STATUS_TONES = {
  draft: 'neutral',
  pendingApproval: 'warning',
  approved: 'success',
  void: 'danger',
}
