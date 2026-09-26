import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Analytics } from './Analytics'
import { WIDGET_DEFS } from './widgetConfig'
import type { Account, Transaction } from './types'

vi.mock('../../config', () => ({
  API_BASE_URL: '/api',
  apiFetch: vi.fn(() => new Promise(() => {})),
}))
vi.mock('../../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: 'visible' }),
}))
vi.mock('./IncomeExpensesTrendChart', () => ({
  IncomeExpensesTrendChart: ({ data }: { data: Array<{ income: number }> }) => (
    <div data-testid="income-expenses-trend" data-income={data.reduce((total, point) => total + point.income, 0)} />
  ),
}))

const accounts: Account[] = [
  { id: 'cash', name: 'Cash', type: 'checking', balance: 100, currency: 'HUF' },
  { id: 'investment', name: 'Investments', type: 'investment', balance: 0, currency: 'HUF' },
]
const posted: Transaction = { id: 'posted', account_id: 'cash', date: '2026-09-15', amount: 100, status: 'posted' }

function upcoming(id: string, date: string, amount = 10, overrides: Partial<Transaction> = {}): Transaction {
  return { id, account_id: 'cash', date, amount, status: 'pending', pending_kind: 'upcoming', ...overrides }
}

function renderAnalytics(upcomingTransactions: Transaction[] = []) {
  return render(<Analytics transactions={[posted]} upcomingTransactions={upcomingTransactions} accounts={accounts} categories={[]} />)
}

function income() {
  return screen.getByText('Income').parentElement?.textContent
}

function showIncomeExpensesTrend() {
  const visibility = JSON.parse(localStorage.getItem('analytics-widget-visibility') || '{}')
  localStorage.setItem('analytics-widget-visibility', JSON.stringify({ ...visibility, 'income-expenses-trend': true }))
}

describe('Analytics Projected mode', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 15, 12))
    localStorage.clear()
    localStorage.setItem('analytics-widget-visibility', JSON.stringify(Object.fromEntries(
      WIDGET_DEFS.map(widget => [widget.id, widget.id === 'summary-cards'])
    )))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the switch and keeps Actual values when only other periods or ineligible rows exist', () => {
    renderAnalytics([
      upcoming('october', '2026-10-01'),
      upcoming('review', '2026-09-15', 20, { pending_kind: 'mcp_review' }),
      upcoming('posted-upcoming', '2026-09-15', 30, { status: 'posted' }),
      upcoming('investment', '2026-09-15', 40, { account_id: 'investment' }),
    ])

    expect(screen.queryByRole('button', { name: /Projected/ })).not.toBeInTheDocument()
    expect(income()).toContain('+100')
  })

  it('keeps loading and empty views coherent when an upcoming-only month becomes projectable', () => {
    const props = { transactions: [], accounts, categories: [] }
    const { rerender } = render(<Analytics {...props} loading />)
    expect(screen.queryByRole('button', { name: /Projected/ })).not.toBeInTheDocument()

    rerender(<Analytics {...props} />)
    expect(screen.getByText('No transactions for september')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Projected/ })).not.toBeInTheDocument()

    rerender(<Analytics {...props} upcomingTransactions={[upcoming('only', '2026-09-15')]} />)
    expect(screen.getByRole('button', { name: 'Projected (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Projected (1)' }))
    expect(income()).toContain('+10')
  })

  it('counts both inclusive month boundaries and uses the same rows for projected totals', () => {
    showIncomeExpensesTrend()
    renderAnalytics([
      upcoming('first', '2026-09-01'),
      upcoming('last', '2026-09-30', 20),
      upcoming('before', '2026-08-31', 30),
      upcoming('after', '2026-10-01', 40),
      upcoming('review', '2026-09-15', 50, { pending_kind: 'mcp_review' }),
    ])

    expect(screen.getByRole('button', { name: 'Projected (2)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Projected (2)' }))
    expect(income()).toContain('+130')
    expect(screen.getByTestId('income-expenses-trend')).toHaveAttribute('data-income', '130')
  })

  it('uses inclusive year boundaries and all available dates for All Time', () => {
    renderAnalytics([
      upcoming('first', '2026-01-01'),
      upcoming('last', '2026-12-31', 20),
      upcoming('before', '2025-12-31', 30),
      upcoming('after', '2027-01-01', 40),
    ])

    expect(screen.queryByRole('button', { name: /Projected/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Year' }))
    expect(screen.getByRole('button', { name: 'Projected (2)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Projected (2)' }))
    expect(income()).toContain('+130')
    fireEvent.click(screen.getByRole('button', { name: 'All Time' }))
    expect(screen.getByRole('button', { name: 'Projected (4)' })).toHaveAttribute('aria-pressed', 'false')
    expect(income()).toContain('+100')
    fireEvent.click(screen.getByRole('button', { name: 'Projected (4)' }))
    expect(income()).toContain('+200')
  })

  it('returns to Actual on month navigation and after the last upcoming row is resolved', () => {
    const item = upcoming('september', '2026-09-15')
    const { rerender } = renderAnalytics([item])
    fireEvent.click(screen.getByRole('button', { name: 'Projected (1)' }))
    expect(income()).toContain('+110')

    fireEvent.click(screen.getByRole('button', { name: 'Show previous month' }))
    expect(screen.queryByRole('button', { name: /Projected/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show next month' }))
    expect(screen.getByRole('button', { name: 'Projected (1)' })).toHaveAttribute('aria-pressed', 'false')
    expect(income()).toContain('+100')

    fireEvent.click(screen.getByRole('button', { name: 'Projected (1)' }))
    rerender(<Analytics transactions={[posted]} upcomingTransactions={[]} accounts={accounts} categories={[]} />)
    expect(screen.queryByRole('button', { name: /Projected/ })).not.toBeInTheDocument()
    expect(income()).toContain('+100')
    rerender(<Analytics transactions={[posted]} upcomingTransactions={[item]} accounts={accounts} categories={[]} />)
    expect(screen.getByRole('button', { name: 'Projected (1)' })).toHaveAttribute('aria-pressed', 'false')
    expect(income()).toContain('+100')
  })
})
