import type { Context, Next } from 'hono'
import type { Bindings } from '../types/environment.types'

export function allowedOrigins(env: Bindings): string[] {
  // Credentialed browser access and login redirects require exact origins.
  return (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(value => {
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value && !url.username && !url.password
    } catch { return false }
  })
}

export async function corsMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  c.header('Cache-Control', 'no-store')
  c.header('Vary', 'Origin')
  const origin = c.req.header('Origin')

  // Only this authenticated navigation endpoint accepts a missing Origin.
  // Its handler independently validates the return URL's exact origin.
  if (!origin && c.req.method === 'GET' && c.req.path === '/auth/login') return next()
  if (!origin) {
    return c.json({ error: 'Origin header required' }, 403)
  }

  // Check if origin is allowed
  const isAllowed = allowedOrigins(c.env).includes(origin)

  // Reject requests from unauthorized origins
  if (!isAllowed) {
    return c.json({ error: 'Origin not allowed' }, 403)
  }

  // Set CORS headers for allowed origins
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Access-Control-Allow-Credentials', 'true')
  c.header('Access-Control-Allow-Headers', 'Content-Type, X-Client-Date')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')

  // Preflight returns no financial data and needs no identity.
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }

  await next()
}
