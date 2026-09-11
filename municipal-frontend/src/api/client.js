import axios from 'axios'

export const apiClient = axios.create({
  // In development Vite proxies this path to Express, keeping the httpOnly
  // session cookie first-party whether the browser uses localhost or 127.0.0.1.
  // Cloudflare builds use the same path because the Worker serves UI and API
  // from one origin.
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
  timeout: 30000,
})

let authEpoch = 0
export const advanceAuthEpoch = () => { authEpoch += 1 }

apiClient.interceptors.request.use((config) => {
  config.authRequestStarted = performance.now()
  config.authEpoch = authEpoch
  return config
})

const publicAuth = /^\/auth\/(login|mfa\/challenge|forgot-password(?:\/verify)?|reset-password)$/
apiClient.interceptors.response.use(
  (response) => {
    const data = response.data
    if (response.config.authEpoch === authEpoch && ['post', 'put', 'patch', 'delete'].includes(response.config.method?.toLowerCase())) {
      window.dispatchEvent(new Event('procurement:changed'))
    }
    if (Number.isFinite(data?.loginSessionExpiresAt) && Number.isFinite(data?.serverTime)) {
      // Subtract the whole round trip to avoid overstating the time remaining.
      const elapsed = performance.now() - response.config.authRequestStarted
      const remaining = Math.max(0, data.loginSessionExpiresAt - data.serverTime - elapsed)
      data.sessionDeadline = Date.now() + remaining
      data.sessionMonotonicDeadline = performance.now() + remaining
    }
    return response
  },
  (error) => {
    const response = error.response
    if (error.config?.authEpoch === authEpoch && response?.status === 401 && !publicAuth.test(error.config?.url ?? '')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: response.data }))
    }
    if (error.config?.authEpoch === authEpoch && response?.data?.code === 'MFA_ENROLLMENT_REQUIRED') {
      window.dispatchEvent(new Event('auth:enrollment-required'))
    }
    return Promise.reject(error)
  },
)
