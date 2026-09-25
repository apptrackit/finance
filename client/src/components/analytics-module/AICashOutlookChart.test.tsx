import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AICashOutlookChart } from './AICashOutlookChart'
import type { FinancialOutlookSnapshot } from './types'

vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: 'visible' }) }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ data, children }: { data: Array<{ label: string }>; children: React.ReactNode }) => (
    <div data-testid="forecast-chart" data-first-date={data[0]?.label} data-last-date={data.at(-1)?.label}>{children}</div>
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

const props = { transactions: [], accounts: [], convertToMasterCurrency: (value: number) => value }

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

  it('keeps unsupported longer ranges unavailable for older snapshots', () => {
    render(<AICashOutlookChart snapshot={snapshot('2026-09-25', false)} {...props} />)
    expect(screen.getByRole('option', { name: '12 months + 90 days' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'All time + 90 days' })).toBeDisabled()
    expect(screen.getByText(/Longer history is available/)).toBeInTheDocument()
  })
})
