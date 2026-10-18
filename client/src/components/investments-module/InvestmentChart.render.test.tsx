import { cloneElement } from 'react'
import type { ReactElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InvestmentChart } from './InvestmentChart'
import { normalizeYahoo } from '../../../../shared/market-provider'
import { yahooFixture } from '../../../../tests/fixtures/market-data'
// Keep the real chart/axes/selectors. Only the physical container size needs a
// jsdom replacement; mocking the chart itself concealed mixed-series domains.
vi.mock('recharts', async (original) => ({
  ...(await original<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
    cloneElement(children, { width: 600, height: 240 }),
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('keeps daily prices in the visible axis domain when execution scatter data is supplied', async () => {
  const now = Date.now(),
    history = normalizeYahoo(
      yahooFixture(now),
      'TEST',
      new Date(now - 30 * 86400000).toISOString().slice(0, 10),
      now,
    ).history
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(history)))
  render(
    <InvestmentChart
      symbol="TEST"
      averageCost={20}
      costCurrency="EUR"
      transactions={[
        {
          id: 'low-fill',
          date: history.points[1].date,
          amount: 10,
          quantity: 1,
          price: 10,
          execution_currency: 'EUR',
        },
      ]}
    />,
  )
  await screen.findByText(/110 EUR/)
  await waitFor(() => {
    const plot = screen.getByLabelText('Daily instrument price history')
    const ticks = [
      ...plot.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value'),
    ].map((n) => Number(n.textContent?.replaceAll(',', '')))
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(110)
    expect(plot.querySelector('.recharts-area-curve')).toHaveAttribute('d', expect.stringContaining('L'))
    expect(plot.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(1)
  })
})
it('renders daily history without inventing executions from empty scatter series', async () => {
  const now = Date.now(),
    history = normalizeYahoo(
      yahooFixture(now),
      'TEST',
      new Date(now - 30 * 86400000).toISOString().slice(0, 10),
      now,
    ).history
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(history)))
  render(<InvestmentChart symbol="TEST" />)
  await screen.findByText(/110 EUR/)
  await waitFor(() =>
    expect(
      screen.getByLabelText('Daily instrument price history').querySelector('.recharts-area-curve'),
    ).not.toBeNull(),
  )
  expect(
    screen.getByLabelText('Daily instrument price history').querySelectorAll('.recharts-scatter-symbol'),
  ).toHaveLength(0)
})
