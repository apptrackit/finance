import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const state = vi.hoisted(() => ({ hidden: false, netWorthOnly: false, finance: {} as Record<string, unknown> }))
vi.mock('react-router', async importOriginal => ({ ...await importOriginal<typeof import('react-router')>(), useOutletContext: () => ({ finance: state.finance, masterCurrency: 'HUF' }) }))
vi.mock('../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: state.hidden ? 'hidden' : 'visible', shouldHideNetWorth: () => state.hidden || state.netWorthOnly }) }))
vi.mock('../components/dashboard-module/TransactionList', () => ({ TransactionList: () => <div>Ledger</div> }))

beforeEach(() => {
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
const mount = () => render(<MemoryRouter initialEntries={['/dashboard?from=2026-10-01&to=2026-10-31']}><DashboardPage /></MemoryRouter>)

describe('dashboard summary', () => {
  it('shows current balances, period activity, and only upcoming cash changes', () => {
    mount()
    const summary = screen.getByRole('region', { name: 'Dashboard summary' })
    expect(summary).toHaveTextContent('105 000 HUF')
    expect(summary).toHaveTextContent('100 000 HUF')
    expect(summary).toHaveTextContent('−1 000 HUF after 1 upcoming')
    expect(summary).toHaveTextContent('40% of income spent')
    expect(summary).toHaveTextContent('30 000 HUF')
    expect(summary).not.toHaveTextContent('9 000')
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
