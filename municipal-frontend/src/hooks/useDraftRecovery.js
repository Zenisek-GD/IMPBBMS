import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'

// Local recovery is intentionally scoped to the signed-in account and browser.
// It protects against an accidental close, reload, or brief offline period, but
// it does not claim that an unsaved draft has reached the municipal record.
const PREFIX = 'procurenance.form-draft.v1'
const MAX_BYTES = 250_000

export default function useDraftRecovery({ key, value, onRestore }) {
  const { user } = useAuth()
  const [pendingDraft, setPendingDraft] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const ready = useRef(false)
  const restoreHandler = useRef(onRestore)
  const storageKey = `${PREFIX}.${user?.id ?? 'anonymous'}.${key}`
  const serialized = JSON.stringify(value)

  useEffect(() => { restoreHandler.current = onRestore }, [onRestore])

  useEffect(() => {
    ready.current = false
    // Queue these state updates after the storage read. React's effect rule
    // correctly rejects synchronous effect-to-render cascades here.
    queueMicrotask(() => {
      setPendingDraft(null)
      setLastSavedAt(null)
    })
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        ready.current = true
        return
      }
      const parsed = JSON.parse(raw)
      if (!parsed?.value || !Number.isFinite(parsed.savedAt)) {
        window.localStorage.removeItem(storageKey)
        ready.current = true
        return
      }
      queueMicrotask(() => setPendingDraft(parsed))
    } catch {
      // Storage can be unavailable in private browsing. The workflow remains
      // usable; only this convenience recovery is unavailable.
      ready.current = true
    }
  }, [storageKey])

  useEffect(() => {
    if (!ready.current) return undefined
    const save = () => {
      try {
        if (serialized.length > MAX_BYTES) return
        const savedAt = Date.now()
        window.localStorage.setItem(storageKey, JSON.stringify({ savedAt, value: JSON.parse(serialized) }))
        setLastSavedAt(savedAt)
      } catch {
        // Do not turn a storage quota failure into a form failure.
      }
    }
    const timer = window.setTimeout(save, 500)
    window.addEventListener('beforeunload', save)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeunload', save)
    }
  }, [serialized, storageKey])

  const restoreDraft = () => {
    if (!pendingDraft) return
    restoreHandler.current?.(pendingDraft.value)
    setLastSavedAt(pendingDraft.savedAt)
    setPendingDraft(null)
    ready.current = true
  }

  const discardDraft = () => {
    try { window.localStorage.removeItem(storageKey) } catch { /* unavailable */ }
    setPendingDraft(null)
    ready.current = true
  }

  const clearDraft = () => {
    try { window.localStorage.removeItem(storageKey) } catch { /* unavailable */ }
    setPendingDraft(null)
    setLastSavedAt(null)
  }

  return { pendingDraft, lastSavedAt, restoreDraft, discardDraft, clearDraft }
}
