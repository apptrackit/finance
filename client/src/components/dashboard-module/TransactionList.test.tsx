import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../config'
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
  it('shows and edits a linked cross-currency draft as one transfer with both native amounts', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockClear()
    const onTransactionAdded = vi.fn()
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
        onTransactionAdded={onTransactionAdded}
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
    await user.click(within(reviewSection).getByRole('button', { name: 'Edit transfer review draft' }))
    expect(screen.getByRole('heading', { name: 'Edit Transfer' })).toBeInTheDocument()
    expect(screen.getByLabelText('Amount to Send (HUF)')).toHaveValue('20 000')
    expect(screen.getByLabelText('Amount to Receive (MXN)')).toHaveValue('1 095.83')
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Savings account exchange')
    expect(vi.mocked(apiFetch).mock.calls.some(([url]) => String(url).includes('exchange-rate'))).toBe(false)

    await user.clear(screen.getByLabelText('Amount to Receive (MXN)'))
    await user.type(screen.getByLabelText('Amount to Receive (MXN)'), '1100.5')
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Transfer review changed; refresh and try again'))
    await user.click(screen.getByRole('button', { name: 'Save Transfer' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Transfer' })).toBeEnabled())
    expect(screen.getByLabelText('Amount to Receive (MXN)')).toHaveValue('1 100.5')
    expect(onTransactionAdded).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save Transfer' }))
    await waitFor(() => expect(onTransactionAdded).toHaveBeenCalledOnce())
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/transactions/debit', expect.objectContaining({
      method: 'PUT',
      body: expect.any(String),
    }))
    const saveCall = vi.mocked(apiFetch).mock.calls.find(([url, options]) =>
      url === '/api/transactions/debit' && options?.method === 'PUT'
    )
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({ amount: 20000, amount_to: 1100.5, description: 'Savings account exchange' })
    expect(within(reviewSection).getByText('1')).toBeInTheDocument()
  })
})
