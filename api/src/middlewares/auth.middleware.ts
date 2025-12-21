import { Context, Next } from 'hono'
import { Bindings } from '../types/environment.types'

export async function authMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  // Skip API key check for OPTIONS (preflight) requests - already handled by CORS middleware
  if (c.req.method === 'OPTIONS') {
    return await next()
  }

  // Skip API key check for public endpoints (health check, version, cache status)
  const path = c.req.path
  const publicPaths = ['/', '/version', '/cache/sync-status', '/cache/status']
  if (publicPaths.includes(path)) {
    return await next()
  }

  // Check API key
  const apiKey = c.req.header('X-API-Key')
  if (!apiKey || apiKey !== c.env.API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
}
