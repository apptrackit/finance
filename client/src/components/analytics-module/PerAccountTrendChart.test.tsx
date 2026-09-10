import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PerAccountTrendChart } from './PerAccountTrendChart'

vi.mock('../../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: 'visible' }),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: ({ content }: { content: (props: unknown) => React.ReactNode }) => (
    <>{content({ active: true, payload: [{ dataKey: 'balance', value: 16_402 }], label: 'Sep 3' })}</>
  ),
}))

describe('PerAccountTrendChart', () => {
  it('uses the account currency for its balance, axis data, and tooltip instead of the reporting currency', () => {
    render(
      <PerAccountTrendChart
        account={{ id: 'mxn', name: 'Revolut MXN', type: 'cash', balance: 2_223, currency: 'MXN' }}
        data={[{ date: '2026-09-03', formattedDate: 'Sep 3', balance: 16_402 }]}
        index={0}
      />
    )

    expect(screen.getByText(/2[\s\u00a0]?223 MXN/)).toBeInTheDocument()
    expect(screen.getByText(/16[\s\u00a0]?402 MXN/)).toBeInTheDocument()
    expect(screen.queryByText(/HUF/)).not.toBeInTheDocument()
  })
})
