import type { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Bindings } from '../types/environment.types'

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export async function authMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  if (c.req.method === 'OPTIONS') return next()
  const mode = c.env.API_AUTH_MODE ?? 'private'
  if (mode === 'public') return next()
  if (mode !== 'private') {
    return c.json({ error: 'Invalid API authentication mode', code: 'AUTH_CONFIG_INVALID' }, 503)
  }

  // Missing configuration must never make a private deployment public.
  const { API_ACCESS_TEAM_DOMAIN: team, API_ACCESS_AUD: audience, API_ACCESS_ALLOWED_EMAIL: email } = c.env
  let issuer: URL
  try {
    issuer = new URL(team || '')
    if (issuer.protocol !== 'https:' || !issuer.hostname.endsWith('.cloudflareaccess.com') ||
        issuer.username || issuer.password || issuer.port || issuer.pathname !== '/' || issuer.search || issuer.hash ||
        !audience?.trim() || !email?.trim()) throw new Error('Invalid Access configuration')
  } catch {
    return c.json({ error: 'Cloudflare Access is not configured', code: 'AUTH_CONFIG_INVALID' }, 503)
  }

  const token = c.req.header('Cf-Access-Jwt-Assertion')
  if (!token) return c.json({ error: 'Sign in with Cloudflare Access', code: 'AUTH_REQUIRED' }, 401)
  try {
    let keys = keySets.get(issuer.origin)
    if (!keys) {
      keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer))
      keySets.set(issuer.origin, keys)
    }
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'], issuer: issuer.origin, audience,
      requiredClaims: ['exp', 'sub', 'email'],
    })
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' ||
        payload.email.toLowerCase() !== email.trim().toLowerCase()) {
      return c.json({ error: 'This user is not allowed', code: 'AUTH_FORBIDDEN' }, 403)
    }
  } catch {
    // Do not expose assertions, claims, or signing-key errors in responses/logs.
    return c.json({ error: 'Cloudflare Access session is invalid or expired', code: 'AUTH_REQUIRED' }, 401)
  }
  await next()
}
