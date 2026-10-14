import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { appRoutes } from '../navigation/routes'
import { ThemeProvider } from '../context/ThemeContext'
import { AlertProvider } from '../context/AlertContext'
import type { Account, Transaction } from '../hooks/useFinanceData'

vi.mock('../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: 'hidden', togglePrivacyMode: vi.fn(), shouldHideNetWorth: () => true }),
}))
vi.mock('../components/settings-module/Settings', () => ({ default: () => <div>Settings</div> }))
vi.mock('../components/settings-module/settings.storage', () => ({
  getMasterCurrency: () => 'HUF',
  getStoredMenuVisibility: () => ({ dashboard: true, analytics: true, investments: true, recurring: true }),
  loadNavigationSettings: async () => ({ dashboard: true, analytics: true, investments: true, recurring: true }),
}))
vi.mock('../components/dashboard-module/AccountList', () => ({
  AccountList: ({ accounts }: { accounts: Account[] }) => <div>{accounts.length ? 'Loaded accounts' : 'No accounts yet'}</div>,
}))
vi.mock('../components/dashboard-module/TransactionList', () => ({
  TransactionList: ({ transactions, composerOnly }: { transactions: Transaction[]; composerOnly?: boolean }) => composerOnly ? null : <div>{transactions.length ? 'Loaded ledger' : 'No transactions yet'}</div>,
}))
vi.mock('../components/analytics-module/Analytics', () => ({
  Analytics: ({ transactions }: { transactions: Transaction[] }) => <div>{transactions.length ? 'Loaded analytics' : 'Empty analytics'}</div>,
}))
vi.mock('../components/investments-module/Investments', () => ({ Investments: () => <div>Investments</div> }))
vi.mock('../components/dashboard-module/RecurringTransactions', () => ({ RecurringTransactions: () => <div>Loaded recurring transactions</div> }))

const payloads: Record<string, unknown> = {}
const failures = new Set<string>()
const fetchMock = vi.fn<typeof fetch>()
const browserStorage = window.localStorage

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('localStorage', browserStorage)
  localStorage.clear()
  vi.stubGlobal('scrollTo', vi.fn())
  failures.clear()
  Object.assign(payloads, {
    '/accounts': [{ id: 'cash', name: 'Private account', type: 'cash', balance: 98765, currency: 'HUF', updated_at: 1 }],
    '/transactions': [{ id: 'transaction', account_id: 'cash', amount: -54321, date: '2026-09-01' }],
    '/transactions/date-range': [{ id: 'transaction', account_id: 'cash', amount: -54321, date: '2026-09-01' }],
    '/financial-outlook/latest': { snapshot: null }, '/financial-outlook-snapshots': { snapshots: [], next_cursor: null },
    '/transactions/upcoming': [], '/categories': [], '/dashboard/net-worth': { net_worth: 98765 },
    '/v6/latest/HUF': { rates: { HUF: 1 } },
  })
  fetchMock.mockImplementation(async input => {
    const url = new URL(String(input), 'http://localhost')
    const requestPath = url.pathname.replace(/^\/api/, '')
    const path = requestPath === '/transactions/history'
      ? (url.searchParams.has('startDate') ? '/transactions/date-range' : '/transactions') : requestPath
    if (failures.has(path)) return Response.json({ error: 'Private account balance 98765' }, { status: 403 })
    return Response.json(requestPath === '/transactions/history'
      ? { transactions: payloads[path], investments: [], revision: 1, nextCursor: null } : payloads[path] ?? [])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function renderApp(path = '/dashboard') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  return render(<ThemeProvider><AlertProvider><RouterProvider router={router} /></AlertProvider></ThemeProvider>)
}

function navigate(label: string) { fireEvent.click(screen.getAllByRole('link', { name: label })[0]) }

async function retry() {
  const button = screen.getByRole('button', { name: 'Retry' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}

describe('finance read errors in App', () => {
  it('keeps the Analytics initial loader until saved forecasts settle too', async () => {
    const baseFetch = fetchMock.getMockImplementation()!
    let release: (response: Response) => void = () => {}
    fetchMock.mockImplementation(async (input, options) => String(input).includes('/financial-outlook/latest')
      ? new Promise(resolve => { release = resolve }) : baseFetch(input, options))
    renderApp('/analytics')
    await waitFor(() => expect(screen.getByText('Loaded analytics')).not.toBeVisible())
    expect(screen.getAllByRole('status', { name: 'Loading your finances' })).toHaveLength(1)
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/financial-outlook/latest'))).toBe(true))
    release(Response.json({ snapshot: null }))
    await waitFor(() => expect(screen.getByText('Loaded analytics')).toBeVisible())
    expect(screen.queryByRole('status', { name: 'Loading your finances' })).not.toBeInTheDocument()
  })

  it('releases the initial loader after a forecast failure and offers Retry with available Analytics intact', async () => {
    failures.add('/financial-outlook/latest')
    renderApp('/analytics')
    expect(await screen.findByRole('alert')).toHaveTextContent('Financial forecasts: Unavailable.')
    await waitFor(() => expect(screen.getByText('Loaded analytics')).toBeVisible())
    expect(screen.queryByRole('status', { name: 'Loading your finances' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Private account balance/)).not.toBeInTheDocument()
    failures.clear()
    await retry()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it.each(['/dashboard', '/analytics'])('shows one initial loading screen for %s while the page data is incomplete', async path => {
    const baseFetch = fetchMock.getMockImplementation()!
    let release: (response: Response) => void = () => {}
    fetchMock.mockImplementation(async (input, options) => String(input).includes('/transactions/history')
      ? new Promise(resolve => { release = resolve }) : baseFetch(input, options))
    renderApp(path)
    expect(screen.getAllByRole('status', { name: 'Loading your finances' })).toHaveLength(1)
    expect(screen.queryByText('Loaded ledger')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/transactions/history'))).toBe(true))
    release(Response.json({ transactions: payloads['/transactions'], investments: [], revision: 1, nextCursor: null }))
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading your finances' })).not.toBeInTheDocument())
    expect(screen.getByText(path === '/dashboard' ? 'Loaded ledger' : 'Loaded analytics')).toBeVisible()
  })

  it('requests complete history only after Analytics or global search opens', async () => {
    renderApp()
    expect(await screen.findByText('Loaded ledger')).toBeInTheDocument()
    const fullReads = () => fetchMock.mock.calls.filter(([input]) => String(input) === '/api/transactions/history?limit=500')
    expect(fullReads()).toHaveLength(0)
    navigate('Analytics')
    expect(await screen.findByText('Loaded analytics')).toBeInTheDocument()
    expect(fullReads()).toHaveLength(1)
    navigate('Dashboard')
    expect(await screen.findByText('Loaded ledger')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Search everything' })[0])
    await waitFor(() => expect(fullReads()).toHaveLength(2))
    expect(await screen.findByRole('combobox', { name: 'Search everything' })).toBeInTheDocument()
  })

  it('loads Analytics directly without also downloading the Dashboard period', async () => {
    renderApp('/analytics?period=allTime')
    expect(await screen.findByText('Loaded analytics')).toBeInTheDocument()
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toContain('/api/transactions/history?limit=500')
    expect(urls.some(url => url.includes('/transactions/history?') && url.includes('startDate='))).toBe(false)
  })

  it('shows a private, accessible initial load error and enables Retry after dependent loads fail', async () => {
    failures.add('/accounts')
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('Accounts: Unavailable.')
    expect(screen.queryByText('No accounts yet')).not.toBeInTheDocument()
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
    expect(screen.queryByText(/Private account/)).not.toBeInTheDocument()
    expect(screen.queryByText(/98765/)).not.toBeInTheDocument()
    failures.clear()
    await retry()
    expect(await screen.findByText('Loaded accounts')).toBeInTheDocument()
    expect(await screen.findByText('Loaded ledger')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('keeps successful accounts visible during a partial ledger failure', async () => {
    failures.add('/transactions/date-range')
    renderApp()
    expect(await screen.findByText('Loaded accounts')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Period transactions: Unavailable.')
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Loaded ledger')).not.toBeInTheDocument()
  })

  it('keeps the last successful ledger visible and marks it stale after a failed refresh', async () => {
    failures.add('/categories')
    renderApp()
    expect(await screen.findByText('Loaded ledger')).toBeInTheDocument()
    failures.clear()
    failures.add('/transactions/date-range')
    await retry()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Period transactions: Showing previously loaded data.'))
    expect(screen.getByText('Loaded ledger')).toBeInTheDocument()
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
    failures.clear()
    await retry()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows the normal empty state only after successful empty reads', async () => {
    payloads['/accounts'] = []
    payloads['/transactions'] = []
    payloads['/transactions/date-range'] = []
    renderApp()
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces failed complete history in Analytics without claiming an empty history', async () => {
    failures.add('/transactions')
    renderApp()
    expect(await screen.findByText('Loaded ledger')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    navigate('Analytics')
    expect(await screen.findByRole('alert')).toHaveTextContent('Transaction history: Unavailable.')
    expect(screen.queryByText('Empty analytics')).not.toBeInTheDocument()
    failures.clear()
    await retry()
    expect(await screen.findByText('Loaded analytics')).toBeInTheDocument()
  })

  it('shows category errors where categories are required for recurring transactions', async () => {
    failures.add('/categories')
    renderApp()
    await screen.findByRole('alert')
    navigate('Recurring')
    expect(screen.getByRole('alert')).toHaveTextContent('Categories: Unavailable.')
    expect(screen.queryByText('Loaded recurring transactions')).not.toBeInTheDocument()
  })
  it('shows missing FX without leaking private values and recovers after retry', async () => {
    payloads['/accounts'] = [
      { id: 'cash', name: 'Private HUF', type: 'cash', balance: 100000, currency: 'HUF', updated_at: 1 },
      { id: 'usd', name: 'Private USD', type: 'cash', balance: 100, currency: 'USD', updated_at: 1 },
      { id: 'eur', name: 'Private EUR', type: 'cash', balance: 100, currency: 'EUR', updated_at: 1 },
    ]
    payloads['/dashboard/net-worth'] = { net_worth: null, missing_currencies: ['EUR'] }
    payloads['/v6/latest/HUF'] = { rates: { HUF: 1, USD: 1 / 360 } }
    payloads['/transactions/upcoming'] = [{ id: 'upcoming', account_id: 'eur', amount: 20, date: '2026-09-30', status: 'pending', pending_kind: 'upcoming' }]
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing or invalid exchange rates: EUR')
    expect(await screen.findByText('Projection unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/Private HUF|Private USD|Private EUR|100000/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
    payloads['/dashboard/net-worth'] = { net_worth: 176000, missing_currencies: [] }
    payloads['/v6/latest/HUF'] = { rates: { HUF: 1, USD: 1 / 360, EUR: 1 / 400 } }
    fireEvent.click(screen.getByRole('button', { name: 'Retry rates' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.queryByText('Projection unavailable')).not.toBeInTheDocument()
  })

})
