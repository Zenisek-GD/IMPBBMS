import { useCallback, useEffect, useState } from 'react'
import {
  Plus, FileCheck2, Download, Eye, Globe, Ban, Check, Pencil, AlertTriangle, RefreshCw,
} from 'lucide-react'
import * as api from '../../api/documentGeneration'
import { DOCUMENT_STATUS_TONES } from '../../api/documentGeneration'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import RichTextEditor from '../../components/ui/RichTextEditor'

// The issuing workspace. A document moves draft → approved → (published), and
// each step is a different permission held by a different office, so most of
// this screen is about showing an officer only the one action that is theirs.

const inputClass =
  'w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'

// The body is stored as a full HTML document. Editing needs only what is
// between the body tags, and re-wrapping is the server's job.
const extractBody = (html) => {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html ?? '')
  return match ? match[1] : (html ?? '')
}

function GenerateModal({ templates, options, onClose, onGenerated }) {
  const [templateId, setTemplateId] = useState('')
  const [entityId, setEntityId] = useState('')
  const [manualValues, setManualValues] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const template = templates.find((t) => String(t.id) === String(templateId))
  const meta = options.documentTypes?.find((t) => t.key === template?.documentType)
  const needsEntity = Boolean(meta?.entityRef && meta.entityRef !== 'any')

  return (
    <Modal title="Generate a document" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs text-text-secondary">
          Template
          <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setManualValues({}) }} className={`mt-1 ${inputClass}`}>
            <option value="">Choose a template…</option>
            {templates.filter((t) => t.status === 'active').map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {t.documentTypeLabel}</option>
            ))}
          </select>
        </label>

        {needsEntity && (
          <label className="text-xs text-text-secondary">
            {meta.entityLabel} record ID
            <input
              type="number"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder={`Which ${meta.entityLabel.toLowerCase()} is this document for?`}
              className={`mt-1 ${inputClass}`}
            />
            <span className="mt-1 block text-[11px] text-text-faint">
              Every other field on the document is filled from this record — nothing else needs typing.
            </span>
          </label>
        )}

        {(meta?.manualFields ?? []).map((field) => (
          <label key={field.key} className="text-xs text-text-secondary">
            {field.label}{field.required && <span className="text-danger"> *</span>}
            <input
              type={field.type === 'date' ? 'date' : 'text'}
              value={manualValues[field.key] ?? ''}
              onChange={(e) => setManualValues((v) => ({ ...v, [field.key]: e.target.value }))}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        ))}

        {error && <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>CANCEL</Button>
          <button
            type="button"
            disabled={!templateId || busy || (needsEntity && !entityId)}
            onClick={async () => {
              setError('')
              setBusy(true)
              try {
                const created = await api.generateDocument({
                  templateId: Number(templateId),
                  entityId: entityId ? Number(entityId) : undefined,
                  manualValues,
                })
                onGenerated(created)
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not generate that document.')
              } finally {
                setBusy(false)
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {busy ? 'GENERATING…' : 'GENERATE'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DocumentViewer({ doc, onClose, onChanged }) {
  const permissions = usePermissions()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(extractBody(doc.renderedHtml))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const act = async (fn) => {
    setError('')
    setBusy(true)
    try {
      const updated = await fn()
      onChanged(updated)
    } catch (err) {
      setError(err.response?.data?.message ?? 'That action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const canEdit = doc.status === 'draft' && permissions.has('document.generate')

  return (
    <Modal
      title={`${doc.documentNo} — ${doc.documentTypeLabel}`}
      subtitle={doc.title}
      onClose={onClose}
      size="xl"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={DOCUMENT_STATUS_TONES[doc.status]}>{doc.statusLabel}</Badge>
          {doc.isPublic && <Badge tone="info">PUBLISHED</Badge>}
          {doc.manuallyEdited && <Badge tone="warning">EDITED BY HAND</Badge>}
          <span className="text-[11px] text-text-faint">
            Generated by {doc.generatedByName ?? '—'} · template v{doc.templateVersionNo ?? '—'}
            {doc.approvedByName && ` · approved by ${doc.approvedByName}`}
            {doc.printCount > 0 && ` · printed ${doc.printCount}×`}
          </span>
        </div>

        {doc.voidReason && (
          <p className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
            Voided: {doc.voidReason}
          </p>
        )}

        {error && <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        {editing ? (
          <>
            <p className="flex items-start gap-2 text-xs text-text-faint">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              You are editing the merged document, not the template. This changes this one document only, and the
              change is recorded.
            </p>
            <RichTextEditor value={body} onChange={setBody} minHeight="45vh" />
          </>
        ) : (
          <iframe
            title="Document"
            srcDoc={doc.renderedHtml}
            sandbox=""
            className="h-[55vh] w-full rounded border border-border-muted bg-white"
          />
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => { setEditing(false); setBody(extractBody(doc.renderedHtml)) }}>
                DISCARD
              </Button>
              <Button icon={Check} disabled={busy} onClick={() => act(async () => {
                const updated = await api.updateDocumentBody(doc.id, body)
                setEditing(false)
                return updated
              })}>
                SAVE CHANGES
              </Button>
            </>
          ) : (
            <>
              {canEdit && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>EDIT</Button>}

              <Button variant="secondary" icon={Download} disabled={busy} onClick={async () => {
                setError('')
                try {
                  await api.downloadDocumentPdf(doc.id, { filename: `${doc.documentNo}.pdf` })
                } catch {
                  setError('Could not produce the PDF. If this persists, Chrome may not be installed on the server.')
                }
              }}>
                DOWNLOAD PDF
              </Button>

              {doc.hasPdf && (
                <Button variant="secondary" icon={RefreshCw} disabled={busy} onClick={async () => {
                  await api.downloadDocumentPdf(doc.id, { regenerate: true, filename: `${doc.documentNo}.pdf` })
                }}>
                  REPRINT
                </Button>
              )}

              {doc.status === 'draft' && permissions.has('document.approve') && (
                <Button icon={Check} disabled={busy} onClick={() => act(() => api.approveDocument(doc.id))}>
                  APPROVE &amp; ISSUE
                </Button>
              )}

              {doc.status === 'approved' && doc.publishable && !doc.isPublic && permissions.has('document.publish') && (
                <Button icon={Globe} disabled={busy} onClick={() => act(() => api.publishDocument(doc.id))}>
                  PUBLISH
                </Button>
              )}

              {doc.isPublic && permissions.has('document.publish') && (
                <Button variant="secondary" icon={Globe} disabled={busy} onClick={() => {
                  const reason = window.prompt('Why is this being withdrawn from the public portal?')
                  if (reason?.trim()) act(() => api.unpublishDocument(doc.id, reason))
                }}>
                  WITHDRAW
                </Button>
              )}

              {doc.status !== 'void' && permissions.has('document.void') && (
                <Button variant="secondary" icon={Ban} disabled={busy} onClick={() => {
                  const reason = window.prompt('Why is this document being voided?')
                  if (reason?.trim()) act(() => api.voidDocument(doc.id, reason))
                }}>
                  VOID
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default function GeneratedDocuments() {
  const permissions = usePermissions()
  const [documents, setDocuments] = useState([])
  const [templates, setTemplates] = useState([])
  const [options, setOptions] = useState({})
  const [statusFilter, setStatusFilter] = useState('')
  const [viewing, setViewing] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.fetchDocuments(statusFilter ? { status: statusFilter } : {}),
      api.fetchTemplates(),
      api.fetchTemplateOptions(),
    ])
      .then(([docs, templateRows, optionRows]) => {
        if (cancelled) return
        setDocuments(docs)
        setTemplates(templateRows)
        setOptions(optionRows)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [statusFilter, refreshToken])

  return (
    <DashboardPage>
      <PageHeader
        title="Official Documents"
        subtitle="Generated from procurement records, so the facts on the page are the ones already on file. Approval and publication are separate acts by separate offices."
        actions={
          permissions.has('document.generate') && (
            <Button icon={Plus} onClick={() => setGenerating(true)}>GENERATE</Button>
          )
        }
      />

      {notice && (
        <p className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-secondary">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
          {notice}
        </p>
      )}

      <Card bodyClassName="p-4">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved and issued</option>
          <option value="void">Void</option>
        </select>
      </Card>

      <Card title="Documents issued" icon={FileCheck2} bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading documents…</p>
        ) : documents.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            No documents generated yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Number', 'Document', 'Source', 'Status', 'Actions'].map((head) => (
                    <th key={head} className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">{doc.documentNo}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-navy">{doc.documentTypeLabel}</p>
                      <p className="mt-0.5 text-[11.5px] text-text-faint">{doc.title}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">
                      {doc.entityRef === 'none' ? '—' : `${doc.entityRef} #${doc.entityId}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={DOCUMENT_STATUS_TONES[doc.status]}>{doc.statusLabel}</Badge>
                        {doc.isPublic && <Badge tone="info">PUBLIC</Badge>}
                        {doc.manuallyEdited && <Badge tone="warning">EDITED</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={async () => setViewing(await api.fetchDocument(doc.id))}
                          className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                        >
                          <Eye size={11} /> OPEN
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setNotice('')
                            try {
                              await api.downloadDocumentPdf(doc.id, { filename: `${doc.documentNo}.pdf` })
                            } catch {
                              setNotice('Could not produce the PDF. Chrome may not be installed on the server — see CHROME_PATH in the backend .env.')
                            }
                          }}
                          className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                        >
                          <Download size={11} /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {generating && (
        <GenerateModal
          templates={templates}
          options={options}
          onClose={() => setGenerating(false)}
          onGenerated={(created) => { setGenerating(false); setViewing(created); refresh() }}
        />
      )}

      {viewing && (
        <DocumentViewer
          doc={viewing}
          onClose={() => { setViewing(null); refresh() }}
          onChanged={(updated) => { setViewing({ ...viewing, ...updated }); refresh() }}
        />
      )}
    </DashboardPage>
  )
}
