import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

const origin = 'https://finance.test'

describe('private API authentication at the real Worker boundary', () => {
  const f = useFinanceWorkers({ apiVars: { ALLOWED_ORIGINS: `${origin},http://localhost:5173` } })
  beforeEach(() => f.seed())

  it('rejects spoofed origins/legacy keys and invalid identities before reads or writes', async () => {
    for (const path of ['/', '/version', '/accounts', '/export', '/auth/session']) {
      expect((await f.api.fetch(path, { headers: { Origin: origin, 'X-API-Key': 'old-browser-key' } })).status).toBe(401)
    }
    const invalidClaims = [
      { exp: 1 }, { exp: undefined }, { exp: '9999999999' },
      { nbf: Math.floor(Date.now() / 1000) + 3600 },
      { iss: 'https://wrong.cloudflareaccess.com' }, { aud: ['wrong'] },
      // MCP tokens are deliberately scoped to a different application.
      {}, { sub: undefined }, { sub: '' }, { email: undefined },
      { email: 'wrong@example.com' },
    ]
    for (const claims of invalidClaims) {
      const token = await f.accessToken({ aud: ['finance-api-audience'], ...claims })
      // An unchanged MCP audience is not accepted by the API.
      const assertion = Object.keys(claims).length ? token : await f.accessToken()
      for (const method of ['GET', 'POST']) {
        const response = await f.api.fetch('/accounts', { method, headers: {
          Origin: origin, 'Cf-Access-Jwt-Assertion': assertion, 'Content-Type': 'application/json',
        }, body: method === 'POST' ? JSON.stringify({ name: 'Unauthorized', type: 'cash', currency: 'HUF', balance: 1 }) : undefined })
        expect([401, 403], JSON.stringify(claims)).toContain(response.status)
      }
    }
    const valid = await f.accessToken({ aud: ['finance-api-audience'] })
    for (const token of ['not-a-jwt', `${valid.slice(0, -8)}AAAAAAAA`,
      `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${valid.split('.')[1]}.`]) {
      expect((await f.api.fetch('/accounts', { headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': token } })).status).toBe(401)
    }
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM accounts').first('count')).toBe(2)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
  })

  it('accepts the allowed user and credentials preflight without authenticating OPTIONS', async () => {
    const preflight = await f.api.fetch('/accounts', { method: 'OPTIONS', headers: { Origin: origin } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(preflight.headers.get('Access-Control-Allow-Headers')).not.toContain('X-API-Key')
    const response = await f.request('/accounts')
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vary')).toContain('Origin')
    expect((await f.request('/auth/session')).status).toBe(200)
    expect((await f.request('/accounts', 'POST', { name: 'Permitted', type: 'cash', currency: 'HUF', balance: 0 })).status).toBe(201)
  })

  it('allows authenticated top-level login navigation only to exact allowed frontend origins', async () => {
    const headers = { 'Cf-Access-Jwt-Assertion': await f.accessToken({ aud: ['finance-api-audience'] }) }
    const destination = `${origin}/analytics?range=month#details`
    const response = await f.api.fetch(`/auth/login?returnTo=${encodeURIComponent(destination)}`, { headers, redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(destination)
    for (const value of ['', '//evil.test', 'https://finance.test.evil.test', 'https://evil.test', 'https://u:p@finance.test', 'javascript:alert(1)']) {
      expect((await f.api.fetch(`/auth/login?returnTo=${encodeURIComponent(value)}`, { headers, redirect: 'manual' })).status).toBe(400)
    }
    expect((await f.api.fetch(`/auth/login?returnTo=${origin}`, { redirect: 'manual' })).status).toBe(401)
    expect((await f.api.fetch('/accounts', { headers })).status).toBe(403)
  })

  it('authenticates a localhost frontend independently and returns the API login to localhost', async () => {
    const localOrigin = 'http://localhost:5173'
    const preflight = await f.api.fetch('/accounts', { method: 'OPTIONS', headers: { Origin: localOrigin } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(localOrigin)
    expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect((await f.api.fetch('/auth/session', { headers: { Origin: localOrigin } })).status).toBe(401)
    const assertion = await f.accessToken({ aud: ['finance-api-audience'] })
    const response = await f.api.fetch('/auth/session', { headers: { Origin: localOrigin, 'Cf-Access-Jwt-Assertion': assertion } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ mode: 'private' })
    const destination = `${localOrigin}/analytics?range=month`
    const login = await f.api.fetch(`/auth/login?returnTo=${encodeURIComponent(destination)}`, {
      headers: { 'Cf-Access-Jwt-Assertion': assertion }, redirect: 'manual',
    })
    expect(login.status).toBe(302)
    expect(login.headers.get('Location')).toBe(destination)
    expect((await f.api.fetch('/auth/session', { headers: { Origin: 'http://localhost.evil.test:5173', 'Cf-Access-Jwt-Assertion': assertion } })).status).toBe(403)
  })
})

describe('explicit public demo API', () => {
  const f = useFinanceWorkers({ apiVars: { API_AUTH_MODE: 'public' } })
  beforeEach(() => f.seed())
  it('allows keyless reads/writes while preserving origin checks and independent MCP authentication', async () => {
    expect((await f.api.fetch('/accounts', { headers: { Origin: origin } })).status).toBe(200)
    expect((await f.api.fetch('/accounts', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Demo', type: 'cash', currency: 'HUF', balance: 0 }) })).status).toBe(201)
    expect((await f.api.fetch('/accounts', { headers: { Origin: 'https://evil.test' } })).status).toBe(403)
    expect((await f.mcp.fetch('/mcp', { method: 'POST' })).status).toBe(401)
    expect(await (await f.api.fetch('/auth/session', { headers: { Origin: origin } })).json()).toEqual({ mode: 'public' })
  })
})

const invalidConfigurations: Record<string, string>[] = [{ API_ACCESS_AUD: '' }, { API_AUTH_MODE: 'legacy' }, { API_AUTH_MODE: '', API_ACCESS_TEAM_DOMAIN: '' }]
for (const apiVars of invalidConfigurations) {
  describe(`invalid API authentication configuration ${JSON.stringify(apiVars)}`, () => {
    const f = useFinanceWorkers({ apiVars })
    it('fails closed instead of enabling public access', async () => {
      expect((await f.api.fetch('/accounts', { headers: { Origin: origin } })).status).toBe(503)
    })
  })
}
