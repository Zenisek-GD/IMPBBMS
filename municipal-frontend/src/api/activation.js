import { apiClient } from './client'

// Bidder account activation. None of these carry a session — the account being
// activated cannot be signed into yet, so the invitation token in the request is
// the only thing identifying the caller.

export const verifyActivationLink = (token) =>
  apiClient.get('/activation/verify', { params: { token } }).then((res) => res.data)

// Sends the chosen password for validation and triggers the emailed code. The
// server does NOT save the password here — it comes back with the code on the
// next call, which is why the page has to hold it in component state for the
// length of the flow rather than posting it once and forgetting it.
export const startActivation = (token, password, displayName) =>
  apiClient
    .post('/activation/setup', { token, password, displayName })
    .then((res) => res.data)

export const confirmActivation = ({ token, reference, code, password, displayName }) =>
  apiClient
    .post('/activation/confirm', { token, reference, code, password, displayName })
    .then((res) => res.data)

export const resendActivationCode = (token) =>
  apiClient.post('/activation/resend-code', { token }).then((res) => res.data)
