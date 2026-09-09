// The backend permits one AIP per fiscal year, covered by an adopted plan.
// Derive the choices from those records so a fresh database can start in a
// future year without creating an unrelated current-year AIP first.
export function availableAipYears(plans, programs) {
  const occupied = new Set(programs.map((program) => Number(program.fiscalYear)))
  const years = new Set()
  for (const plan of plans) {
    if (plan.status !== 'adopted') continue
    const start = Number(plan.startYear)
    const end = Number(plan.endYear)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 2000 || end > 2100 || end < start) continue
    for (let year = start; year <= end; year += 1) {
      if (!occupied.has(year)) years.add(year)
    }
  }
  return [...years].sort((left, right) => left - right)
}
