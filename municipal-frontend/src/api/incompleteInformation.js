// The transport awaits a real user decision. No mutation is retried on cancel.
let askUser
export function registerInformationConfirmation(handler) {
  askUser = handler
  return () => { if (askUser === handler) askUser = undefined }
}

export const createInformationAdapter = (send, confirm = details => askUser?.(details) ?? false, isCurrent = () => true) => async config => {
  try {
    return await send(config)
  } catch (error) {
    let details = error.response?.data
    // Axios transforms JSON after its adapter resolves or rejects.
    if (typeof details === 'string') { try { details = JSON.parse(details) } catch { throw error } }
    if (details?.code !== 'INCOMPLETE_INFORMATION_CONFIRMATION_REQUIRED'
      || !Array.isArray(details.missingFields) || config.headers?.get?.('X-Confirm-Incomplete-Information') === 'true') throw error
    const accepted = await confirm(details)
    if (!accepted || !isCurrent(config)) {
      error.response.data = { ...details, message: 'Nothing was saved. Complete the unanswered fields or choose Proceed anyway.' }
      throw error
    }
    config.headers.set('X-Confirm-Incomplete-Information', 'true')
    return send(config)
  }
}
