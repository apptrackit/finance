import type { Env } from './types'

type AccessClaims = {
  aud?: string | string[]
  email?: string
  exp?: number
  nbf?: number
  iss?: string
  sub?: string
}

type Jwk = JsonWebKey & { kid?: string }
let cachedKeys: { expiresAt: number; keys: Jwk[] } | undefined

export class AccessAuthError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AccessAuthError'
  }
}

export function normalizeAccessTeamDomain(value: string): string {
  const configured = value.trim()
  if (!configured) throw new AccessAuthError('access_team_domain_missing', 'Cloudflare Access team domain is not configured')
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`)
  } catch (error) {
    throw new AccessAuthError('access_team_domain_invalid', 'Cloudflare Access team domain is invalid', { cause: error })
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new AccessAuthError('access_team_domain_invalid', 'Cloudflare Access team domain must be an HTTPS origin')
  }
  return url.origin
}

function decodePart(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodePart(value))) as T
}

async function getKeys(teamDomain: string): Promise<Jwk[]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys
  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`).catch(error => {
    throw new AccessAuthError('access_cert_fetch_failed', 'Unable to load Cloudflare Access signing keys', { cause: error })
  })
  if (!response.ok) throw new AccessAuthError('access_cert_fetch_failed', `Cloudflare Access signing keys returned HTTP ${response.status}`)
  const body = await response.json<{ keys?: Jwk[] }>().catch(error => {
    throw new AccessAuthError('access_cert_response_invalid', 'Cloudflare Access signing keys response was invalid', { cause: error })
  })
  if (!body.keys?.length) throw new AccessAuthError('access_cert_response_invalid', 'Cloudflare Access returned no signing keys')
  cachedKeys = { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 }
  return body.keys
}

export async function verifyAccess(request: Request, env: Env): Promise<AccessClaims> {
  if (env.DISABLE_ACCESS_AUTH === 'true') return { email: env.ALLOWED_EMAIL || 'local@example.com', sub: 'local' }

  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) throw new AccessAuthError('access_assertion_missing', 'Missing Cloudflare Access assertion')
  const parts = token.split('.')
  if (parts.length !== 3) throw new AccessAuthError('access_assertion_invalid', 'Invalid Cloudflare Access assertion')

  let header: { alg?: string; kid?: string }
  try { header = decodeJson<{ alg?: string; kid?: string }>(parts[0]) } catch (error) { throw new AccessAuthError('access_header_invalid', 'Invalid Cloudflare Access assertion header', { cause: error }) }
  if (header.alg !== 'RS256' || !header.kid) throw new AccessAuthError('access_algorithm_unsupported', 'Unsupported Cloudflare Access signing algorithm')
  const teamDomain = normalizeAccessTeamDomain(env.CF_ACCESS_TEAM_DOMAIN)
  const key = (await getKeys(teamDomain)).find(candidate => candidate.kid === header.kid)
  if (!key) throw new AccessAuthError('access_signing_key_unknown', 'Unknown Cloudflare Access signing key')

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  )
  const signature = Uint8Array.from(decodePart(parts[2])).buffer
  const signedData = Uint8Array.from(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)).buffer
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData)
  if (!valid) throw new AccessAuthError('access_signature_invalid', 'Invalid Cloudflare Access signature')

  let claims: AccessClaims
  try { claims = decodeJson<AccessClaims>(parts[1]) } catch (error) { throw new AccessAuthError('access_claims_invalid', 'Invalid Cloudflare Access assertion claims', { cause: error }) }
  const now = Math.floor(Date.now() / 1000)
  if (!claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now + 30)) throw new AccessAuthError('access_assertion_expired', 'Expired or not-yet-valid Cloudflare Access assertion')
  if (claims.iss !== teamDomain) throw new AccessAuthError('access_issuer_mismatch', 'Unexpected Cloudflare Access issuer')
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(env.CF_ACCESS_AUD)) throw new AccessAuthError('access_audience_mismatch', 'Unexpected Cloudflare Access audience')
  if (env.ALLOWED_EMAIL && claims.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
    throw new AccessAuthError('access_email_mismatch', 'Cloudflare Access identity is not allowed')
  }
  return claims
}
