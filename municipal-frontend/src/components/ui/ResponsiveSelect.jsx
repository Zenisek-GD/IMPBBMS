import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import MobileOptionSheet from './MobileOptionSheet'

// Mobile operating systems own native select popups, so their light palette can
// leak into an otherwise dark application. Keep native selects on desktop for
// familiar keyboard behavior and use the system's themed option sheet on phones.
export default function ResponsiveSelect({
  id,
  title,
  value,
  onChange,
  options,
  desktopClassName = '',
  mobileClassName = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => String(option.value) === String(value)) ?? options[0]

  return (
    <>
      <button
        type="button"
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 text-left text-[13px] font-medium text-navy transition-colors focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50 md:hidden ${mobileClassName}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown size={16} className="shrink-0 text-text-faint" aria-hidden="true" />
      </button>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`hidden md:block ${desktopClassName}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <MobileOptionSheet
        open={open}
        title={title}
        options={options}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
