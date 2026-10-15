import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const state = vi.hoisted(() => ({ hidden: false, netWorthOnly: false, finance: {} as Record<string, unknown> }))
vi.mock('react-router', async importOriginal => ({ ...await importOriginal<typeof import('react-router')>(), useOutletContext: () => ({ finance: state.finance, masterCurrency: 'HUF' }) }))
vi.mock('../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: state.hidden ? 'hidden' : 'visible', shouldHideNetWorth: () => state.hidden || state.netWorthOnly }) }))
vi.mock('../components/dashboard-module/TransactionList', () => ({ TransactionList: () => <div>Ledger</div> }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  state.hidden = false
  state.netWorthOnly = false
  const loaded = { loaded: true, loading: false, stale: false, error: false }
  state.finance = {
    accounts: [{ id: 'cash', name: 'Cash account', balance: 100000, currency: 'HUF', type: 'cash' }],
    transactions: [{ id: 'income', account_id: 'cash', amount: 50000 }, { id: 'expense', account_id: 'cash', amount: -20000 }],
    upcomingTransactions: [{ id: 'upcoming', account_id: 'cash', amount: -1000, date: '2026-10-20', pending_kind: 'upcoming' },
      { id: 'draft', account_id: 'cash', amount: -9000, date: '2026-10-20', pending_kind: 'mcp_review' }],
    categories: [], netWorth: 100000, investmentValue: 5000, usableExchangeRates: { HUF: 1 }, netWorthMissingCurrencies: [], investmentMissingCurrencies: [], handleDataChange: vi.fn(),
    dataStatus: Object.fromEntries(['accounts', 'transactions', 'upcoming', 'categories', 'netWorth', 'investment', 'exchangeRates'].map(key => [key, loaded])),
  }
})
afterEach(() => vi.useRealTimers())
const mount = (path = '/dashboard?from=2026-10-01&to=2026-10-31') => render(<MemoryRouter initialEntries={[path]}><DashboardPage /></MemoryRouter>)

describe('dashboard summary', () => {
  it('omits empty upcoming and investment details', () => {
    state.finance.upcomingTransactions = []
    state.finance.investmentValue = 0
    mount()
    expect(screen.getByRole('region', { name: 'Dashboard summary' })).not.toHaveTextContent(/upcoming|Incl\./i)
  })

  it('shows current balances, period activity, and only upcoming cash changes', () => {
    mount()
    const summary = screen.getByRole('region', { name: 'Dashboard summary' })
    expect(summary).toHaveTextContent('105 000 HUF')
    expect(summary).toHaveTextContent('Incl. 5 000 HUF investments')
    expect(summary).toHaveTextContent('100 000 HUF')
    expect(summary).toHaveTextContent('−1 000 HUF after 1 upcoming')
    expect(summary).toHaveTextContent('40% of income spent')
    expect(summary).toHaveTextContent('30 000 HUF')
    expect(summary).not.toHaveTextContent('9 000')
    expect(summary).not.toHaveTextContent('+0 upcoming')
    expect(summary).not.toHaveTextContent('Spent')
    expect(summary).toHaveTextContent('Expense')
    expect(within(summary).getAllByText('+50 000', { exact: false }).some(element => element.classList.contains('text-success'))).toBe(true)
    expect(within(summary).getAllByText('−20 000', { exact: false }).some(element => element.classList.contains('text-destructive'))).toBe(true)
    expect(summary).toHaveTextContent('−1 000 upcoming')
    expect(screen.getByRole('button', { name: /Choose period: October 2026/ })).toBeInTheDocument()
  })

  it('masks balances, cash deltas, leftovers, ratios, and the spending bar', () => {
    state.hidden = true
    mount()
    const summary = screen.getByRole('region', { name: 'Dashboard summary' })
    expect(summary).not.toHaveTextContent(/105 000|100 000|30 000|40%|−1 000/)
    expect(summary).toHaveTextContent('••%')
    expect(within(summary).queryByRole('button', { name: 'Show net worth' })).not.toBeInTheDocument()
    expect(summary.querySelector('[style*="width: 40%"]')).toBeNull()
  })

  it('supports the separate startup net-worth preference without hiding cash', () => {
    state.netWorthOnly = true
    mount()
    const summary = screen.getByRole('region', { name: 'Dashboard summary' })
    expect(summary).not.toHaveTextContent('105 000')
    expect(summary).toHaveTextContent('100 000')
    fireEvent.click(screen.getByRole('button', { name: 'Show net worth' }))
    expect(summary).toHaveTextContent('105 000')
  })

  it('keeps native values and makes required missing-rate totals unavailable', () => {
    state.finance.accounts = [{ id: 'cash', name: 'Foreign account', balance: 10, currency: 'MXN', type: 'cash' }]
    state.finance.netWorth = null
    state.finance.netWorthMissingCurrencies = ['MXN']
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent('MXN')
    expect(screen.getByRole('region', { name: 'Dashboard summary' })).toHaveTextContent('Unavailable')
    expect(screen.getByRole('region', { name: 'Dashboard summary' })).not.toHaveTextContent('40%')
  })
})


describe('dashboard period context', () => {
  it.each([
    ['/dashboard', 'October so far', '16 days left'],
    ['/dashboard?from=2026-10-01&to=2026-10-31', 'October activity', null],
    ['/dashboard?from=2026-10-10&to=2026-10-20', 'Period activity', null],
    ['/dashboard?from=2026-09-20&to=2026-11-10', 'Period activity', null],
    ['/dashboard?from=2026-09-01&to=2026-09-30', 'September activity', null],
    ['/dashboard?from=2026-11-01&to=2026-11-30', 'November activity', null],
    ['/dashboard?range=allTime', 'All time', null],
    ['/dashboard?from=2026-10-10&to=2026-10-20&view=calendar', 'October activity', null],
  ])('shows accurate period context for %s', (path, heading, countdown) => {
    mount(path)
    const summary = screen.getByRole('region', { name: 'Dashboard summary' })
    expect(within(summary).getByRole('heading', { name: heading })).toBeInTheDocument()
    if (countdown) expect(summary).toHaveTextContent(countdown)
    else expect(summary).not.toHaveTextContent(/days? left/)
  })

  it.each([
    [new Date(2026, 9, 25, 23, 59), '6 days left'],
    [new Date(2026, 9, 30, 23, 59), '1 day left'],
    [new Date(2026, 9, 31, 23, 59), '0 days left'],
    [new Date(2024, 1, 28, 23, 59), '1 day left'],
    [new Date(2026, 11, 31, 23, 59), '0 days left'],
    [new Date(2027, 0, 1, 0, 1), '30 days left'],
  ])('counts local calendar days at %s', (now, countdown) => {
    vi.setSystemTime(now)
    mount('/dashboard')
    expect(screen.getByRole('region', { name: 'Dashboard summary' })).toHaveTextContent(countdown)
  })
})
