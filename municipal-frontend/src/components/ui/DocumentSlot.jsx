import { useRef, useState } from 'react'
import { Upload, Check, Download, Trash2, Loader2 } from 'lucide-react'
import * as documentsApi from '../../api/documents'
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_MB, formatBytes } from '../../api/documents'

// One required document: upload, replace, download, or remove. `existing` is
// the stored Document record for this slot, or null if nothing is attached.
export default function DocumentSlot({
  entityRef,
  entityId,
  docType,
  label,
  existing,
  disabled,
  onChanged,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const handleFile = async (file) => {
    if (!file) return
    setError('')

    // Check the size here too so an oversize file fails instantly rather than
    // after uploading megabytes only to be rejected.
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`That file is larger than the ${MAX_UPLOAD_MB} MB limit.`)
      return
    }

    setBusy(true)
    setProgress(0)
    try {
      await documentsApi.uploadDocument({
        file,
        entityRef,
        entityId,
        docType,
        label,
        onProgress: setProgress,
      })
      onChanged?.()
    } catch (err) {
      setError(err.response?.data?.message ?? 'The upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        disabled={disabled || busy}
        onChange={(event) => handleFile(event.target.files?.[0])}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-2">
        {existing ? (
          <>
            <button
              type="button"
              onClick={() => documentsApi.downloadDocument(existing.id, existing.filename)}
              className="flex items-center gap-2 rounded-sm bg-success/10 px-3 py-2 text-[11px] font-medium tracking-[0.03em] text-success"
            >
              <Check size={12} /> {existing.filename}
              <span className="opacity-70">({formatBytes(existing.sizeBytes)})</span>
              <Download size={12} />
            </button>

            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                >
                  REPLACE
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true)
                    await documentsApi.deleteDocument(existing.id).catch(() => {})
                    setBusy(false)
                    onChanged?.()
                  }}
                  aria-label="Remove document"
                  className="text-text-faint hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="flex items-center gap-2 rounded-sm bg-accent px-3 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {busy ? `UPLOADING ${progress}%` : 'UPLOAD'}
          </button>
        )}
      </div>

      {existing && (
        <p className="font-mono text-[10px] break-all text-text-faint">
          sha256 {existing.checksum.slice(0, 32)}…
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
