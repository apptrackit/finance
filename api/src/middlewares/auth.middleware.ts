import { Context, Next } from 'hono'
import { Bindings } from '../types/environment.types'

export async function authMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  // Skip API key check for OPTIONS (preflight) requests - already handled by CORS middleware
  if (c.req.method === 'OPTIONS') {
    return await next()
  }

  // Check API key
  const apiKey = c.req.header('X-API-Key')
  if (!apiKey || apiKey !== c.env.API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
}
