import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../middlewares/auth.middleware'
import type { Bindings } from '../types/environment.types'

describe('API deployment authentication configuration', () => {
  it.each([
    {}, { API_AUTH_MODE: 'old' }, { API_AUTH_MODE: '' },
    { API_AUTH_MODE: 'private' },
    { API_ACCESS_TEAM_DOMAIN: 'https://evil.test', API_ACCESS_AUD: 'api', API_ACCESS_ALLOWED_EMAIL: 'user@example.com' },
    { API_ACCESS_TEAM_DOMAIN: 'https://u:p@team.cloudflareaccess.com', API_ACCESS_AUD: 'api', API_ACCESS_ALLOWED_EMAIL: 'user@example.com' },
  ])('does not execute handlers for missing/invalid private configuration: %j', async env => {
    const app = new Hono<{ Bindings: Bindings }>()
    const handler = vi.fn(c => c.text('Sensitive data'))
    app.use('*', authMiddleware)
    app.get('/accounts', handler)
    const response = await app.request('/accounts', {}, env as Bindings)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'AUTH_CONFIG_INVALID' })
    expect(handler).not.toHaveBeenCalled()
  })
})
