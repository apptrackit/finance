import { describe, expect, it } from 'vitest'
import { normalizeAccessTeamDomain, verifyAccess } from './access-auth'
import type { Env } from './types'

describe('Cloudflare Access configuration', () => {
  it('normalizes the Cloudflare team hostname to the HTTPS issuer origin', () => {
    expect(normalizeAccessTeamDomain('team-example.cloudflareaccess.com')).toBe('https://team-example.cloudflareaccess.com')
    expect(normalizeAccessTeamDomain('https://team-example.cloudflareaccess.com/')).toBe('https://team-example.cloudflareaccess.com')
  })

  it('returns a structured error when Access assertion is absent', async () => {
    await expect(verifyAccess(new Request('https://finance.example/mcp'), {} as Env)).rejects.toMatchObject({
      code: 'access_assertion_missing',
      message: 'Missing Cloudflare Access assertion',
    })
  })
})
