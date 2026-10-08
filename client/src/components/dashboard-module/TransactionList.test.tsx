import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../config'
import { TransactionList } from './TransactionList'

vi.mock('../../config', () => ({
  API_BASE_URL: '/api',
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
}))

const privacy = vi.hoisted(() => ({ mode: 'visible' as 'visible' | 'hidden' }))
beforeEach(() => { privacy.mode = 'visible'; localStorage.clear() })

vi.mock('../../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: privacy.mode, shouldHideInvestment: () => privacy.mode === 'hidden' }),
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
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
    expect(screen.getByLabelText('Amount to Receive (MXN)')).toHaveValue('1 100.5')
    expect(screen.getByRole('dialog')).toHaveTextContent('If confirmed')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('After transfer')
    expect(screen.getByRole('dialog')).toHaveTextContent('Transfer review changed; refresh and try again')
    expect(onTransactionAdded).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
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

const transferAccounts = [
  { id: 'source', name: 'Savings', balance: 900, currency: 'HUF', type: 'cash' as const },
  { id: 'destination', name: 'Travel', balance: 110, currency: 'EUR', type: 'cash' as const },
  { id: 'other', name: 'Other cash', balance: 200, currency: 'HUF', type: 'cash' as const },
  { id: 'locked', name: 'Locked cash', balance: 100, currency: 'HUF', type: 'cash' as const, is_locked: true },
  { id: 'archived', name: 'Archived cash', balance: 0, currency: 'HUF', type: 'cash' as const, archived_at: 1 },
]
const postedTransfer = [
  { id: 'sent', account_id: 'source', amount: -100, linked_transaction_id: 'received', date: '2020-01-01', description: 'Transfer to Travel - Holiday' },
  { id: 'received', account_id: 'destination', amount: 10, linked_transaction_id: 'sent', date: '2020-01-01', description: 'Transfer from Savings - Holiday' },
]

function renderTransfers(options: Partial<ComponentProps<typeof TransactionList>> = {}) {
  const onTransactionAdded = vi.fn()
  render(<TransactionList transactions={postedTransfer} upcomingTransactions={[]} accounts={transferAccounts}
    onTransactionAdded={onTransactionAdded} availableCategories={[]} dateRange={{ startDate: '2020-01-01', endDate: '2020-01-31' }}
    onDateRangeChange={vi.fn()} currentMonth={new Date('2020-01-01')} onMonthChange={vi.fn()} masterCurrency="HUF" {...options} />)
  return onTransactionAdded
}

function mockRates(rate = 0.2) {
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation(async () => ({ ok: true, json: async () => ({ rate }) }) as Response)
}

describe('TransactionList redesigned transfers', () => {
  it('previews posted edit deltas, preserves both native amounts when swapping, and reverts the full edit', async () => {
    mockRates()
    const user = userEvent.setup()
    renderTransfers()
    await user.click(screen.getAllByRole('button', { name: 'Edit transfer' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Transfer' })
    expect(within(dialog).queryByRole('button', { name: 'Expense' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    // An unchanged posted transfer must preview the actual current balances.
    expect(dialog).toHaveTextContent('After transfer 900 HUF')
    expect(dialog).toHaveTextContent('After transfer 110 EUR')
    await user.click(within(dialog).getByRole('button', { name: 'Swap accounts' }))
    expect(within(dialog).getByRole('combobox', { name: 'From account' })).toHaveValue('destination')
    expect(within(dialog).getByLabelText('Amount to Send (EUR)')).toHaveValue('10')
    expect(within(dialog).getByLabelText('Amount to Receive (HUF)')).toHaveValue('100')
    expect(dialog).toHaveTextContent('After transfer 90 EUR')
    expect(dialog).toHaveTextContent('After transfer 1 100 HUF')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'To account' }), 'other')
    expect(dialog).toHaveTextContent('Unsaved changes')
    await user.click(within(dialog).getByRole('button', { name: 'Revert' }))
    expect(within(dialog).getByRole('combobox', { name: 'From account' })).toHaveValue('source')
    expect(within(dialog).getByRole('combobox', { name: 'To account' })).toHaveValue('destination')
    expect(within(dialog).getByLabelText('Amount to Send (HUF)')).toHaveValue('100')
    expect(within(dialog).getByLabelText('Amount to Receive (EUR)')).toHaveValue('10')
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('Holiday')
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(dialog).not.toHaveTextContent('Unsaved changes')
  })

  it('uses an intentionally changed rate, disables incomplete conversions, and applies the market rate', async () => {
    mockRates()
    const user = userEvent.setup()
    renderTransfers()
    await user.click(screen.getAllByRole('button', { name: 'Edit transfer' })[0])
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('50.0% below market'))
    const rate = within(dialog).getByLabelText('Exchange Rate')
    await user.clear(rate)
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.type(rate, '0,15')
    await waitFor(() => expect(within(dialog).getByLabelText('Amount to Receive (EUR)')).toHaveValue('15'))
    await user.click(within(dialog).getByRole('button', { name: 'Use 0.2' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Amount to Receive (EUR)')).toHaveValue('20'))
    expect(dialog).toHaveTextContent('Market rate')
  })

  it('keeps an explicit received amount when the sent amount changes and shows the effective rate', async () => {
    mockRates()
    const user = userEvent.setup()
    renderTransfers()
    await user.click(screen.getAllByRole('button', { name: 'Edit transfer' })[0])
    const dialog = screen.getByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount to Send (HUF)')
    await user.clear(amount)
    await user.type(amount, '200')
    expect(within(dialog).getByLabelText('Amount to Receive (EUR)')).toHaveValue('10')
    expect(within(dialog).getByLabelText('Exchange Rate')).toHaveValue('0.05')
    expect(dialog).toHaveTextContent('After transfer 800 HUF')
  })

  it('creates same-currency transfers with equal amounts and excludes locked or archived accounts', async () => {
    mockRates()
    localStorage.clear()
    const user = userEvent.setup()
    const added = renderTransfers({ composerOnly: true, openRequest: 1, transactions: [] })
    await user.click(screen.getByRole('button', { name: 'Transfer' }))
    const dialog = screen.getByRole('dialog')
    const from = within(dialog).getByRole('combobox', { name: 'From account' })
    const to = within(dialog).getByRole('combobox', { name: 'To account' })
    expect(within(from).queryByRole('option', { name: /Locked cash|Archived cash/ })).not.toBeInTheDocument()
    await user.selectOptions(from, 'source')
    await user.selectOptions(to, 'other')
    await user.type(within(dialog).getByLabelText('Amount to Send (HUF)'), '12,50')
    expect(within(dialog).getByLabelText('Amount to Receive (HUF)')).toBeDisabled()
    expect(within(dialog).getByLabelText('Amount to Receive (HUF)')).toHaveValue('12.50')
    expect(dialog).toHaveTextContent('Same currency, no conversion')
    await user.selectOptions(to, 'source')
    expect(dialog).toHaveTextContent('From and To must be different accounts.')
    expect(within(dialog).getByRole('button', { name: 'Transfer 12.5 HUF' })).toBeDisabled()
    await user.selectOptions(to, 'other')
    await user.click(within(dialog).getByRole('button', { name: 'Transfer 12.5 HUF' }))
    await waitFor(() => expect(added).toHaveBeenCalledOnce())
    const save = vi.mocked(apiFetch).mock.calls.find(([url, options]) => url === '/api/transfers' && options?.method === 'POST')
    expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({ from_account_id: 'source', to_account_id: 'other', amount_from: 12.5, amount_to: 12.5 })
  })

  it('keeps investment quantities precise and includes the manual price in the save', async () => {
    mockRates(0.001)
    localStorage.clear()
    const user = userEvent.setup()
    const added = renderTransfers({ composerOnly: true, openRequest: 1, transactions: [], accounts: [
      ...transferAccounts,
      { id: 'holding', name: 'Example holding', balance: 1.5, currency: 'UNIT', quote_currency: 'EUR', type: 'investment' },
    ] })
    await user.click(screen.getByRole('button', { name: 'Transfer' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'From account' }), 'source')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'To account' }), 'holding')
    await user.type(within(dialog).getByLabelText('Amount to Send (HUF)'), '100')
    const quantity = within(dialog).getByLabelText('Shares to Receive')
    await user.clear(quantity)
    await user.type(quantity, '0.12345678')
    await user.type(within(dialog).getByLabelText('Price per Share in EUR (optional - leave blank to auto-fetch)'), '123.45')
    await user.click(within(dialog).getByRole('button', { name: 'Transfer 100 HUF' }))
    await waitFor(() => expect(added).toHaveBeenCalledOnce())
    const save = vi.mocked(apiFetch).mock.calls.find(([url, options]) => url === '/api/transfers' && options?.method === 'POST')
    expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({ amount_to: 0.12345678, price: 123.45 })
  })
})

it('hides balances in cards, account options, projected balances, and insufficient-balance warnings', async () => {
  mockRates()
  privacy.mode = 'hidden'
  const user = userEvent.setup()
  renderTransfers()
  await user.click(screen.getAllByRole('button', { name: 'Edit transfer' })[0])
  const dialog = screen.getByRole('dialog')
  expect(dialog).not.toHaveTextContent('900 HUF')
  expect(dialog).not.toHaveTextContent('110 EUR')
  expect(dialog).toHaveTextContent('After transfer •••••• HUF')
  const from = within(dialog).getByRole('combobox', { name: 'From account' })
  expect(within(from).getByRole('option', { name: 'Savings · •••••• HUF' })).toBeInTheDocument()
  const amount = within(dialog).getByLabelText('Amount to Send (HUF)')
  await user.clear(amount)
  await user.type(amount, '1200')
  expect(dialog).toHaveTextContent('Amount exceeds the available balance.')
  expect(dialog).not.toHaveTextContent('200 HUF more')
})

it('retains a manual conversion when a late market-rate request completes', async () => {
  let resolveRate!: (value: Response) => void
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation(() => new Promise<Response>(resolve => { resolveRate = resolve }))
  const user = userEvent.setup()
  renderTransfers()
  await user.click(screen.getAllByRole('button', { name: 'Edit transfer' })[0])
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('Loading rate…')
  const received = within(dialog).getByLabelText('Amount to Receive (EUR)')
  await user.clear(received)
  await user.type(received, '12.34')
  resolveRate({ ok: true, json: async () => ({ rate: 0.2 }) } as Response)
  await waitFor(() => expect(dialog).not.toHaveTextContent('Loading rate…'))
  expect(received).toHaveValue('12.34')
  expect(within(dialog).getByLabelText('Exchange Rate')).toHaveValue('0.1234')
})
