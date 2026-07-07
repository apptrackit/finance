// ===========================================
// FINANCE APP - CLIENT CONFIGURATION
// ===========================================
// All configuration is loaded from environment variables
// See .env.example in the root folder for setup instructions

const isDev = import.meta.env.DEV

// API Configuration
const API_DOMAIN = import.meta.env.VITE_API_DOMAIN || 'localhost:8787'
const isLocalhost = API_DOMAIN.includes('localhost')
const protocol = isLocalhost ? 'http' : 'https'

export const API_BASE_URL = isDev 
  ? '/api'  // Proxied through Vite in development
  : `${protocol}://${API_DOMAIN}`

// API Key for authentication
const API_KEY = import.meta.env.VITE_API_KEY || ''

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
    'X-API-Key': API_KEY,
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
    return new ApiRequestError(text || fallback, response.status)
  }
}

// Helper function for authenticated API calls
export const apiFetch = async (url: string, options: ApiFetchOptions = {}) => {
  const { throwOnError, headers, ...fetchOptions } = options
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const response = await fetch(url, {
    ...fetchOptions,
    // No credentials needed since we use API key authentication
    headers: buildHeaders(headers),
  })

  if (!response.ok && (throwOnError ?? MUTATING_METHODS.has(method))) {
    throw await createApiRequestError(response)
  }

  return response
}

// ===========================================
// HOW SECURITY WORKS (Client Side)
// ===========================================
//
// 1. CLOUDFLARE ACCESS (First Layer)
//    - When you visit finance.yourdomain.com, Cloudflare Access
//      intercepts the request BEFORE it reaches the app
//    - You must authenticate with your email (one-time code)
//    - Only allowed emails can access the frontend
//    - Session lasts 24 hours (configurable)
//
// 2. API KEY (Second Layer)
//    - Every API request includes X-API-Key header
//    - The API rejects requests without valid key
//    - Key is loaded from environment variable (not hardcoded)
//    - Even if someone bypasses Cloudflare Access, they need the key
//
// 3. CORS (Third Layer)
//    - API only accepts requests from your domain
//    - Browsers block cross-origin requests from other websites
//    - Someone can't make a website that calls your API
//
// 4. HTTPS (Fourth Layer)
//    - All traffic is encrypted
//    - Cloudflare provides free SSL certificates
//
// FLOW:
// User → Cloudflare Access (email auth) → Frontend → API (with key) → Database
//
// ===========================================
