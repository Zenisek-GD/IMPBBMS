import { useEffect, useId, useRef } from 'react'

// Six-box entry for the one-time codes the backend emails.
//
// A single text input would work, but codes are read off a phone one digit at a
// time and typed with the eyes elsewhere — the boxes give a place to look that
// confirms progress without reading back the whole value. Paste is handled
// explicitly because most people paste the code rather than type it.
const LENGTH = 6

export default function OtpInput({ value, onChange, onComplete, disabled, error, autoFocus = true }) {
  const inputs = useRef([])
  const id = useId()
  const errorId = `${id}-error`

  // Split from the controlled value so the parent owns the code and this stays a
  // presentation component.
  const digits = Array.from({ length: LENGTH }, (_, index) => value[index] ?? '')

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus()
  }, [autoFocus])

  const commit = (next) => {
    onChange(next)
    if (next.length === LENGTH) onComplete?.(next)
  }

  const setDigit = (index, digit) => {
    const next = digits.slice()
    next[index] = digit
    // Trailing blanks are dropped so `value.length` is a usable measure of how
    // much has been entered.
    commit(next.join('').replace(/\s/g, ''))
  }

  const handleChange = (index) => (event) => {
    const typed = event.target.value.replace(/\D/g, '')
    if (!typed) return setDigit(index, '')

    // Typing over a filled box, or pasting into one, spills forward rather than
    // being truncated to one character.
    if (typed.length > 1) {
      const spill = (value.slice(0, index) + typed).slice(0, LENGTH)
      commit(spill)
      inputs.current[Math.min(spill.length, LENGTH - 1)]?.focus()
      return
    }

    setDigit(index, typed)
    if (index < LENGTH - 1) inputs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index) => (event) => {
    if (event.key === 'Backspace') {
      // Backspace on an empty box steps back and clears the previous one, which
      // is what people expect when correcting a mistyped digit.
      if (!digits[index] && index > 0) {
        event.preventDefault()
        setDigit(index - 1, '')
        inputs.current[index - 1]?.focus()
      }
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      event.preventDefault()
      inputs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH)
    if (!pasted) return
    event.preventDefault()
    commit(pasted)
    inputs.current[Math.min(pasted.length, LENGTH - 1)]?.focus()
  }

  return (
    <div>
      <div className="flex gap-2" onPaste={handlePaste}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element
            }}
            // `inputMode` rather than `type="number"`: a numeric keypad on mobile
            // without the spinner arrows and scroll-wheel behaviour of a number
            // field.
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={LENGTH}
            value={digit}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={handleChange(index)}
            onKeyDown={handleKeyDown(index)}
            onFocus={(event) => event.target.select()}
            className={`h-12 w-full min-w-0 rounded-md border bg-surface text-center font-mono text-[19px] text-navy transition-colors focus:ring-2 focus:outline-none disabled:opacity-60 ${
              error
                ? 'border-danger focus:border-danger focus:ring-danger/15'
                : 'border-border-muted focus:border-accent focus:ring-accent/15'
            }`}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-[11.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
