export default function ResolutionNumberInput({ value = '', onChange, className = '', ...props }) {
  const clean = (text) => String(text ?? '').replace(/^(?:\s*Resolution\s+No\.?\s*:?\s*)+/i, '')
  return (
    <span className="mt-1 flex overflow-hidden rounded border border-border-muted bg-surface focus-within:border-navy">
      <span className="shrink-0 border-r border-border-muted bg-sidebar px-3 py-2 text-sm text-text-secondary">Resolution No.</span>
      <input {...props} aria-label={props['aria-label'] ?? 'Resolution number'} value={clean(value)}
        onChange={(event) => onChange?.({ ...event, target: { ...event.target, value: clean(event.target.value) } })}
        placeholder={props.placeholder ?? '2026-001'}
        className={`min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-navy outline-none ${className}`} />
    </span>
  )
}
