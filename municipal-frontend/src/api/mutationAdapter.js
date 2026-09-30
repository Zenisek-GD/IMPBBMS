const writes = new Set(['post', 'put', 'patch', 'delete'])
const business = /^\/(?:planning|budget-preparation|app-entries|purchase-requisitions|bidding|finance|contracts|conferences|announcements|observers|protests|departments|messages|vendors|settings)(?:\/|$)/
const canonical = value => value === null || typeof value !== 'object' ? value : Array.isArray(value) ? value.map(canonical)
  : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))

// One transport promise per action prevents double clicks across components.
// Network retries retain the action key; changed inputs start a new action.
export const createMutationAdapter = (send, { now = Date.now, makeKey = () => crypto.randomUUID() } = {}) => {
  const actions = new Map()
  return async config => {
    const method = config.method?.toLowerCase()
    let body
    try { body = config.data === undefined ? {} : typeof config.data === 'string' ? JSON.parse(config.data) : config.data } catch { return send(config) }
    if (!writes.has(method) || !business.test(config.url ?? '') || config.allowDuplicateMutation || (typeof FormData !== 'undefined' && body instanceof FormData)) return send(config)
    const fingerprint = JSON.stringify([config.authEpoch, method, config.url, canonical(config.params), canonical(body)])
    const currentTime = now()
    for (const [key, value] of actions) if (!value.pending && value.expires <= currentTime) actions.delete(key)
    const suppliedKey = config.headers?.get?.('Idempotency-Key')
    const existing = actions.get(fingerprint)
    if (existing && (!suppliedKey || suppliedKey === existing.key)) {
      if (existing.pending) return existing.pending.then(result => ({ ...result, config }))
      if (existing.response) return { ...existing.response, config }
    }
    const action = { key: suppliedKey || existing?.key || makeKey(), expires: currentTime + 120_000 }
    config.headers.set('Idempotency-Key', action.key)
    config.headers.set('Content-Type', 'application/json')
    if (config.data === undefined) config.data = '{}'
    const pending = Promise.resolve().then(() => send(config))
    action.pending = pending
    actions.set(fingerprint, action)
    try {
      const result = await pending
      action.response = result
      action.expires = now() + 1500
      return result
    } catch (error) {
      const uncertain = !error.response || error.response.status >= 500 || ['ACTION_IN_PROGRESS', 'ACTION_OUTCOME_UNCERTAIN'].includes(error.response.data?.code)
      // A timeout or failed receipt acknowledgement may follow a successful
      // business commit. Keep its reference for subsequent clicks in this
      // session, even after a long wait, until the outcome is known.
      if (uncertain) action.expires = Infinity
      else actions.delete(fingerprint)
      throw error
    } finally { action.pending = null }
  }
}
