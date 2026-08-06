import { useState } from 'react'
import { Send, CheckCircle2, ShieldQuestion, Loader2 } from 'lucide-react'
import { MESSAGE_CATEGORIES, sendPublicMessage } from '../../api/messages'

// ── WRITING TO THE MUNICIPALITY ──────────────────────────────────────────────
// The counterpart to publishing. Everything else on this portal is the
// municipality talking to the citizen; this is the one direction that runs the
// other way.
//
// Two decisions worth stating, because both look like oversights otherwise:
//
//   · Name and email are optional. Someone reporting that a contract does not
//     match what was built may have good reason not to identify themselves, and
//     requiring a name filters out exactly the reports most worth having. The
//     form says plainly what the cost is — nobody can reply.
//
//   · The subject category is shown with its destination attached. A contact
//     form that quietly decides where your message goes is a form people stop
//     trusting; saying "this goes to the Municipal Mayor" before they send is
//     the difference between routing and disappearing.

const inputClass =
  'w-full rounded-md border border-border-muted bg-surface px-3.5 py-2.5 text-[13.5px] text-navy transition-colors placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none'

const Field = ({ label, hint, children }) => (
  <div>
    <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">{label}</label>
    {children}
    {hint && <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">{hint}</p>}
  </div>
)

export default function ContactPanel() {
  const [form, setForm] = useState({
    category: 'projectEnquiry',
    subject: '',
    body: '',
    senderName: '',
    senderEmail: '',
    referenceHint: '',
    website: '', // honeypot — see the controller
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  const [error, setError] = useState('')

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  const chosen = MESSAGE_CATEGORIES.find((c) => c.key === form.category)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSending(true)
    try {
      const result = await sendPublicMessage(form)
      setSent(result.message)
    } catch (err) {
      setError(
        err.response?.data?.message ??
          'Your message could not be sent. Please try again in a moment.'
      )
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-8 flex flex-col items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-6">
        <CheckCircle2 size={24} className="text-success" />
        <p className="text-[15px] font-semibold text-navy">Message sent</p>
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-text-secondary">{sent}</p>
        <button
          type="button"
          onClick={() => {
            setSent(null)
            setForm({ ...form, subject: '', body: '', referenceHint: '' })
          }}
          className="mt-1 rounded-full border border-border-strong px-4 py-2 text-[13px] font-medium text-navy transition-colors hover:bg-surface"
        >
          Send another
        </button>
      </div>
    )
  }

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <form onSubmit={submit} className="rounded-xl border border-border-muted bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-5">
          <Field label="What is this about?" hint={chosen?.hint}>
            <select value={form.category} onChange={set('category')} className={inputClass}>
              {MESSAGE_CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subject">
            <input
              type="text"
              value={form.subject}
              onChange={set('subject')}
              maxLength={200}
              required
              placeholder="A short summary"
              className={inputClass}
            />
          </Field>

          <Field
            label="Project or reference number (optional)"
            hint="If your message is about a particular project, copy its reference from the page you were reading."
          >
            <input
              type="text"
              value={form.referenceHint}
              onChange={set('referenceHint')}
              maxLength={190}
              placeholder="e.g. ITB-2026-004"
              className={inputClass}
            />
          </Field>

          <Field label="Your message">
            <textarea
              rows={6}
              value={form.body}
              onChange={set('body')}
              maxLength={5000}
              required
              placeholder="Please be specific. If something looks wrong, say what you expected and what you saw."
              className={`${inputClass} resize-y`}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name (optional)">
              <input
                type="text"
                value={form.senderName}
                onChange={set('senderName')}
                maxLength={190}
                className={inputClass}
              />
            </Field>
            <Field label="Your email (optional)">
              <input
                type="email"
                value={form.senderEmail}
                onChange={set('senderEmail')}
                maxLength={190}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Hidden from people, offered to bots. Not `display:none` on the
              input alone — some scrapers skip those — so the whole wrapper is
              taken out of the layout and out of the tab order. */}
          <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] opacity-0">
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] leading-relaxed text-text-faint">
              Leaving your email is optional. Without one there is no way to reply to you.
            </p>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </div>
      </form>

      <aside className="flex flex-col gap-4">
        <section className="rounded-xl border border-border-muted bg-surface p-5 shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
            <ShieldQuestion size={17} />
          </span>
          <h3 className="mt-3.5 text-[15px] font-semibold text-navy">Where your message goes</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-secondary">
            Messages are routed by subject to the office responsible for it, and appear in that
            officer&rsquo;s queue inside the system. They are not published on this site.
          </p>
        </section>

        <section className="rounded-xl border border-border-muted bg-surface p-5 shadow-sm">
          <h3 className="text-[15px] font-semibold text-navy">This is not a formal protest</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-secondary">
            A bidder challenging a decision of the Bids and Awards Committee must file a request for
            reconsideration, and then a protest, under RA 12009 Sec. 83–85 — with the prescribed fee
            and sworn certifications. That is done through your bidder account, not here.
          </p>
        </section>
      </aside>
    </div>
  )
}
