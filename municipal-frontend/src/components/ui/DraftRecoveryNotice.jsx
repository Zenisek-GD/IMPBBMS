import Button from './Button'

export default function DraftRecoveryNotice({ draft }) {
  if (draft.storageError) return <p role="status" className="text-xs text-warning">{draft.storageError}</p>
  if (draft.pendingDraft) return (
    <div role="status" className="rounded border border-warning/30 bg-warning/10 p-3 text-sm text-navy">
      <p>An unsaved form from {new Date(draft.pendingDraft.savedAt).toLocaleString('en-PH')} is available in this browser.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={draft.restoreDraft}>Restore form</Button>
        <Button size="sm" variant="secondary" onClick={draft.discardDraft}>Discard recovery copy</Button>
      </div>
    </div>
  )
  return draft.lastSavedAt ? <p role="status" className="text-xs text-text-secondary">Recovery copy saved in this browser. Save or submit the form to record this work in the system. Attachments must be uploaded separately.</p> : null
}
