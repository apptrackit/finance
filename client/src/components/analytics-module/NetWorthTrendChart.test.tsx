import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetWorthTrendChart } from './NetWorthTrendChart'
import { buildCashBalanceMonthComparison, buildCashBalanceYearComparison } from './cash-balance-comparison'
import type { CashBalanceComparisonPoint } from './cash-balance-comparison'

const state = vi.hoisted(() => ({ privacyMode: 'visible', tooltipDay: 2, points: [] as CashBalanceComparisonPoint[] }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: state.privacyMode }) }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children, data }: { children: ReactNode; data: CashBalanceComparisonPoint[] }) => {
    state.points = data
    return <div>{children}</div>
  },
  Area: ({ dataKey, strokeDasharray }: { dataKey: string; strokeDasharray?: string }) => <div data-testid={`series-${dataKey}`} data-dashes={strokeDasharray} />,
  Line: ({ dataKey, strokeDasharray }: { dataKey: string; strokeDasharray?: string }) => <div data-testid={`series-${dataKey}`} data-dashes={strokeDasharray} />,
  XAxis: ({ ticks, tickFormatter }: { ticks: number[]; tickFormatter: (value: number) => string }) => <div data-testid="axis-day">{ticks.map(tickFormatter).join(',')}</div>,
  YAxis: ({ tickFormatter }: { tickFormatter: (value: number) => string }) => <div data-testid="axis-value">{tickFormatter(1000)}</div>,
  CartesianGrid: () => null,
  Tooltip: ({ content }: { content: (props: unknown) => ReactNode }) => <div data-testid="tooltip">{content({
    active: true, payload: [{ dataKey: 'previous', value: 1000, payload: state.points[state.tooltipDay - 1] }], label: state.tooltipDay,
  })}</div>,
}))

const data = [{ date: '2026-10-01', formattedDate: 'Oct 1', balance: 1200, smoothed: 1200 }, { date: '2026-10-13', formattedDate: 'Oct 13', balance: 1200, smoothed: 1200 }]
const comparison = () => buildCashBalanceMonthComparison({
  accounts: [{ id: 'cash', name: 'Cash', type: 'cash', currency: 'HUF', balance: 1200 }],
  transactions: [{ id: 'opening', account_id: 'cash', date: '2026-09-01', amount: 100, status: 'posted' }, { id: 'change', account_id: 'cash', date: '2026-10-02', amount: 200, status: 'posted' }],
  selectedMonth: '2026-10-01', today: '2026-10-13', masterCurrency: 'HUF', exchangeRates: {},
})
const renderChart = () => render(<NetWorthTrendChart data={data} masterCurrency="HUF" comparison={comparison()} />)
const toggle = () => fireEvent.click(screen.getByRole('button', { name: 'Compare previous month' }))

describe('Cash Balance Trend comparison', () => {
  beforeEach(() => { state.privacyMode = 'visible'; state.tooltipDay = 2; state.points = [] })

  it('shows the trend by default, lets it be hidden, and keeps comparison opt-in', () => {
    renderChart()
    expect(screen.getByRole('button', { name: 'Trend' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-series=reference] path')).toHaveAttribute('stroke-dasharray', '6 3')
    fireEvent.click(screen.getByRole('button', { name: 'Trend' }))
    expect(document.querySelector('[data-series=reference]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Trend' }))
    expect(screen.queryByTestId('series-previous')).not.toBeInTheDocument()
    toggle()
    expect(screen.getByRole('button', { name: 'Compare previous month' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-series=reference]')).toBeNull()
    expect(screen.getByTestId('series-previous')).not.toHaveAttribute('data-dashes')
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByText('Oct 13 vs Sep 13 · latest shared day')).toBeInTheDocument()
    expect(within(screen.getByTestId('tooltip')).getByText('+200 HUF (+20.0%)')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText(/Inspect day/)).not.toBeInTheDocument()
    toggle()
    expect(screen.getByRole('button', { name: 'Compare previous month' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('[data-series=reference]')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /Cash balance/ })).toBeInTheDocument()
  })

  it('shows only the prior actual value on current-month future days in the tooltip', () => {
    state.tooltipDay = 14
    renderChart()
    toggle()
    const tooltip = within(screen.getByTestId('tooltip'))
    expect(tooltip.getByText('Sep 14, 2026')).toBeInTheDocument()
    expect(tooltip.queryByText('Oct 14, 2026')).not.toBeInTheDocument()
    expect(tooltip.queryByText('Difference:')).not.toBeInTheDocument()
    expect(tooltip.getByText('Only the previous month has an actual balance on this day.')).toBeInTheDocument()
  })

  it('masks amounts, deltas, percentages and axes throughout comparison', () => {
    state.privacyMode = 'hidden'
    renderChart()
    expect(screen.getByText('Chart hidden for privacy')).toHaveClass('h-[240px]', 'sm:h-[280px]')
    expect(screen.getByText('••••••')).toBeInTheDocument()
    toggle()
    expect(screen.getByTestId('axis-value')).toHaveTextContent('••••')
    expect(screen.getByTestId('tooltip')).not.toHaveTextContent('HUF')
    expect(screen.getByTestId('tooltip')).not.toHaveTextContent('%')
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(3)
    expect(screen.queryByText(/1[\s\u00a0]?200 HUF/)).not.toBeInTheDocument()
    expect(screen.queryByText(/20.0%/)).not.toBeInTheDocument()
  })

  it('explains unavailable history and projected mode, and hides controls outside Month', () => {
    const unavailable = { ...comparison(), points: [], unavailableReason: 'Not enough cash history to cover the full previous month.' }
    const { rerender } = render(<NetWorthTrendChart data={data} masterCurrency="HUF" comparison={unavailable} />)
    expect(screen.getByRole('button', { name: 'Compare previous month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Compare previous month' })).toHaveAccessibleDescription(unavailable.unavailableReason)
    rerender(<NetWorthTrendChart data={data} masterCurrency="HUF" comparison={comparison()} comparisonDisabledReason="Switch to Actual to compare previous-month balances." />)
    expect(screen.getByRole('button', { name: 'Compare previous month' })).toBeDisabled()
    expect(screen.getByText('Switch to Actual to compare previous-month balances.')).toBeInTheDocument()
    rerender(<NetWorthTrendChart data={data} masterCurrency="HUF" />)
    expect(screen.queryByRole('button', { name: 'Compare previous month' })).not.toBeInTheDocument()
  })

  it('uses the last common day for short months and omits percentages for zero/negative previous balances', () => {
    state.tooltipDay = 31
    const result = comparison()
    result.points = result.points.map((point): CashBalanceComparisonPoint => ({ ...point, previous: point.day <= 28 ? 0 : null, previousDate: point.day <= 28 ? `2026-02-${String(point.day).padStart(2, '0')}` : null, selected: -100, selectedDate: `2026-03-${String(point.day).padStart(2, '0')}` }))
    result.selectedStart = '2026-03-01'
    result.previousStart = '2026-02-01'
    render(<NetWorthTrendChart data={data} masterCurrency="HUF" comparison={result} />)
    toggle()
    expect(screen.getByText('Mar 28 vs Feb 28 · latest shared day')).toBeInTheDocument()
    expect(screen.getAllByText('-100 HUF').length).toBeGreaterThan(0)
    expect(screen.getByText('The previous month has no matching calendar day.')).toBeInTheDocument()
    expect(screen.getByTestId('tooltip')).not.toHaveTextContent('%')
  })

  it('labels the main chart on calendar days', () => {
    renderChart()
    const labels = [...document.querySelectorAll('[data-axis-label=x]')].map(label => label.textContent)
    expect(labels).toEqual(['Oct 1', 'Oct 3', 'Oct 5', 'Oct 7', 'Oct 9', 'Oct 11', 'Oct 13'])
  })

  it('keeps the plot height and toggle slots when comparing', () => {
    renderChart()
    const plots = () => document.querySelectorAll('.h-\\[240px\\].sm\\:h-\\[280px\\]')
    const order = () => [...screen.getByRole('button', { name: 'Compare previous month' }).parentElement!.children].map(button => button.textContent)
    expect(plots()).toHaveLength(1)
    expect(order()).toEqual(['Trend', 'Compare previous month'])
    toggle()
    expect(plots()).toHaveLength(1)
    expect(order()).toEqual(['Trend', 'Compare previous month'])
    expect(screen.getByText('Trend', { selector: 'button' })).toHaveClass('invisible')
    expect(screen.getByText('+200 HUF')).toBeInTheDocument()
    expect(screen.getByText('+20.0%', { selector: '.easyui-chart-positive', exact: false })).toBeInTheDocument()
  })

  it('compares a year with the previous year on month ticks', () => {
    const yearly = buildCashBalanceYearComparison({
      accounts: [{ id: 'cash', name: 'Cash', type: 'cash', currency: 'HUF', balance: 1200 }],
      transactions: [{ id: 'opening', account_id: 'cash', date: '2025-01-01', amount: 100, status: 'posted' }, { id: 'change', account_id: 'cash', date: '2026-10-02', amount: 200, status: 'posted' }],
      selectedYear: '2026-01-01', today: '2026-10-13', masterCurrency: 'HUF', exchangeRates: {},
    })
    state.tooltipDay = yearly.points.findIndex(point => point.selectedDate === '2026-10-13') + 1
    render(<NetWorthTrendChart data={data} masterCurrency="HUF" comparison={yearly} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compare previous year' }))
    expect(screen.getByRole('button', { name: 'Compare previous year' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(screen.getByTestId('axis-day')).toHaveTextContent('Jan,Mar,May,Jul,Sep,Nov')
    expect(screen.getByText('Oct 13 vs Oct 13 · latest shared day')).toBeInTheDocument()
    expect(within(screen.getByTestId('tooltip')).getByText('+200 HUF (+20.0%)')).toBeInTheDocument()
  })
})
