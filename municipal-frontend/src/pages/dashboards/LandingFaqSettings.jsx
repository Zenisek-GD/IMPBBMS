import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, HelpCircle, Plus, Trash2 } from 'lucide-react'
import * as settingsApi from '../../api/settings'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

const inputClass =
  'w-full rounded-md border border-border-muted bg-surface px-3.5 py-2.5 text-[13.5px] text-navy transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none'

const createFaqId = () => {
  if (globalThis.crypto?.randomUUID) return `faq-${globalThis.crypto.randomUUID()}`
  return `faq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const newFaq = () => ({ id: createFaqId(), question: '', answer: '', isPublished: false })

export default function LandingFaqSettings() {
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const loadFaqs = () => {
    setLoading(true)
    setLoadError('')
    settingsApi
      .fetchLandingFaqs()
      .then((result) => setFaqs(Array.isArray(result?.faqs) ? result.faqs : []))
      .catch((error) => {
        const status = error.response?.status
        setLoadError(
          status === 403
            ? 'You do not have permission to manage landing-page FAQs.'
            : 'The FAQ list could not be loaded. Check your connection and try again.'
        )
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    settingsApi
      .fetchLandingFaqs()
      .then((result) => {
        if (!cancelled) setFaqs(Array.isArray(result?.faqs) ? result.faqs : [])
      })
      .catch((error) => {
        if (cancelled) return
        const status = error.response?.status
        setLoadError(
          status === 403
            ? 'You do not have permission to manage landing-page FAQs.'
            : 'The FAQ list could not be loaded. Check your connection and try again.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateFaq = (id, field, value) => {
    setFaqs((current) => current.map((faq) => (faq.id === id ? { ...faq, [field]: value } : faq)))
    setSaved(false)
  }

  const moveFaq = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= faqs.length) return
    setFaqs((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setSaved(false)
  }

  const removeFaq = (id) => {
    setFaqs((current) => current.filter((faq) => faq.id !== id))
    setSaved(false)
  }

  const addFaq = () => {
    setFaqs((current) => [...current, newFaq()])
    setSaved(false)
  }

  const save = async () => {
    setSaveError('')
    setSaved(false)
    setSaving(true)
    try {
      const result = await settingsApi.updateLandingFaqs(faqs)
      setFaqs(result.faqs ?? [])
      setSaved(true)
    } catch (error) {
      setSaveError(error.response?.data?.message ?? 'The FAQ list could not be saved. Please review the entries and try again.')
    } finally {
      setSaving(false)
    }
  }

  const publishedCount = faqs.filter((faq) => faq.isPublished).length
  const atLimit = faqs.length >= 50

  return (
    <Card title="Landing Page FAQs" icon={HelpCircle}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
            Add clear, public answers for residents and suppliers. Only questions marked Published appear on the landing page; draft FAQs stay visible only here. Visitors can scroll the FAQ panel when the published list grows beyond its reading height.
          </p>
          <span className="shrink-0 rounded-full bg-sidebar px-3 py-1 text-[12px] font-medium text-navy">
            {publishedCount} published of {faqs.length}
          </span>
        </div>

        {loadError && (
          <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-3 text-[13px] text-danger">
            <p>{loadError}</p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={loadFaqs}>
              Try again
            </Button>
          </div>
        )}

        {loading && (
          <div className="rounded-md border border-border-muted bg-sidebar px-3.5 py-4 text-[13px] text-text-secondary" role="status">
            Loading landing-page FAQs…
          </div>
        )}

        {!loading && !loadError && (
          <>
            {faqs.length === 0 ? (
              <div className="rounded-md border border-dashed border-border-strong bg-sidebar px-4 py-6 text-center">
                <p className="text-[13px] font-medium text-navy">No landing-page FAQs yet</p>
                <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-text-secondary">
                  Add a question and answer, then publish it when it is ready for the public portal.
                </p>
              </div>
            ) : (
              <div className="max-h-[44rem] space-y-3 overflow-y-auto overscroll-contain pr-1" aria-label="Landing page FAQ editor">
                {faqs.map((faq, index) => {
                  const questionId = `landing-faq-question-${faq.id}`
                  const answerId = `landing-faq-answer-${faq.id}`
                  return (
                    <section key={faq.id} className="rounded-md border border-border-muted bg-surface p-4 sm:p-5" aria-label={`FAQ ${index + 1}`}>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[12px] font-medium text-text-secondary">FAQ {index + 1}</p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="table"
                            variant="ghost"
                            icon={ChevronUp}
                            disabled={index === 0}
                            onClick={() => moveFaq(index, -1)}
                            aria-label={`Move FAQ ${index + 1} earlier`}
                            title="Move earlier"
                          />
                          <Button
                            size="table"
                            variant="ghost"
                            icon={ChevronDown}
                            disabled={index === faqs.length - 1}
                            onClick={() => moveFaq(index, 1)}
                            aria-label={`Move FAQ ${index + 1} later`}
                            title="Move later"
                          />
                          <Button
                            size="table"
                            variant="danger"
                            icon={Trash2}
                            onClick={() => removeFaq(faq.id)}
                            aria-label={`Remove FAQ ${index + 1}`}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4">
                        <div>
                          <label htmlFor={questionId} className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
                            Question
                          </label>
                          <input
                            id={questionId}
                            type="text"
                            value={faq.question}
                            maxLength={280}
                            onChange={(event) => updateFaq(faq.id, 'question', event.target.value)}
                            className={inputClass}
                            placeholder="e.g. Where can I find current bidding opportunities?"
                          />
                        </div>
                        <div>
                          <label htmlFor={answerId} className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">
                            Answer
                          </label>
                          <textarea
                            id={answerId}
                            value={faq.answer}
                            maxLength={4000}
                            rows={4}
                            onChange={(event) => updateFaq(faq.id, 'answer', event.target.value)}
                            className={`${inputClass} resize-y`}
                            placeholder="Write a short, plain-language answer suitable for public viewing."
                          />
                        </div>
                      </div>

                      <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-md bg-sidebar px-3 py-2.5 text-[13px] text-navy">
                        <input
                          type="checkbox"
                          checked={faq.isPublished}
                          onChange={(event) => updateFaq(faq.id, 'isPublished', event.target.checked)}
                          className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/40"
                        />
                        {faq.isPublished ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
                        <span className="font-medium">{faq.isPublished ? 'Published on the landing page' : 'Saved as draft'}</span>
                      </label>
                    </section>
                  )
                })}
              </div>
            )}

            {saveError && (
              <p role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
                {saveError}
              </p>
            )}

            {saved && (
              <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success/10 px-3.5 py-2.5 text-[13px] text-success">
                <CheckCircle2 size={15} aria-hidden="true" /> Landing-page FAQs saved. Published entries are now available on the public portal.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button size="sm" variant="secondary" icon={Plus} onClick={addFaq} disabled={atLimit}>
                {atLimit ? 'FAQ limit reached' : 'Add FAQ'}
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save landing-page FAQs'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
