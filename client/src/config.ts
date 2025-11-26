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

// Helper function for authenticated API calls
export const apiFetch = (url: string, options: RequestInit = {}) => {
  return fetch(url, {
    ...options,
    // No credentials needed since we use API key authentication
    headers: {
      'X-API-Key': API_KEY,
      ...options.headers,
    },
  })
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
