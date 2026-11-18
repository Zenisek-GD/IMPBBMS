import { useId, useRef } from 'react'

// Opt-in only: never used by account forms or fields required for a decision.
// Clearing uses an empty UI value; the API normalizes it to database NULL.
export default function OptionalWorkflowInput({ as: Control = 'input', onChange, value, children, ref: externalRef, ...props }) {
  const hintId = useId()
  const inputRef = useRef(null)
  return <span className="block">
    <Control {...props} ref={element => { inputRef.current = element; if (typeof externalRef === 'function') externalRef(element); else if (externalRef) externalRef.current = element }} {...(value !== undefined ? { value: value ?? '' } : {})} onChange={onChange} aria-describedby={[props['aria-describedby'], hintId].filter(Boolean).join(' ')}>{children}</Control>
    {!props.required && <span id={hintId} className="mt-1 flex items-center gap-2 text-[11px] font-normal text-text-faint">
      <button type="button" disabled={props.disabled || props.readOnly} className="rounded underline underline-offset-2 hover:text-navy focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        onClick={() => { const target = inputRef.current; if (!target) return; target.value = ''; onChange?.({ target, currentTarget: target, type: 'change' }); target.focus() }}>None / N/A</button>
      <span>Leave blank if unavailable</span>
    </span>}
  </span>
}
