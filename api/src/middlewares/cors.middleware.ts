import { Context, Next } from 'hono'
import { Bindings } from '../types/environment.types'

export async function corsMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  const origin = c.req.header('Origin')
  const allowedOriginsStr = c.env.ALLOWED_ORIGINS || ''
  const allowedOrigins = allowedOriginsStr.split(',').map(o => o.trim()).filter(o => o)

  // Reject requests without Origin header (non-browser requests)
  if (!origin) {
    return c.json({ error: 'Origin header required' }, 403)
  }

  // Check if origin is allowed
  let isAllowed = false
  for (const allowed of allowedOrigins) {
    if (origin === allowed) {
      isAllowed = true
      break
    }
    // Allow subdomains if configured with wildcard
    if (allowed.startsWith('*.') && origin.endsWith(allowed.substring(1))) {
      isAllowed = true
      break
    }
  }

  // Reject requests from unauthorized origins
  if (!isAllowed) {
    return c.json({ error: 'Origin not allowed' }, 403)
  }

  // Set CORS headers for allowed origins
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  // Handle preflight requests - return early without API key check
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }

  await next()
}
