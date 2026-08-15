// ─────────────────────────────────────────────────────────────────────────────
// Office-hours window for every time the system lets an officer set.
//
// A procurement act — a bid opening, a pre-bid conference, a submission
// deadline — is a thing that happens at a government office during the hours it
// is open. Letting a picker record 3:00 AM was never meaningful; a deadline or
// a conference outside office hours is either a typo or a value nobody could act
// on. So every time-of-day the system captures is constrained to this window.
//
// Native <input type="datetime-local"> cannot express "8am–5pm on whatever day":
// its min/max are absolute instants, not a daily window. So the rule lives here
// and is enforced in JS, wrapped by components/ui/WorkHoursDateTimeInput.jsx.
// ─────────────────────────────────────────────────────────────────────────────

// 8:00 AM to 5:00 PM, inclusive of both ends.
export const WORK_START_HOUR = 8
export const WORK_END_HOUR = 17

// Rendered in hints and messages. Deliberately 12-hour: the rest of the system
// avoids 24-hour ("military") time on public and officer-facing surfaces.
export const WORK_HOURS_LABEL = '8:00 AM – 5:00 PM'

// The minutes-since-midnight bounds, so the checks below read as one comparison.
const START_MINUTES = WORK_START_HOUR * 60
const END_MINUTES = WORK_END_HOUR * 60

// Pulls hours/minutes out of a datetime-local value ('YYYY-MM-DDTHH:mm') without
// going through Date, so a value the browser has not finished typing (no time
// part yet) is reported as incomplete rather than coerced to midnight.
const timeParts = (value) => {
  if (typeof value !== 'string') return null
  const match = value.match(/T(\d{2}):(\d{2})/)
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

// True when the value carries a time of day inside the office-hours window. A
// value with no time part yet (date only, mid-entry) is treated as "not outside"
// so the field does not fight the user while they are still typing it.
export const isWithinWorkHours = (value) => {
  const parts = timeParts(value)
  if (!parts) return true
  const minutes = parts.hour * 60 + parts.minute
  return minutes >= START_MINUTES && minutes <= END_MINUTES
}

// Snaps a value's time of day into the window, keeping its date: anything before
// 8:00 AM becomes 8:00 AM, anything after 5:00 PM becomes 5:00 PM. Returns the
// value unchanged when it has no time part or is already inside the window.
export const clampToWorkHours = (value) => {
  const parts = timeParts(value)
  if (!parts) return value
  const minutes = parts.hour * 60 + parts.minute
  if (minutes >= START_MINUTES && minutes <= END_MINUTES) return value

  const clamped = minutes < START_MINUTES ? START_MINUTES : END_MINUTES
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0')
  const mm = String(clamped % 60).padStart(2, '0')
  return value.replace(/T\d{2}:\d{2}/, `T${hh}:${mm}`)
}
