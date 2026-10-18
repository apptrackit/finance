import {historyFixture,investmentFixture} from './investment-fixture'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appRoutes } from '../navigation/routes'
import { ThemeProvider } from '../context/ThemeContext'
import { AlertProvider } from '../context/AlertContext'

vi.mock('../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: 'visible', togglePrivacyMode: vi.fn(), shouldHideNetWorth: () => false }),
}))
vi.mock('../components/settings-module/Settings', () => ({ default: () => <h2>Settings content</h2> }))

const holding = { id: 'holding', name: 'Synthetic holding', type: 'investment', balance: 0.1,
  currency: 'SHARE', quote_currency: 'USD', asset_type: 'stock', symbol: 'TEST', updated_at: 1 }
const trade = { id: 'buy', account_id: 'holding', type: 'buy', quantity: 0.1, price: 100, total_amount: 10, date: '2026-10-01' }
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  localStorage.clear()
  fetchMock.mockImplementation(async input => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
    const data: Record<string, unknown> = {
      '/investment-metrics':investmentFixture(), '/accounts': [holding], '/investment-transactions': [trade], '/categories': [],
      '/transactions/upcoming': [], '/market/quote': { regularMarketPrice: 150, currency: 'USD' },
      '/dashboard/net-worth': { net_worth: 0 },
      '/v6/latest/HUF': { rates: { HUF: 1, USD: 0.0025 } }, '/v6/latest/USD': { rates: { USD: 1, HUF: 400 } },
      '/settings/navigation': { visible_menus: { dashboard: true, investments: true, analytics: true, recurring: true }, updated_at: 1 },
    }
    return Response.json(path==='/investment-history'?historyFixture(new URL(String(input),'http://localhost').searchParams):data[path] ?? [])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows one cold-load animation, then returns to cached portfolio content while refreshing', async () => {
  const baseFetch = fetchMock.getMockImplementation()!
  let release: (response: Response) => void = () => {}
  fetchMock.mockImplementation(async (input, options) => String(input).includes('/investment-metrics')
    ? new Promise(resolve => { release = resolve }) : baseFetch(input, options))
  const router = createMemoryRouter(appRoutes, { initialEntries: ['/investments'] })
  render(<ThemeProvider><AlertProvider><RouterProvider router={router} /></AlertProvider></ThemeProvider>)
  expect(screen.getAllByRole('status', { name: 'Loading your finances' })).toHaveLength(1)
  await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/investment-metrics'))).toBe(true))
  await act(async () => { release(Response.json(investmentFixture())) })
  expect(await screen.findByRole('heading', { name: 'Total Portfolio Value' })).toBeVisible()
  expect(screen.queryByRole('status', { name: 'Loading your finances' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'USD', exact: true }))
  const summary = () => screen.getByRole('heading', { name: 'Total Portfolio Value' }).parentElement?.parentElement
  expect(summary()).toHaveTextContent('$15,00')
  await act(async () => { await router.navigate('/settings') })
  expect(await screen.findByRole('heading', { name: 'Settings content' })).toBeVisible()
  await act(async () => { await router.navigate('/investments') })
  expect(screen.getByRole('heading', { name: 'Total Portfolio Value' })).toBeVisible()
  expect(summary()).toHaveTextContent('$15,00')
  expect(screen.queryByRole('status', { name: 'Loading your finances' })).not.toBeInTheDocument()
  expect(await screen.findByText('Refreshing', { exact: true })).toBeVisible()
  await act(async () => { release(Response.json({ error: 'Synthetic outage' }, { status: 503 })) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Investment portfolio: Showing previously loaded data.')
  expect(summary()).toHaveTextContent('$15,00')
  expect(screen.queryByText('No investment accounts yet')).not.toBeInTheDocument()
  router.dispose()
})
