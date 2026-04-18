import { Context, Next } from 'hono'
import { Bindings } from '../types/environment.types'

// In-memory sliding window rate limiter per Worker instance.
// NOTE: Cloudflare Workers run on many edge nodes globally — this limits
// requests per node, not globally. For true global rate limiting, use
// Cloudflare's native Rate Limiting feature in wrangler.toml:
//   [[rate_limiting]]
//   binding = "RATE_LIMITER"
//   namespace_id = "<your-namespace-id>"
//   simple = { limit = 100, period = 60 }

const requestLog = new Map<string, number[]>()

function getClientKey(c: Context): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown'
}

export function rateLimitMiddleware(limit: number, windowSeconds: number) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const key = getClientKey(c)
    const now = Date.now()
    const windowMs = windowSeconds * 1000

    const timestamps = (requestLog.get(key) ?? []).filter(t => now - t < windowMs)
    timestamps.push(now)
    requestLog.set(key, timestamps)

    // Evict old keys periodically to avoid memory growth
    if (requestLog.size > 10000) {
      for (const [k, ts] of requestLog) {
        if (ts.every(t => now - t >= windowMs)) requestLog.delete(k)
      }
    }

    if (timestamps.length > limit) {
      return c.json(
        { error: 'Too many requests', code: 'RATE_LIMITED' },
        429
      )
    }

    await next()
  }
}
