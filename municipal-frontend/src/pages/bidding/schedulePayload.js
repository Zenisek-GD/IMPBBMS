export const localDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export const schedulePayload = (form) => {
  const closing = new Date(form.closingDate)
  const opening = new Date(form.openingDate)
  if (Number.isNaN(closing.getTime()) || Number.isNaN(opening.getTime())) throw new Error('Enter a complete bid submission deadline and bid opening date and time.')
  if (opening <= closing) throw new Error('Bid opening must be scheduled after the bid submission deadline.')
  const payload = { closingDate: closing.toISOString(), openingDate: opening.toISOString() }
  payload.prebidRequired = Boolean(form.prebidRequired)
  payload.prebidAt = payload.prebidRequired && form.prebidAt ? new Date(form.prebidAt).toISOString() : null
  payload.prebidVenue = payload.prebidRequired ? String(form.prebidVenue ?? '').trim() : null
  payload.prebidRemarks = payload.prebidRequired ? String(form.prebidRemarks ?? '').trim() : null
  if (payload.prebidRequired && (!payload.prebidAt || !payload.prebidVenue)) throw new Error('A required pre-bid conference needs a date, time, and venue or online meeting details.')
  if (payload.prebidAt && new Date(payload.prebidAt) >= closing) throw new Error('The pre-bid conference must be scheduled before the bid submission deadline.')
  for (const key of ['procurementStartAt', 'publicationStartAt', 'publicationEndAt', 'evaluationStartAt', 'evaluationEndAt', 'postQualificationStartAt', 'postQualificationEndAt', 'expectedAwardAt']) {
    payload[key] = form[key] ? new Date(form[key]).toISOString() : null
  }
  return payload
}
