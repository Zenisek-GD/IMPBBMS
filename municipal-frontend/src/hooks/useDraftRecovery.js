import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'

const PREFIX = 'procurenance.form-draft.v1'
const MAX_BYTES = 250_000
const MAX_AGE = 7 * 86400000

// Recovery remains local to this account and browser. It never submits a record
// or persists attachments/passwords. Consumers pass only their ordinary fields.
export default function useDraftRecovery({ key, value, onRestore, enabled = true, dirty = true }) {
  const { user } = useAuth()
  const [pendingDraft, setPendingDraft] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [storageError, setStorageError] = useState('')
  const [decision, setDecision] = useState(0)
  const ready = useRef(false)
  const clearedValue = useRef(null)
  const restoreHandler = useRef(onRestore)
  const activeSave = useRef(null)
  const storageKey = user?.id && enabled ? `${PREFIX}.${user.id}.${key}` : null
  const serialized = JSON.stringify(value)

  useEffect(() => { restoreHandler.current = onRestore }, [onRestore])
  useEffect(() => {
    ready.current = false
    clearedValue.current = null
    let cancelled = false
    const update = (draft) => queueMicrotask(() => {
      if (cancelled) return
      setPendingDraft(draft)
      setLastSavedAt(null)
      setStorageError('')
    })
    update(null)
    if (!storageKey) return undefined
    try {
      const raw = window.localStorage.getItem(storageKey)
      const parsed = raw ? JSON.parse(raw) : null
      if (parsed && parsed.value != null && Number.isFinite(parsed.savedAt) && Date.now() - parsed.savedAt < MAX_AGE) {
        update(parsed)
      } else {
        if (raw) window.localStorage.removeItem(storageKey)
        ready.current = true
      }
    } catch {
      ready.current = true
      queueMicrotask(() => { if (!cancelled) setStorageError('Browser recovery is unavailable. Save your draft in the system before leaving.') })
    }
    return () => { cancelled = true }
  }, [storageKey])

  useEffect(() => {
    const save = () => {
      if (!storageKey || !ready.current || !dirty || clearedValue.current === serialized) return
      try {
        if (serialized.length > MAX_BYTES) throw new Error('Draft too large')
        const savedAt = Date.now()
        window.localStorage.setItem(storageKey, JSON.stringify({ savedAt, value: JSON.parse(serialized) }))
        setLastSavedAt(savedAt)
        setStorageError('')
      } catch { setStorageError('Browser recovery is unavailable. Save your draft in the system before leaving.') }
    }
    activeSave.current = save
    const timer = window.setTimeout(save, 500)
    return () => { window.clearTimeout(timer) }
  }, [serialized, storageKey, dirty, decision])

  useEffect(() => {
    const flush = () => activeSave.current?.()
    window.addEventListener('auth:before-clear', flush)
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      window.removeEventListener('auth:before-clear', flush)
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const restoreDraft = () => {
    if (!pendingDraft) return
    restoreHandler.current?.(pendingDraft.value)
    setLastSavedAt(pendingDraft.savedAt)
    setPendingDraft(null)
    ready.current = true
    setDecision((value) => value + 1)
  }
  const discardDraft = () => {
    try { if (storageKey) window.localStorage.removeItem(storageKey) } catch { /* unavailable */ }
    setPendingDraft(null)
    setLastSavedAt(null)
    clearedValue.current = serialized
    ready.current = true
    setDecision((value) => value + 1)
  }
  const clearDraft = () => {
    // Suppress pending timers and unmount flush after a successful server save.
    clearedValue.current = serialized
    try { if (storageKey) window.localStorage.removeItem(storageKey) } catch { /* unavailable */ }
    setPendingDraft(null)
    setLastSavedAt(null)
  }
  return { pendingDraft, lastSavedAt, storageError, restoreDraft, discardDraft, clearDraft }
}
