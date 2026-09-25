import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AICashOutlookChart } from './AICashOutlookChart'
import type { FinancialOutlookSnapshot } from './types'

vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: 'visible' }) }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ data, children }: { data: Array<{ label: string; actual?: number }>; children: React.ReactNode }) => (
    <div data-testid="forecast-chart" data-first-date={data[0]?.label} data-first-balance={data[0]?.actual} data-last-date={data.at(-1)?.label} data-anchor-balance={data.find(point => point.label === 'Jun 28, 2026')?.actual}>{children}</div>
  ),
  Area: () => null, Line: () => null, ReferenceLine: () => null,
  CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))

function snapshot(generationDate: string, extended = true): FinancialOutlookSnapshot {
  const date = new Date(`${generationDate}T00:00:00Z`)
  const history = Array.from({ length: 90 }, (_, index) => ({
    date: new Date(date.getTime() - (89 - index) * 86_400_000).toISOString().slice(0, 10), balance: 1000,
  }))
  const yearStart = `${Number(generationDate.slice(0, 4)) - 1}${generationDate.slice(4)}`
  return {
    id: generationDate,
    source_queried_at: `${generationDate}T12:00:00.000Z`,
    cash_balance_history: history,
    cash_balance_history_year: extended ? [{ date: yearStart, balance: 800 }, ...history] : [],
    cash_balance_history_alltime: extended ? [{ date: '2020-01-01', balance: 300 }, ...history] : [],
    cash_balance_path: Array.from({ length: 91 }, (_, day) => ({ day, low: 1000, expected: 1000, high: 1000 })),
  } as FinancialOutlookSnapshot
}

const props = { transactions: [], accounts: [], convertToHuf: (value: number) => value }

describe('AICashOutlookChart history ranges', () => {
  it('switches history ranges and anchors the projection to the selected forecast', () => {
    const { rerender } = render(<AICashOutlookChart snapshot={snapshot('2026-09-25')} {...props} />)
    const selector = screen.getByRole('combobox', { name: 'Cash history range' })
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Jun 28, 2026')
    fireEvent.change(selector, { target: { value: '12m' } })
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Sep 25, 2025')
    fireEvent.change(selector, { target: { value: 'all' } })
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Jan 1, 2020')
    rerender(<AICashOutlookChart snapshot={snapshot('2026-08-20')} {...props} />)
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-last-date', 'Nov 18, 2026')
  })

  it('reconstructs available older history from an older forecast without requiring 12 full months', () => {
    const transactions = [
      { id: 'older-cash', account_id: 'cash', date: '2025-10-20', amount: 100, status: 'posted' as const },
      { id: 'income', account_id: 'cash', date: '2026-03-01', amount: 200, status: 'posted' as const },
      { id: 'future', account_id: 'cash', date: '2026-10-01', amount: 500, status: 'posted' as const },
      { id: 'pending', account_id: 'cash', date: '2026-02-01', amount: 900, status: 'pending' as const },
      { id: 'missing-fx', account_id: 'eur', date: '2025-01-01', amount: 300, status: 'posted' as const },
    ]
    render(<AICashOutlookChart snapshot={snapshot('2026-09-25', false)} transactions={transactions} accounts={[{ id: 'cash', name: 'Cash', type: 'checking', balance: 1300, currency: 'HUF' }, { id: 'eur', name: 'EUR cash', type: 'checking', balance: 300, currency: 'EUR' }]} convertToHuf={(value, id) => id === 'cash' ? value : null} />)
    const selector = screen.getByRole('combobox', { name: 'Cash history range' })
    fireEvent.change(selector, { target: { value: '12m' } })
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Oct 20, 2025')
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-balance', '800')
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-anchor-balance', '1000')
    expect(screen.getByText(/reconstructed using current transactions/)).toBeInTheDocument()
    expect(screen.getByText(/no exchange rate/)).toBeInTheDocument()
    fireEvent.change(selector, { target: { value: 'all' } })
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Oct 20, 2025')
  })

  it('uses forecast day zero when a legacy snapshot has no saved actual history', () => {
    const legacy = snapshot('2026-09-25', false)
    legacy.cash_balance_history = []
    render(<AICashOutlookChart snapshot={legacy} transactions={[
      { id: 'income', account_id: 'cash', date: '2025-10-20', amount: 200, status: 'posted' },
      { id: 'later', account_id: 'cash', date: '2026-10-01', amount: 500, status: 'posted' },
    ]} accounts={[{ id: 'cash', name: 'Cash', type: 'checking', balance: 1700, currency: 'HUF' }]} convertToHuf={value => value} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Cash history range' }), { target: { value: 'all' } })
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Oct 20, 2025')
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-balance', '1000')
  })
})
