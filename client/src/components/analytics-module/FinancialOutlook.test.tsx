import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FinancialOutlook } from './FinancialOutlook'
import type { FinancialOutlookSnapshot } from './types'

const privacy = vi.hoisted(() => ({ mode: 'visible' }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: privacy.mode }) }))
vi.mock('./AICashOutlookChart', () => ({ AICashOutlookChart: () => <div>Cash chart</div> }))

const report: FinancialOutlookSnapshot = {
  id: 'forecast', currency: 'HUF', source_revision: 1,
  source_queried_at: '2026-09-25T23:30:00Z', created_at: '2026-09-26T00:05:00Z',
  headline: 'Cash stays stable with expected income.',
  data_quality: { score: 80, label: 'high', reasons: [] }, source_coverage: {},
  horizons: [
    { days: 7, cash_balance: { low: 700, expected: 800, high: 900 } },
    { days: 30, cash_balance: { low: 1000, expected: 1200, high: 1400 } },
    { days: 90, cash_balance: { low: 600, expected: 1000, high: 1500 } },
  ],
  cash_balance_path: [{ day: 0, low: 1000, expected: 1000, high: 1000 }],
  cash_balance_history: [], cash_balance_history_year: [], cash_balance_history_alltime: [],
  risks: ['Income may arrive late.'], suggestions: ['Review recurring bills.'],
  drivers: ['Recent cash movements.'], assumptions: ['Income continues.'],
  freshness: { status: 'historical', data_changed: false, age_days: 14, active_horizons: [30, 90], expired_horizons: [7], regeneration_recommended: true },
}

function props(snapshot: FinancialOutlookSnapshot | null = report) {
  return { snapshot, history: [report], selectedId: snapshot?.id ?? null, onSelect: vi.fn(), onLoadMore: vi.fn(), hasMore: true, transactions: [], accounts: [], convertToHuf: (value: number) => value }
}

describe('FinancialOutlook redesign', () => {
  it('shows snapshot cash, signed deltas, expiration, and source-calendar horizon dates', () => {
    privacy.mode = 'visible'
    render(<FinancialOutlook {...props()} />)
    expect(screen.getByText('At generation · Sep 25')).toBeInTheDocument()
    expect(screen.getByText('In 7 days · Oct 2 · expired')).toBeInTheDocument()
    expect(screen.getByText('−200', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('+200', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('+0', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(report.risks[0])).toBeVisible()
    expect(screen.getByText(report.suggestions[0])).toBeVisible()
    expect(screen.getByText(report.assumptions[0])).not.toBeVisible()
    fireEvent.click(screen.getByText('How this forecast was built'))
    expect(screen.getByText(report.assumptions[0])).toBeVisible()
  })

  it('selects saved reports and loads older ones', () => {
    const callbacks = props()
    const older = { ...report, id: 'older', created_at: '2026-09-20T12:00:00Z' }
    render(<FinancialOutlook {...callbacks} history={[report, older]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Select forecast report' }), { target: { value: 'older' } })
    expect(callbacks.onSelect).toHaveBeenCalledWith('older')
    fireEvent.click(screen.getByRole('button', { name: 'Load older forecasts' }))
    expect(callbacks.onLoadMore).toHaveBeenCalledOnce()
  })

  it('masks amounts, delta signs, range positions, and all forecast prose', () => {
    privacy.mode = 'hidden'
    const { container } = render(<FinancialOutlook {...props()} />)
    for (const text of [report.headline, ...report.risks, ...report.suggestions, ...report.drivers, ...report.assumptions, '−200', '+200']) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument()
    }
    expect(container.querySelector('[style*="left"]')).toBeNull()
    expect(container.textContent).not.toContain('1\u00a0000')
    privacy.mode = 'visible'
  })

  it('retains changed-data warnings and empty/loading states', () => {
    const { rerender } = render(<FinancialOutlook {...props({ ...report, freshness: { ...report.freshness, status: 'data_changed', data_changed: true } })} />)
    expect(screen.getByText('Needs refresh')).toBeInTheDocument()
    expect(screen.getByText(/Your financial data changed/)).toBeInTheDocument()
    rerender(<FinancialOutlook {...props(null)} loading />)
    expect(screen.getByRole('status', { name: 'Loading AI financial forecast' })).toBeInTheDocument()
    rerender(<FinancialOutlook {...props(null)} />)
    expect(screen.getByText(/publish your first forecast/)).toBeInTheDocument()
  })
})
