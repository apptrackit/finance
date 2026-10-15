import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted(() => ({
  API_AUTH_MODE: 'private', API_BASE_URL: '/api', AUTH_REQUIRED_EVENT: 'finance-auth-required',
  getApiLoginUrl: () => 'https://api.finance.test/auth/login?returnTo=https%3A%2F%2Ffinance.test%2Fanalytics',
}))
vi.mock('../config', () => config)
import { ApiSession } from './ApiSession'

describe('API session sign-in and recovery', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => { config.API_AUTH_MODE = 'private'; vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset() })

  it('loads no financial children until a private session is verified', async () => {
    let complete!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise(resolve => { complete = resolve }))
    render(<ApiSession><p>Financial data</p></ApiSession>)
    expect(screen.queryByText('Financial data')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
    await act(async () => complete(Response.json({ mode: 'private' })))
    expect(screen.getByText('Financial data')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', cache: 'no-store', redirect: 'error' })
  })

  it.each(['network', 'unauthorized', 'wrong-mode'])('offers login/retry when startup fails: %s', async failure => {
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Network error'))
    else fetchMock.mockResolvedValueOnce(failure === 'unauthorized' ? new Response(null, { status: 401 }) : Response.json({ mode: 'public' }))
    render(<ApiSession><p>Financial data</p></ApiSession>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in with Cloudflare')
    expect(screen.queryByText('Financial data')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', config.getApiLoginUrl())
    fetchMock.mockResolvedValueOnce(Response.json({ mode: 'private' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    expect(await screen.findByText('Financial data')).toBeInTheDocument()
  })

  it('preserves an unsaved form after expiry and signs in in another tab', async () => {
    fetchMock.mockImplementation(async () => Response.json({ mode: 'private' }))
    render(<ApiSession><input aria-label="Description" defaultValue="" /></ApiSession>)
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'Unsaved transaction' } })
    act(() => window.dispatchEvent(new Event(config.AUTH_REQUIRED_EVENT)))
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('target', '_blank')
    expect(input).toHaveValue('Unsaved transaction')
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox')).toBe(input)
    expect(input).toHaveValue('Unsaved transaction')
  })

  it('opens a public demo without Access or a bootstrap request', () => {
    config.API_AUTH_MODE = 'public'
    render(<ApiSession><p>Demo data</p></ApiSession>)
    expect(screen.getByText('Demo data')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
