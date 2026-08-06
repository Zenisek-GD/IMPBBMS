import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const WIDTHS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({ title, subtitle, onClose, size = 'md', children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    // Focus moves into the dialog on open, so a keyboard user is not left
    // tabbing through the page behind it.
    panelRef.current?.focus()

    // The page behind a modal must not scroll under it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      // Clicking the backdrop dismisses; clicking inside the panel must not,
      // which is why the check is against the event target itself.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Dialogs were the tightest surface in the system — a 13px title over a
        // 16px gutter, with multi-section forms inside. They now match the cards
        // they open from.
        className={`max-h-[90vh] w-full ${WIDTHS[size]} overflow-y-auto rounded-xl border border-border-muted bg-surface shadow-xl focus:outline-none`}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border-muted bg-surface px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-navy">{title}</h2>
            {subtitle && <p className="mt-1 text-[12.5px] leading-relaxed text-text-faint">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-navy-tint hover:text-navy"
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
