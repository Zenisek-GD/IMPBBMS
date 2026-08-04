import { useState, useId } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Shared input chrome, exported so selects and textareas elsewhere can match
// the field styling without re-deriving it.
export const fieldClass =
  'w-full rounded-md border border-border-muted bg-surface px-3 py-2 text-[12.5px] text-navy placeholder:text-text-faint transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none disabled:opacity-60'

export const labelClass =
  'mb-1 block text-[11px] font-medium tracking-[0.02em] text-text-secondary'

// Labelled input with inline error state. `type="password"` gets a show/hide
// toggle; the field is linked to its error message via aria-describedby so
// screen readers announce it.
export default function FormField({ label, type = 'text', error, hint, registration, ...props }) {
  const [revealed, setRevealed] = useState(false)
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const isPassword = type === 'password'
  const inputType = isPassword && revealed ? 'text' : type

  return (
    <div>
      {label && (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={inputType}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`${fieldClass} ${isPassword ? 'pr-10' : ''} ${
            error ? 'border-danger focus:border-danger focus:ring-danger/15' : ''
          }`}
          {...registration}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-text-faint transition-colors hover:text-navy"
          >
            {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1 text-[11px] text-text-faint">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
