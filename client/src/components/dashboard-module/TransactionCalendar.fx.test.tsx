import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TransactionCalendar } from './TransactionCalendar'

const props = {
  transactions: [{ id: 'expense', account_id: 'eur', amount: -20, date: '2026-09-01' }],
  accounts: [{ id: 'eur', name: 'EUR bank', type: 'cash' as const, balance: 100, currency: 'EUR' }],
  currentMonth: new Date(2026, 8, 1), privacyMode: 'visible' as const,
  getCategoryName: () => 'Food', getCategoryIcon: () => '🥕',
  getAccountName: () => 'EUR bank', getAccountCurrency: () => 'EUR',
  masterCurrency: 'HUF', sortOrder: 'date' as const,
}
describe('calendar missing FX', () => {
  it('withholds balance trend and daily totals while keeping native transactions', () => {
    render(<TransactionCalendar {...props} convertToMasterCurrency={() => null} />)
    expect(screen.getByText('Balance trend unavailable: missing exchange rates.')).toBeInTheDocument()
    expect(screen.getByText('Day totals unavailable: missing exchange rates.')).toBeInTheDocument()
    expect(screen.getByText('−20 EUR')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })
  it('masks converted day totals in privacy mode', () => {
    render(<TransactionCalendar {...props} privacyMode="hidden" convertToMasterCurrency={amount => amount * 400} />)
    expect(document.body.textContent).not.toContain('8000')
    expect(screen.getByText('Expenses ••••••')).toBeInTheDocument()
  })
})
