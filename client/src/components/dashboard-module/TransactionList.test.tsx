import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TransactionList } from './TransactionList'

vi.mock('../../config', () => ({
  API_BASE_URL: '/api',
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
}))

vi.mock('../../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: 'visible', shouldHideInvestment: () => false }),
}))

vi.mock('../../context/AlertContext', () => ({
  useAlert: () => ({ confirm: vi.fn(), showAlert: vi.fn() }),
}))

describe('TransactionList transfer reviews', () => {
  it('shows a linked cross-currency draft as one transfer with both native amounts', () => {
    const review = {
      date: '2020-01-01',
      description: 'Savings account exchange',
      status: 'pending' as const,
      pending_kind: 'mcp_review' as const,
    }

    render(
      <TransactionList
        transactions={[]}
        upcomingTransactions={[
          { ...review, id: 'credit', account_id: 'mxn', amount: 1095.83, linked_transaction_id: 'debit' },
          { ...review, id: 'debit', account_id: 'huf', amount: -20000, linked_transaction_id: 'credit' },
        ]}
        accounts={[
          { id: 'huf', name: 'Revolut Saving', balance: 1346562, currency: 'HUF', type: 'cash' },
          { id: 'mxn', name: 'Revolut MXN', balance: 30.33, currency: 'MXN', type: 'cash' },
        ]}
        onTransactionAdded={vi.fn()}
        dateRange={{ startDate: '2020-01-01', endDate: '2020-01-31' }}
        onDateRangeChange={vi.fn()}
        currentMonth={new Date('2020-01-01')}
        onMonthChange={vi.fn()}
        masterCurrency="HUF"
      />
    )

    const reviewSection = screen.getByRole('region', { name: /MCP Review/i })
    expect(within(reviewSection).getByText('Savings account exchange')).toBeInTheDocument()
    expect(within(reviewSection).getByText('Revolut Saving → Revolut MXN')).toBeInTheDocument()
    expect(within(reviewSection).getByText('20 000 HUF')).toBeInTheDocument()
    expect(within(reviewSection).getByText('1 095.83 MXN')).toBeInTheDocument()
    expect(within(reviewSection).getByText('Sent')).toBeInTheDocument()
    expect(within(reviewSection).getByText('Received')).toBeInTheDocument()
    expect(within(reviewSection).getByRole('button', { name: 'Confirm transfer review draft' })).toBeInTheDocument()
    expect(within(reviewSection).getByRole('button', { name: 'Decline transfer review draft' })).toBeInTheDocument()
    expect(within(reviewSection).queryByTitle('Edit MCP review draft')).not.toBeInTheDocument()
    expect(within(reviewSection).getByText('1')).toBeInTheDocument()
  })
})
