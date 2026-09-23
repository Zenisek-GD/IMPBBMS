import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'

// Native select popups are rendered by Android/iOS, outside the document's CSS.
// This sheet is for mobile, public-facing filters so dark mode, type, focus and
// tap targets stay part of the system rather than reverting to a bright chooser.
export default function MobileOptionSheet({ open, title, options, value, onChange, onClose }) {
  const firstOptionRef = useRef(null)
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const controls = [...(panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      ) ?? [])].filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (!first) {
        event.preventDefault()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => firstOptionRef.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end bg-black/60 p-3 md:hidden" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${title}`}
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full overflow-hidden rounded-xl border border-border-strong bg-surface shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border-muted px-4 py-3.5">
          <h2 className="text-[15px] font-semibold text-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close options"
            className="flex h-11 w-11 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-sidebar hover:text-navy"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div role="listbox" aria-label={title} className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain p-2">
          {options.map((option, index) => {
            const selected = String(option.value) === String(value)
            return (
              <button
                ref={index === 0 ? firstOptionRef : undefined}
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value)
                  onClose()
                }}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3.5 py-3 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
                  selected ? 'bg-chip text-navy' : 'text-text-secondary hover:bg-sidebar hover:text-navy'
                }`}
              >
                <span className="min-w-0 flex-1 break-words">{option.label}</span>
                {selected && <Check size={17} className="shrink-0 text-accent" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </section>
    </div>,
    document.body
  )
}
