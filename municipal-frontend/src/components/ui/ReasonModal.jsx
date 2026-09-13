import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'

// ── REASON / CONFIRM MODAL ───────────────────────────────────────────────────
// The one confirmation style for difficult-to-reverse or legally significant
// actions: withdrawing, voiding, archiving, returning, removing. Native
// window.prompt / window.confirm are never used — they cannot explain
// consequences, cannot validate, and look different on every browser.
//
// Two shapes:
//   <ReasonModal requireReason ... />  — reason textarea (required) + consequence.
//   <ReasonModal ... />                — consequence + confirm, no reason field.
export default function ReasonModal({
  title,
  consequence,
  reasonLabel = 'Reason',
  reasonPlaceholder = '',
  confirmLabel = 'Confirm',
  danger = false,
  requireReason = true,
  busy = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const trimmed = reason.trim()
    if (requireReason && !trimmed) {
      setError('A reason is required — it becomes part of the record.')
      return
    }
    onConfirm(requireReason ? trimmed : undefined)
  }

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        {consequence && (
          <p className="text-[13.5px] leading-relaxed text-text-secondary">{consequence}</p>
        )}
        {requireReason && (
          <label className="block text-xs font-medium text-text-secondary">
            {reasonLabel} <span className="text-danger">*</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                if (error) setError('')
              }}
              placeholder={reasonPlaceholder}
              className="mt-1.5 w-full resize-y rounded border border-border-muted bg-surface px-3 py-2 text-[13px] text-navy placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={submit}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
