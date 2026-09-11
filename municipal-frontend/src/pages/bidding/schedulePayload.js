export const localDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export const schedulePayload = (form, category = form.category) => {
  const closing = new Date(form.closingDate)
  const opening = new Date(form.openingDate)
  if (Number.isNaN(closing.getTime()) || Number.isNaN(opening.getTime())) throw new Error('Enter a complete bid submission deadline and bid opening date and time.')
  if (opening <= closing) throw new Error('Bid opening must be scheduled after the bid submission deadline.')
  const payload = { closingDate: closing.toISOString(), openingDate: opening.toISOString() }
  if (form.prebidAt) payload.prebidAt = new Date(form.prebidAt).toISOString()
  if (category === 'consulting') {
    const quality = Number(form.qualityWeight)
    const financial = Number(form.financialWeight)
    const passing = Number(form.consultingPassingScore)
    if (!Number.isFinite(quality) || !Number.isFinite(financial) || quality <= financial) throw new Error('Quality weighting must be higher than the financial/price weighting.')
    if (quality <= 0 || financial <= 0 || Math.abs(quality + financial - 100) > 0.001) throw new Error('Quality and financial weights must both be positive and total 100%.')
    if (form.consultingPassingScore === '' || !Number.isFinite(passing) || passing <= 0 || passing > 100) throw new Error('Enter a minimum passing quality score greater than 0 and at most 100.')
    Object.assign(payload, { qualityWeight: quality, financialWeight: financial, consultingPassingScore: passing })
  }
  return payload
}
