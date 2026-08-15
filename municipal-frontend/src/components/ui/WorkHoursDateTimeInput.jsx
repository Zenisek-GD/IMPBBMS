import { useState } from 'react'
import { clampToWorkHours, isWithinWorkHours, WORK_HOURS_LABEL } from '../../utils/workHours'

// ─────────────────────────────────────────────────────────────────────────────
// A datetime-local input that only lets a time of day be set within office
// hours (see utils/workHours.js). A drop-in for the plain
// `<input type="datetime-local" value onChange className />` the forms use.
//
// The clamp happens on the value that leaves the component, so the parent form
// never receives an out-of-hours time even if the browser's own picker offered
// one: pick 3:00 AM and the field records — and shows — 8:00 AM, with a one-line
// note explaining why it moved. The note clears itself the moment a value inside
// the window is entered.
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkHoursDateTimeInput({ value, onChange, className = '', ...rest }) {
  const [adjusted, setAdjusted] = useState(false)

  const handleChange = (event) => {
    const raw = event.target.value
    const outside = !isWithinWorkHours(raw)
    const next = outside ? clampToWorkHours(raw) : raw
    setAdjusted(outside)
    // Hand the parent the corrected value, in the shape it already expects — a
    // synthetic-ish event carrying the clamped string, so controlled forms that
    // read event.target.value keep working unchanged.
    onChange?.({ ...event, target: { ...event.target, value: next } })
  }

  return (
    <div>
      <input
        type="datetime-local"
        value={value}
        onChange={handleChange}
        className={className}
        {...rest}
      />
      <p className={`mt-1 text-[11px] ${adjusted ? 'text-warning' : 'text-text-faint'}`}>
        {adjusted
          ? `Moved into office hours (${WORK_HOURS_LABEL}).`
          : `Office hours only: ${WORK_HOURS_LABEL}.`}
      </p>
    </div>
  )
}
