import { useState } from 'react'
import { CheckCircle2, Loader2, Send, TriangleAlert } from 'lucide-react'
import { sendPublicMessage } from '../../api/messages'
import Modal from '../ui/Modal'
import { fieldClass, labelClass } from '../ui/FormField'

const emptyForm = (project) => ({
  // The subject identifies the record in the staff inbox. The project itself is
  // never trusted from this value: the API derives all context from projectId.
  subject: `Issue reported for: ${project?.projectTitle ?? 'published project'}`,
  body: '',
  senderName: '',
  senderEmail: '',
})

const ContextItem = ({ label, children }) => (
  <div>
    <dt className="text-[10px] font-semibold tracking-[0.05em] text-text-faint uppercase">{label}</dt>
    <dd className="mt-0.5 break-words text-xs font-medium text-navy">{children}</dd>
  </div>
)

// This deliberately belongs only on a published record page. The browser sends
// the public project id; the API reloads that project and stores the resulting
// context so staff can trust the link in the inbox.
export default function ReportIssueButton({ project }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => emptyForm(project))
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')

  if (!project?.id) return null

  const close = () => {
    if (sending) return
    setOpen(false)
    setError('')
  }

  const openReport = () => {
    setForm(emptyForm(project))
    setSent('')
    setError('')
    setOpen(true)
  }

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSending(true)
    try {
      const result = await sendPublicMessage({
        ...form,
        category: 'dataCorrection',
        projectId: project.id,
        // Project context and the reference hint are derived on the server.
        referenceHint: '',
        website: '',
      })
      setSent(result.message)
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ??
          'Your report could not be sent. Check your connection and try again.'
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openReport}
        title={`Report an issue with ${project.projectTitle}`}
        aria-label={`Report an issue with ${project.projectTitle}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-danger/40 bg-danger/10 text-danger transition-colors hover:border-danger hover:bg-danger/15 focus:ring-2 focus:ring-danger/30 focus:outline-none md:h-9 md:w-9"
      >
        <TriangleAlert size={17} aria-hidden="true" />
      </button>

      {open && (
        <Modal
          title="Report an issue with this project"
          subtitle="This report is linked to the project below and routed to the Internal Auditor. It is not a formal procurement protest."
          onClose={close}
        >
          {sent ? (
            <div role="status" className="flex flex-col items-start gap-3">
              <CheckCircle2 size={24} className="text-success" aria-hidden="true" />
              <p className="text-sm font-semibold text-navy">Report sent</p>
              <p className="text-sm leading-relaxed text-text-secondary">{sent}</p>
              <button
                type="button"
                onClick={close}
                className="min-h-11 rounded-md border border-border-muted bg-surface px-3 py-2 text-sm font-medium text-navy transition-colors hover:border-border-strong"
              >
                Done
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <section aria-labelledby="report-project-context" className="rounded-md border border-border-muted bg-sidebar p-3">
                <h3 id="report-project-context" className="text-xs font-semibold text-navy">Report context</h3>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  These details are attached automatically when you send the report.
                </p>
                <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <ContextItem label="Project">{project.projectTitle}</ContextItem>
                  <ContextItem label="Project ID">#{project.id}</ContextItem>
                  {project.referenceNo && <ContextItem label="Reference">{project.referenceNo}</ContextItem>}
                  <ContextItem label="Current status">{project.category ?? 'Not specified'}</ContextItem>
                  {project.phaseLabel && <ContextItem label="Current phase">{project.phaseLabel}</ContextItem>}
                  {project.implementingUnit && <ContextItem label="Office">{project.implementingUnit}</ContextItem>}
                  <ContextItem label="Page">Public project detail</ContextItem>
                  <ContextItem label="Report time">Recorded by the server when sent</ContextItem>
                </dl>
              </section>

              <div>
                <label className={labelClass} htmlFor="report-issue-details">What should be reviewed?</label>
                <textarea
                  id="report-issue-details"
                  required
                  minLength={20}
                  maxLength={5000}
                  rows={5}
                  value={form.body}
                  onChange={set('body')}
                  placeholder="Describe what the page says, what you believe is incorrect, and any useful source or date."
                  className={`${fieldClass} resize-y`}
                />
                <p className="mt-1 text-xs text-text-faint">At least 20 characters are required so the report can be reviewed.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="report-issue-name">Your name (optional)</label>
                  <input id="report-issue-name" maxLength={190} value={form.senderName} onChange={set('senderName')} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="report-issue-email">Your email (optional)</label>
                  <input id="report-issue-email" type="email" maxLength={190} value={form.senderEmail} onChange={set('senderEmail')} className={fieldClass} />
                </div>
              </div>

              <p className="text-xs leading-relaxed text-text-secondary">
                You may report anonymously. Without an email address, the municipality cannot reply to you.
              </p>

              {error && <p role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={close} disabled={sending} className="min-h-11 w-full rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-sidebar hover:text-navy disabled:opacity-60 sm:w-auto">
                  Cancel
                </button>
                <button type="submit" disabled={sending} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-danger px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto">
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending ? 'Sending...' : 'Send report'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  )
}
