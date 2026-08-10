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
        // ── The panel must never grow taller than the screen ──────────────────
        // `overflow-hidden` alone (with no height cap) let a long form grow
        // past the viewport and simply clip: the backdrop centres the panel, so
        // the overflow spilled equally off the top and bottom and there was no
        // way to reach it. Any modal taller than the screen was unusable.
        //
        // The cap subtracts the backdrop's own `p-4` (1rem each side). `dvh`
        // rather than `vh` because mobile browser chrome makes `100vh` taller
        // than what is actually visible.
        //
        // Scrolling belongs to the body below, not this element, so the header
        // stays pinned while the form moves under it.
        className={`flex max-h-[calc(100dvh-2rem)] w-full ${WIDTHS[size]} flex-col overflow-hidden rounded-xl border border-border-muted bg-surface shadow-xl focus:outline-none`}
      >
        {/* `shrink-0` rather than `sticky top-0`: the scroll container is the
            body below, not this panel, so the header is already pinned by the
            flex layout and has nothing to stick to. */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-muted px-5 py-4">
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
        {/* `min-h-0` is load-bearing: a flex child defaults to
            `min-height: auto`, which refuses to shrink below its content, so
            `overflow-y-auto` would never engage and the clipping would come
            straight back. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
