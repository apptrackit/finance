import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
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
  TransactionList: ({ transactions }: { transactions: Transaction[] }) => <div>{transactions.length ? 'Loaded ledger' : 'No transactions yet'}</div>,
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
  vi.stubGlobal('localStorage', browserStorage)
  localStorage.clear()
  vi.stubGlobal('scrollTo', vi.fn())
  failures.clear()
  Object.assign(payloads, {
    '/accounts': [{ id: 'cash', name: 'Private account', type: 'cash', balance: 98765, currency: 'HUF', updated_at: 1 }],
    '/transactions': [{ id: 'transaction', account_id: 'cash', amount: -54321, date: '2026-09-01' }],
    '/transactions/date-range': [{ id: 'transaction', account_id: 'cash', amount: -54321, date: '2026-09-01' }],
    '/transactions/upcoming': [], '/categories': [], '/dashboard/net-worth': { net_worth: 98765 },
    '/v6/latest/HUF': { rates: { HUF: 1 } },
  })
  fetchMock.mockImplementation(async input => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
    if (failures.has(path)) return Response.json({ error: 'Private account balance 98765' }, { status: 403 })
    return Response.json(payloads[path] ?? [])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function navigate(label: string) { fireEvent.click(screen.getAllByRole('button', { name: label })[0]) }

async function retry() {
  const button = screen.getByRole('button', { name: 'Retry' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}

describe('finance read errors in App', () => {
  it('shows a private, accessible initial load error and enables Retry after dependent loads fail', async () => {
    failures.add('/accounts')
    render(<App />)
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
    render(<App />)
    expect(await screen.findByText('Loaded accounts')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Period transactions: Unavailable.')
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Loaded ledger')).not.toBeInTheDocument()
  })

  it('keeps the last successful ledger visible and marks it stale after a failed refresh', async () => {
    failures.add('/categories')
    render(<App />)
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
    render(<App />)
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces failed complete history in Analytics without claiming an empty history', async () => {
    failures.add('/transactions')
    render(<App />)
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
    render(<App />)
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
    render(<App />)
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
