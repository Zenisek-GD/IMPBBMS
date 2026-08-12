import { apiClient } from './client'

export const login = (email, password) =>
  apiClient.post('/auth/login', { email, password }).then((res) => res.data)

export const logout = () => apiClient.post('/auth/logout').then((res) => res.data)

export const fetchCurrentUser = () => apiClient.get('/auth/me').then((res) => res.data)

// ── Password reset (forgotten) ───────────────────────────────────────────────
// Three calls: ask for a code, submit the code for a one-time ticket, then set
// the new password with that ticket. The password is only ever sent on the last
// call, after the mailbox has been proved — so it is never held anywhere while
// the system waits for a code.
export const requestPasswordReset = (email) =>
  apiClient.post('/auth/forgot-password', { email }).then((res) => res.data)

export const verifyPasswordResetCode = (email, reference, code) =>
  apiClient.post('/auth/forgot-password/verify', { email, reference, code }).then((res) => res.data)

export const resetPassword = ({ email, reference, ticket, password }) =>
  apiClient.post('/auth/reset-password', { email, reference, ticket, password }).then((res) => res.data)

// ── Password change (signed in) ──────────────────────────────────────────────
// Same shape, plus the current password — required at the first step so a
// hijacked session cannot provoke codes into the real owner's inbox, and again at
// the last so a ticket alone cannot replace the credential.
export const requestPasswordChange = (currentPassword) =>
  apiClient.post('/auth/change-password/request', { currentPassword }).then((res) => res.data)

export const verifyPasswordChangeCode = (reference, code) =>
  apiClient.post('/auth/change-password/verify', { reference, code }).then((res) => res.data)

export const changeOwnPassword = ({ currentPassword, newPassword, reference, ticket }) =>
  apiClient
    .post('/auth/change-password', { currentPassword, newPassword, reference, ticket })
    .then((res) => res.data)

// ── Profile (display name) ───────────────────────────────────────────────────
// The email address is deliberately absent: it is the accredited channel, and
// only an official can change it.
export const requestProfileUpdate = (displayName) =>
  apiClient.post('/auth/profile/request', { displayName }).then((res) => res.data)

export const verifyProfileUpdateCode = (reference, code) =>
  apiClient.post('/auth/profile/verify', { reference, code }).then((res) => res.data)

export const updateProfile = ({ displayName, reference, ticket }) =>
  apiClient.patch('/auth/profile', { displayName, reference, ticket }).then((res) => res.data)

// Personal display settings — theme and sidebar state. Stored on the account so
// they follow the user rather than the browser. Not code-gated: a theme toggle is
// not a sensitive action.
export const updatePreferences = (payload) =>
  apiClient.patch('/auth/preferences', payload).then((res) => res.data)

// ── Two-factor authentication ────────────────────────────────────────────────
// The sign-in challenge. Reached only after `login` returned `mfaRequired` —
// at that point the server holds a short-lived pending state and no session, so
// this call is what turns a proved password into actual access.
export const verifyMfaChallenge = ({ token, recoveryCode }) =>
  apiClient.post('/auth/mfa/challenge', token ? { token } : { recoveryCode }).then((res) => res.data)

export const fetchMfaStatus = () => apiClient.get('/auth/mfa').then((res) => res.data)

// Issues a secret and a QR. The secret is returned exactly once — nothing reads
// it back afterwards — so the enrolment screen must not discard it before the
// user has scanned or copied it.
export const beginMfaEnrollment = () => apiClient.post('/auth/mfa/enroll').then((res) => res.data)

export const confirmMfaEnrollment = (token) =>
  apiClient.post('/auth/mfa/enroll/confirm', { token }).then((res) => res.data)

export const regenerateRecoveryCodes = (token) =>
  apiClient.post('/auth/mfa/recovery-codes', { token }).then((res) => res.data)

// Needs both factors: the password and a current code.
export const disableMfa = (password, token) =>
  apiClient.post('/auth/mfa/disable', { password, token }).then((res) => res.data)

// Administrator only. Clears someone else's enrolment so they can set it up
// again — it cannot reveal a secret or sign anybody in.
export const resetUserMfa = (userId, reason) =>
  apiClient.post(`/users/${userId}/mfa/reset`, { reason }).then((res) => res.data)
