import { useState } from 'react'
import { CheckCircle2, Flag, Loader2, Send } from 'lucide-react'
import { sendPublicMessage } from '../../api/messages'
import Modal from '../ui/Modal'
import { fieldClass, labelClass } from '../ui/FormField'

const emptyForm = (context) => ({
  subject: context?.label ? `Possible error in published record: ${context.label}` : '',
  body: '',
  senderName: '',
  senderEmail: '',
})

// The public portal deliberately has one correspondence route rather than a
// new report table per screen. This small, contextual entry point makes it
// available where the reader noticed the problem while retaining the existing
// server-side rate limit, validation, routing, and privacy boundary.
export default function ReportIssueButton({ context = null }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => emptyForm(context))
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')

  const close = () => {
    if (sending) return
    setOpen(false)
    setError('')
  }

  const openReport = () => {
    setForm(emptyForm(context))
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
        referenceHint: context?.referenceHint ?? '',
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
        title="Report a possible issue with a published record"
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-warning/40 bg-surface px-2.5 text-[12px] font-medium text-navy transition-colors hover:border-warning hover:bg-warning/10 focus:ring-2 focus:ring-warning/30 focus:outline-none"
      >
        <Flag size={15} aria-hidden="true" />
        <span className="hidden xl:inline">Report issue</span>
        <span className="sr-only xl:hidden">Report an issue with a published record</span>
      </button>

      {open && (
        <Modal
          title="Report something wrong"
          subtitle="Reports are sent to the Internal Auditor for review. This is not a formal procurement protest."
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
                className="rounded-md border border-border-muted bg-surface px-3 py-2 text-sm font-medium text-navy transition-colors hover:border-border-strong"
              >
                Done
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              {context?.referenceHint && (
                <p className="rounded-md border border-border-muted bg-sidebar px-3 py-2 text-xs leading-relaxed text-text-secondary">
                  This report will be linked to: <span className="font-medium text-navy">{context.referenceHint}</span>
                </p>
              )}

              <div>
                <label className={labelClass} htmlFor="report-issue-subject">What looks wrong?</label>
                <input
                  id="report-issue-subject"
                  required
                  maxLength={200}
                  value={form.subject}
                  onChange={set('subject')}
                  placeholder="A short summary of the possible issue"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="report-issue-details">Details</label>
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

              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} disabled={sending} className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-sidebar hover:text-navy disabled:opacity-60">
                  Cancel
                </button>
                <button type="submit" disabled={sending} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60">
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  )
}
