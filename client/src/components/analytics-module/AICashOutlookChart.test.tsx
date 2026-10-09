import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AICashOutlookChart } from './AICashOutlookChart'
import type { FinancialOutlookSnapshot } from './types'

const privacy = vi.hoisted(() => ({ mode: 'visible', tooltip: false }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: privacy.mode }) }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ data, children }: { data: Array<{ label: string; actual?: number }>; children: React.ReactNode }) => (
    <div data-testid="forecast-chart" data-points={JSON.stringify(data)} data-first-date={data[0]?.label} data-first-balance={data[0]?.actual} data-last-date={data.at(-1)?.label} data-anchor-balance={data.find(point => point.label === 'Jun 28, 2026')?.actual}>{children}</div>
  ),
  Area: () => null, Line: () => null, ReferenceLine: () => null,
  CartesianGrid: () => null, XAxis: () => null,
  YAxis: ({ tickFormatter }: { tickFormatter: (value: number) => string }) => <span data-testid="cash-axis">{tickFormatter(-1_200_000)}</span>,
  Tooltip: ({ content }: { content: (props: { active: boolean; payload: Array<{ payload: object }> }) => React.ReactNode }) => privacy.tooltip ? content({ active: true, payload: [{ payload: { label: 'Oct 2, 2026', isForecast: true, expected: 12345, low: 11234, high: 14567 } }] }) : null,
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
  it('switches to 30-day history while preserving the full forecast and bounded ranges', () => {
    const report = snapshot('2026-09-25')
    report.cash_balance_path[7] = { day: 7, low: -100, expected: 200, high: 500 }
    const saved = JSON.stringify(report)
    render(<AICashOutlookChart snapshot={report} {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }))
    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked()
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Aug 27, 2026')
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-last-date', 'Dec 24, 2026')
    const data = JSON.parse(screen.getByTestId('forecast-chart').getAttribute('data-points')!)
    expect(data.find((point: { label: string }) => point.label === 'Oct 2, 2026').range).toEqual([-100, 500])
    expect(JSON.stringify(report)).toBe(saved)
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Jun 28, 2026')
  })

  it('masks forecast tooltip amounts and chart axes in hidden privacy mode', () => {
    privacy.tooltip = true
    const { rerender } = render(<AICashOutlookChart snapshot={snapshot('2026-09-25')} {...props} />)
    expect(screen.getByText(/12\s345 HUF/)).toBeInTheDocument()
    expect(screen.getByTestId('cash-axis')).toHaveTextContent('-1.2M')
    privacy.mode = 'hidden'
    rerender(<AICashOutlookChart snapshot={snapshot('2026-09-25')} {...props} />)
    expect(screen.queryByText(/12\s345 HUF/)).not.toBeInTheDocument()
    expect(screen.queryByText(/11\s234/)).not.toBeInTheDocument()
    expect(screen.queryByText(/14\s567/)).not.toBeInTheDocument()
    expect(screen.getByTestId('cash-axis')).toHaveTextContent('••••')
    privacy.mode = 'visible'
    privacy.tooltip = false
  })

  it('retains daily spikes in all-time history and prefers saved daily values to monthly samples', () => {
    const report = snapshot('2026-09-25')
    report.cash_balance_history_year = [
      { date: '2025-09-25', balance: 800 },
      { date: '2026-04-10', balance: 3000 },
      { date: '2026-04-11', balance: 1500 },
      { date: '2026-04-30', balance: 1200 },
      ...report.cash_balance_history,
    ]
    report.cash_balance_history_alltime = [
      { date: '2020-01-01', balance: 300 },
      { date: '2026-04-30', balance: 1199 },
      { date: '2026-09-25', balance: 999 },
    ]
    const saved = JSON.stringify(report)
    render(<AICashOutlookChart snapshot={report} {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: '1 year' }))
    const year = JSON.parse(screen.getByTestId('forecast-chart').getAttribute('data-points')!)
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }))
    const all = JSON.parse(screen.getByTestId('forecast-chart').getAttribute('data-points')!)
    expect(all.filter((point: { timestamp: number }) => point.timestamp >= year[0].timestamp)).toEqual(year)
    expect(all.find((point: { label: string }) => point.label === 'Apr 10, 2026').actual).toBe(3000)
    expect(all.find((point: { label: string }) => point.label === 'Sep 25, 2026')).toMatchObject({ actual: 1000, expected: 1000, isForecast: false })
    expect(screen.getByText(/uses saved monthly balances/)).toBeInTheDocument()
    expect(JSON.stringify(report)).toBe(saved)
  })

  it('uses only daily points when all available history fits within the saved year', () => {
    const report = snapshot('2026-09-25')
    report.cash_balance_history_alltime = [{ date: '2026-06-30', balance: 900 }, { date: '2026-09-25', balance: 1000 }]
    report.cash_balance_history_year = report.cash_balance_history
    render(<AICashOutlookChart snapshot={report} {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }))
    expect(screen.queryByText(/uses saved monthly balances/)).not.toBeInTheDocument()
    const all = JSON.parse(screen.getByTestId('forecast-chart').getAttribute('data-points')!)
    expect(all.filter((point: { actual?: number }) => point.actual !== undefined)).toHaveLength(88)
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Jun 30, 2026')
    expect(all.find((point: { label: string }) => point.label === 'Jun 30, 2026').actual).toBe(1000)
  })

  it('switches history ranges and anchors the projection to the selected forecast', () => {
    const { rerender } = render(<AICashOutlookChart snapshot={snapshot('2026-09-25')} {...props} />)
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Jun 28, 2026')
    fireEvent.click(screen.getByRole('radio', { name: '1 year' }))
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Sep 25, 2025')
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }))
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
    fireEvent.click(screen.getByRole('radio', { name: '1 year' }))
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Oct 20, 2025')
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-balance', '800')
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-anchor-balance', '1000')
    expect(screen.getByText(/reconstructed using current transactions/)).toBeInTheDocument()
    expect(screen.getByText(/no exchange rate/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }))
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Oct 20, 2025')
  })

  it('uses forecast day zero when a legacy snapshot has no saved actual history', () => {
    const legacy = snapshot('2026-09-25', false)
    legacy.cash_balance_history = []
    render(<AICashOutlookChart snapshot={legacy} transactions={[
      { id: 'income', account_id: 'cash', date: '2025-10-20', amount: 200, status: 'posted' },
      { id: 'later', account_id: 'cash', date: '2026-10-01', amount: 500, status: 'posted' },
    ]} accounts={[{ id: 'cash', name: 'Cash', type: 'checking', balance: 1700, currency: 'HUF' }]} convertToHuf={value => value} />)
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }))
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-date', 'Oct 20, 2025')
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-first-balance', '1000')
  })
})
