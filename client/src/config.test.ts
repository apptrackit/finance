import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, ApiRequestError } from './config'

describe('finance API request contract', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    // Construct local midnight: using toISOString() would send the wrong day
    // in the Europe/Budapest CI timezone.
    vi.setSystemTime(new Date(2026, 0, 15, 0, 15))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); fetchMock.mockReset() })

  it('sends the local calendar date and session credentials without a browser API key', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))
    const controller = new AbortController()
    await apiFetch('/transactions', { headers: new Headers({ 'Content-Type': 'application/json' }), signal: controller.signal })
    const [, options] = fetchMock.mock.calls[0]
    const headers = new Headers(options?.headers)
    expect(headers.get('X-Client-Date')).toBe('2026-01-15')
    expect(headers.has('X-API-Key')).toBe(false)
    expect(options?.credentials).toBe('include')
    expect(options?.redirect).toBe('error')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(options?.signal).toBe(controller.signal)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects failed %s saves with the server error and validation details', async method => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Invalid transaction', code: 'VALIDATION_ERROR', details: [{ field: 'amount', message: 'must be positive' }] }, { status: 400 }))
    await expect(apiFetch('/transactions', { method: method.toLowerCase() })).rejects.toMatchObject({
      name: 'ApiRequestError', status: 400, code: 'VALIDATION_ERROR',
      message: 'Invalid transaction: amount: must be positive',
    })
  })

  it('handles non-JSON and empty errors without reporting a failed save as successful', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Gateway unavailable', { status: 502 }))
    await expect(apiFetch('/transactions', { method: 'POST' })).rejects.toThrow('Gateway unavailable')
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(apiFetch('/transactions', { method: 'POST' })).rejects.toThrow('Request failed (503)')
  })

  it('shows a concise failed-save error instead of an HTML proxy page', async () => {
    fetchMock.mockResolvedValue(new Response('<!DOCTYPE html><html>Proxy error</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }))
    await expect(apiFetch('/accounts/test', { method: 'PUT' })).rejects.toMatchObject({ message: 'Request failed (502)', status: 502 })
  })

  it('allows reads and explicit callers to inspect an unconsumed error response', async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: 'Unavailable' }, { status: 503 }))
    const read = await apiFetch('/accounts')
    expect(read.status).toBe(503)
    expect(await read.json()).toEqual({ error: 'Unavailable' })
    await expect(apiFetch('/accounts', { throwOnError: true })).rejects.toBeInstanceOf(ApiRequestError)
    const write = await apiFetch('/accounts', { method: 'POST', throwOnError: false })
    expect(await write.json()).toEqual({ error: 'Unavailable' })
  })

  it('propagates network failures and aborts without retrying financial mutations', async () => {
    const error = new DOMException('Cancelled', 'AbortError')
    fetchMock.mockRejectedValue(error)
    await expect(apiFetch('/transactions', { method: 'POST' })).rejects.toBe(error)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('signals private-session expiry while failing a save once without retrying it', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_AUTH_MODE', 'private')
    const { apiFetch: privateFetch, AUTH_REQUIRED_EVENT } = await import('./config')
    const listener = vi.fn()
    window.addEventListener(AUTH_REQUIRED_EVENT, listener)
    try {
      fetchMock.mockResolvedValueOnce(Response.json({ error: 'Expired', code: 'AUTH_REQUIRED' }, { status: 401 }))
      await expect(privateFetch('/transactions', { method: 'POST' })).rejects.toMatchObject({ status: 401 })
      expect(listener).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      fetchMock.mockRejectedValueOnce(new TypeError('Access redirect blocked'))
      await expect(privateFetch('/transactions', { method: 'POST' })).rejects.toThrow('Access redirect blocked')
      expect(listener).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally { window.removeEventListener(AUTH_REQUIRED_EVENT, listener) }
  })
})

describe('API session routing during local frontend development', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it.each([
    ['private', 'api.finance.test', 'https://api.finance.test'],
    ['public', 'api.finance.test', '/api'],
    ['public', 'localhost:8787', '/api'],
    ['private', 'localhost:8787', '/api'],
    ['public', '127.0.0.1:8787', '/api'],
    ['private', 'localhost.evil.test', 'https://localhost.evil.test'],
  ])('routes %s development requests targeting %s to %s', async (mode, domain, expected) => {
    vi.resetModules()
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_API_AUTH_MODE', mode)
    vi.stubEnv('VITE_API_DOMAIN', domain)
    const { API_BASE_URL } = await import('./config')
    expect(API_BASE_URL).toBe(expected)
  })

  it('signs in on the remote API hostname and returns to the current localhost page', async () => {
    vi.resetModules()
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_API_AUTH_MODE', 'private')
    vi.stubEnv('VITE_API_DOMAIN', 'api.finance.test')
    const { getApiLoginUrl } = await import('./config')
    const login = new URL(getApiLoginUrl())
    expect(login.origin).toBe('https://api.finance.test')
    expect(login.pathname).toBe('/auth/login')
    expect(login.searchParams.get('returnTo')).toBe(window.location.href)
  })
})
