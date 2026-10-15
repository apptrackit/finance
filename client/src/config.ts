// ===========================================
// FINANCE APP - CLIENT CONFIGURATION
// ===========================================
// All configuration is loaded from environment variables
// See .env.example in the root folder for setup instructions

const isDev = import.meta.env.DEV

// Public is an explicit deployment choice, never an authentication fallback.
export const API_AUTH_MODE = import.meta.env.VITE_API_AUTH_MODE || 'private'
export const AUTH_REQUIRED_EVENT = 'finance-auth-required'

// API Configuration
const API_DOMAIN = import.meta.env.VITE_API_DOMAIN || 'localhost:8787'
const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(API_DOMAIN)
const protocol = isLocalhost ? 'http' : 'https'

// A private remote API must receive its own hostname's browser session cookie.
// Proxying through localhost would send localhost cookies instead.
export const API_BASE_URL = isDev && (isLocalhost || API_AUTH_MODE === 'public')
  ? '/api'
  : `${protocol}://${API_DOMAIN}`

export const getApiLoginUrl = () => {
  const url = new URL(`${API_BASE_URL}/auth/login`, window.location.origin)
  url.searchParams.set('returnTo', window.location.href)
  return url.href
}

const getLocalDateString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type ApiFetchOptions = RequestInit & {
  throwOnError?: boolean
}

type ApiErrorDetail = {
  field?: string
  message?: string
}

type ApiErrorResponse = {
  error?: string
  message?: string
  code?: string
  details?: ApiErrorDetail[]
}

export class ApiRequestError extends Error {
  status: number
  code?: string
  details?: ApiErrorDetail[]

  constructor(message: string, status: number, code?: string, details?: ApiErrorDetail[]) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const buildHeaders = (headers?: HeadersInit) => {
  const next = new Headers({
    'X-Client-Date': getLocalDateString(),
  })

  new Headers(headers).forEach((value, key) => {
    next.set(key, value)
  })

  return next
}

const createApiRequestError = async (response: Response) => {
  const fallback = `Request failed (${response.status})`

  try {
    const data = await response.clone().json() as ApiErrorResponse
    const details = Array.isArray(data.details) ? data.details : undefined
    const detailMessage = details
      ?.map(detail => {
        if (!detail.message) return ''
        return detail.field ? `${detail.field}: ${detail.message}` : detail.message
      })
      .filter(Boolean)
      .join('; ')

    const mainMessage = data.error || data.message || fallback
    const message = detailMessage ? `${mainMessage}: ${detailMessage}` : mainMessage

    return new ApiRequestError(message, response.status, data.code, details)
  } catch {
    const text = await response.clone().text().catch(() => '')
    // Reverse proxies may return an HTML error page; keep it out of save alerts.
    const isHtml = response.headers.get('Content-Type')?.includes('text/html') || /^\s*</.test(text)
    return new ApiRequestError(isHtml ? fallback : text || fallback, response.status)
  }
}

// Helper function for authenticated API calls
export const apiFetch = async (url: string, options: ApiFetchOptions = {}) => {
  const { throwOnError, headers, ...fetchOptions } = options
  const method = (fetchOptions.method || 'GET').toUpperCase()
  let response: Response
  try {
    response = await fetch(url, {
      ...fetchOptions,
      credentials: 'include',
      redirect: 'error',
      headers: buildHeaders(headers),
    })
  } catch (error) {
    // Access may block a cross-origin request before the Worker can return JSON.
    // Do not retry writes or navigate away from unsaved financial forms.
    if (API_AUTH_MODE === 'private' && !fetchOptions.signal?.aborted &&
        !(error instanceof DOMException && error.name === 'AbortError')) {
      window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
    }
    throw error
  }
  if (API_AUTH_MODE === 'private' && (response.status === 401 || response.status === 403)) {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
  }

  if (!response.ok && (throwOnError ?? MUTATING_METHODS.has(method))) {
    throw await createApiRequestError(response)
  }

  return response
}
