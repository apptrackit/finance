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
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); fetchMock.mockReset() })

  it('sends the local calendar date and API key while preserving caller headers and cancellation', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))
    const controller = new AbortController()
    await apiFetch('/transactions', { headers: new Headers({ 'Content-Type': 'application/json' }), signal: controller.signal })
    const [, options] = fetchMock.mock.calls[0]
    const headers = new Headers(options?.headers)
    expect(headers.get('X-Client-Date')).toBe('2026-01-15')
    expect(headers.get('X-API-Key')).toBe(import.meta.env.VITE_API_KEY || '')
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
})
