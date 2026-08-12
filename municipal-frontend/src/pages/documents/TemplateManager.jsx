import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, FileText, Eye, Save, History, Archive, ArrowLeft, AlertTriangle, Braces, Check,
} from 'lucide-react'
import * as api from '../../api/documentGeneration'
import { TEMPLATE_STATUS_TONES } from '../../api/documentGeneration'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import RichTextEditor from '../../components/ui/RichTextEditor'

// Template authoring. The screen is built around one idea: an author should
// never have to remember a placeholder name. The palette on the right lists
// exactly the tokens the chosen document type can resolve, and clicking one
// drops it at the caret.

const inputClass =
  'w-full rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy focus:border-navy focus:outline-none'

function PlaceholderPalette({ groups, onInsert }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        fields: group.fields.filter(
          (field) =>
            field.token.includes(needle) || field.label.toLowerCase().includes(needle)
        ),
      }))
      .filter((group) => group.fields.length > 0)
  }, [groups, query])

  return (
    <div className="flex h-full flex-col">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search fields…"
        className={`${inputClass} mb-2`}
      />
      <p className="mb-2 text-[11px] text-text-faint">
        Click a field to insert it where the cursor is. Only fields this document type can fill are listed.
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="text-xs text-text-faint">No matching fields.</p>}
        {filtered.map((group) => (
          <div key={group.group} className="mb-3">
            <p className="mb-1 text-[10px] font-medium tracking-[0.05em] text-text-secondary uppercase">
              {group.group}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.fields.map((field) => (
                <button
                  key={field.token}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onInsert(`{${field.token}}`)
                  }}
                  className="rounded px-2 py-1 text-left text-[11.5px] text-navy hover:bg-chip"
                  title={field.example ? `e.g. ${field.example}` : field.label}
                >
                  <span className="font-mono text-[10.5px] text-accent">{`{${field.token}}`}</span>
                  <span className="ml-1.5 text-text-secondary">{field.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewModal({ html, onClose }) {
  return (
    <Modal title="Preview" subtitle="Sample values shown in «guillemets»" onClose={onClose} size="xl">
      {/* Rendered in an iframe rather than injected into the page: the document
          carries its own stylesheet, and letting that loose in the app would
          restyle the surrounding UI. srcDoc with a locked-down sandbox means no
          script, and nothing the document does can reach the parent. */}
      <iframe
        title="Document preview"
        srcDoc={html}
        sandbox=""
        className="h-[65vh] w-full rounded border border-border-muted bg-white"
      />
    </Modal>
  )
}

function TemplateEditor({ template, options, onBack, onSaved }) {
  const permissions = usePermissions()
  const canManage = permissions.has('template.manage')
  const version = template.activeVersion ?? {}

  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [bodyHtml, setBodyHtml] = useState(version.bodyHtml ?? '')
  const [headerHtml, setHeaderHtml] = useState(version.headerHtml ?? '')
  const [footerHtml, setFooterHtml] = useState(version.footerHtml ?? '')
  const [css, setCss] = useState(version.css ?? '')
  const [pageSize, setPageSize] = useState(version.pageSize ?? 'A4')
  const [landscape, setLandscape] = useState(Boolean(version.landscape))
  const [changeNote, setChangeNote] = useState('')

  const [preview, setPreview] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const typeMeta = options.documentTypes?.find((t) => t.key === template.documentType)
  const placeholderGroups = typeMeta?.placeholders ?? []

  const insertToken = (token) => {
    const el = document.querySelector('[aria-label="Document body"]')
    el?.__insertAtCaret?.(token)
  }

  const runPreview = async () => {
    setError('')
    try {
      const result = await api.previewTemplate({
        documentType: template.documentType,
        name,
        bodyHtml,
        headerHtml,
        footerHtml,
        css,
      })
      setWarnings(result.unresolvableTokens ?? [])
      setPreview(result.html)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not build the preview.')
    }
  }

  const save = async () => {
    setError('')
    setSaving(true)
    try {
      if (name !== template.name || description !== (template.description ?? '')) {
        await api.updateTemplate(template.id, { name, description })
      }
      const result = await api.saveTemplateVersion(template.id, {
        bodyHtml, headerHtml, footerHtml, css, pageSize, landscape, changeNote,
      })
      setWarnings(result.unresolvableTokens ?? [])
      setChangeNote('')
      setSavedAt(new Date())
      onSaved(result)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not save this version.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardPage>
      <PageHeader
        title={template.name}
        subtitle={`${template.documentTypeLabel} · version ${template.activeVersionNo ?? '—'} active${
          template.isSystemTemplate ? ' · supplied with the system' : ''
        }`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>BACK</Button>
            <Button variant="secondary" icon={History} onClick={() => setShowHistory(true)}>
              HISTORY ({template.versionCount})
            </Button>
            <Button variant="secondary" icon={Eye} onClick={runPreview}>PREVIEW</Button>
            {canManage && (
              <Button icon={Save} onClick={save} disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE NEW VERSION'}
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {savedAt && (
        <p className="flex items-center gap-2 rounded border border-success/20 bg-success/10 px-4 py-2 text-sm text-success">
          <Check size={14} /> Saved as a new version. The previous one is kept — documents generated from it still
          resolve against the wording they were issued with.
        </p>
      )}

      {warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-[13px] text-text-secondary">
            <p className="font-medium text-navy">
              These fields will print literally, because a {template.documentTypeLabel} cannot fill them:
            </p>
            <p className="mt-1 font-mono text-xs">{warnings.map((t) => `{${t}}`).join('  ')}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <Card title="Document body" icon={FileText} bodyClassName="p-3">
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
          </Card>

          <Card title="Page setup, running header and footer" bodyClassName="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-text-secondary">
                Template name
                <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="text-xs text-text-secondary">
                Description
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="text-xs text-text-secondary">
                Page size
                <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className={`mt-1 ${inputClass}`}>
                  {(options.pageSizes ?? ['A4']).map((size) => <option key={size}>{size}</option>)}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-xs text-text-secondary">
                <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />
                Landscape (certificates)
              </label>
            </div>

            <p className="mt-4 mb-1 text-xs text-text-faint">
              The running header and footer print on every page. They accept placeholders, plus
              <span className="font-mono"> class=&quot;pageNumber&quot;</span> and
              <span className="font-mono"> class=&quot;totalPages&quot;</span>.
            </p>
            <label className="mt-2 block text-xs text-text-secondary">
              Running header
              <textarea rows={2} value={headerHtml} onChange={(e) => setHeaderHtml(e.target.value)} className={`mt-1 font-mono text-[11px] ${inputClass}`} />
            </label>
            <label className="mt-2 block text-xs text-text-secondary">
              Running footer
              <textarea rows={2} value={footerHtml} onChange={(e) => setFooterHtml(e.target.value)} className={`mt-1 font-mono text-[11px] ${inputClass}`} />
            </label>
            <label className="mt-2 block text-xs text-text-secondary">
              Additional stylesheet
              <textarea rows={3} value={css} onChange={(e) => setCss(e.target.value)} className={`mt-1 font-mono text-[11px] ${inputClass}`} />
            </label>
            <label className="mt-2 block text-xs text-text-secondary">
              What changed in this version?
              <input
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="e.g. Added the conforme block requested by the Legal Office"
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </Card>
        </div>

        <Card title="Available fields" icon={Braces} bodyClassName="p-3" className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]">
          <PlaceholderPalette groups={placeholderGroups} onInsert={insertToken} />
        </Card>
      </div>

      {preview && <PreviewModal html={preview} onClose={() => setPreview(null)} />}

      {showHistory && (
        <Modal title={`Version history — ${template.name}`} onClose={() => setShowHistory(false)} size="lg">
          <div className="flex flex-col gap-1">
            {template.versions.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center gap-3 border-t border-border-muted py-2 text-[13px] first:border-t-0"
              >
                <span className="font-mono text-xs text-navy">v{v.versionNo}</span>
                {v.isActive && <Badge tone="success">ACTIVE</Badge>}
                <span className="flex-1 text-text-secondary">{v.changeNote ?? '—'}</span>
                <span className="text-[11px] text-text-faint">
                  {new Date(v.createdAt).toLocaleString('en-PH')} · {v.createdByName ?? '—'}
                </span>
                {!v.isActive && canManage && (
                  <button
                    type="button"
                    onClick={async () => {
                      const updated = await api.activateTemplateVersion(template.id, v.id)
                      onSaved(updated)
                      setShowHistory(false)
                    }}
                    className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                  >
                    REVERT TO THIS
                  </button>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}

function NewTemplateModal({ options, onClose, onCreated }) {
  const [documentType, setDocumentType] = useState(options.documentTypes?.[0]?.key ?? 'other')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const meta = options.documentTypes?.find((t) => t.key === documentType)

  return (
    <Modal title="New document template" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs text-text-secondary">
          Document type
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={`mt-1 ${inputClass}`}>
            {(options.documentTypes ?? []).map((type) => (
              <option key={type.key} value={type.key}>{type.label}</option>
            ))}
          </select>
        </label>
        {meta && (
          <p className="rounded border border-border-muted bg-chip/40 px-3 py-2 text-xs text-text-secondary">
            {meta.description}
            {meta.entityLabel && <> Generated from a <strong>{meta.entityLabel}</strong> record.</>}
            {meta.publishable && <> May be published to the transparency portal.</>}
          </p>
        )}
        <label className="text-xs text-text-secondary">
          Template name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>CANCEL</Button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={async () => {
              setError('')
              try {
                const created = await api.createTemplate({
                  name,
                  documentType,
                  bodyHtml: '<p>Start writing the document here.</p>',
                  changeNote: 'Initial version',
                })
                onCreated(created)
              } catch (err) {
                setError(err.response?.data?.message ?? 'Could not create the template.')
              }
            }}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            CREATE
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function TemplateManager() {
  const permissions = usePermissions()
  const [templates, setTemplates] = useState([])
  const [options, setOptions] = useState({})
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState('')

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.fetchTemplates(), api.fetchTemplateOptions()])
      .then(([templateRows, optionRows]) => {
        if (cancelled) return
        setTemplates(templateRows)
        setOptions(optionRows)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshToken])

  const openTemplate = async (id) => {
    setError('')
    try {
      setEditing(await api.fetchTemplate(id))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not open that template.')
    }
  }

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        options={options}
        onBack={() => { setEditing(null); refresh() }}
        onSaved={(updated) => setEditing(updated)}
      />
    )
  }

  const canManage = permissions.has('template.manage')

  return (
    <DashboardPage>
      <PageHeader
        title="Document Templates"
        subtitle="The wording of every official document the office issues. Editing a template saves a new version; the old one is kept so documents already issued stay explicable."
        actions={canManage && <Button icon={Plus} onClick={() => setCreating(true)}>NEW TEMPLATE</Button>}
      />

      {error && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <Card title="Templates" icon={FileText} bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">No templates yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Template', 'Type', 'Version', 'Status', 'Actions'].map((head) => (
                    <th key={head} className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-t border-border-muted">
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-navy">{template.name}</p>
                      {template.description && (
                        <p className="mt-0.5 text-[11.5px] text-text-faint">{template.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">
                      {template.documentTypeLabel}
                      {template.publishable && <span className="ml-2"><Badge tone="info">PUBLISHABLE</Badge></span>}
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      v{template.activeVersionNo ?? '—'}
                      <span className="ml-1 text-[11px] text-text-faint">of {template.versionCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TEMPLATE_STATUS_TONES[template.status]}>{template.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => openTemplate(template.id)}
                          className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                        >
                          {canManage ? 'EDIT' : 'VIEW'}
                        </button>
                        {canManage && template.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`Archive "${template.name}"? It can no longer be generated from.`)) return
                              await api.archiveTemplate(template.id)
                              refresh()
                            }}
                            className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                          >
                            <Archive size={11} /> ARCHIVE
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <NewTemplateModal
          options={options}
          onClose={() => setCreating(false)}
          onCreated={(created) => { setCreating(false); setEditing(created) }}
        />
      )}
    </DashboardPage>
  )
}
