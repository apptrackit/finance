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
  useAlert: () => ({ confirm: vi.fn(async () => true), showAlert: vi.fn() }),
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

    const reviewSection = screen.getByRole('region', { name: /Needs review/i })
    expect(within(reviewSection).getByText('Savings account exchange')).toBeInTheDocument()
    expect(reviewSection).toHaveTextContent('Revolut Saving → Revolut MXN')
    expect(reviewSection).toHaveTextContent('20 000 HUF')
    expect(reviewSection).toHaveTextContent('1 095,83 MXN')
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

describe('dashboard transaction presentation', () => {
  it('combines due items and MCP drafts, keeps future drafts unconfirmable, and resolves both transfer legs once', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    const onChange = vi.fn()
    renderTransfers({ transactions: [], onTransactionAdded: onChange, upcomingTransactions: [
      { id: 'due', account_id: 'source', amount: -500, date: '2020-01-01', description: 'Due bill', pending_kind: 'upcoming' },
      { id: 'future', account_id: 'source', amount: -700, date: '2099-01-01', description: 'Future draft', pending_kind: 'mcp_review' },
      { id: 'debit', account_id: 'source', amount: -100, date: '2020-01-01', description: 'Draft transfer', pending_kind: 'mcp_review', linked_transaction_id: 'credit' },
      { id: 'credit', account_id: 'destination', amount: 10, date: '2020-01-01', description: 'Draft transfer', pending_kind: 'mcp_review', linked_transaction_id: 'debit' },
    ] })
    const queue = screen.getByRole('region', { name: 'Needs review' })
    expect(within(queue).getAllByText('Draft transfer')).toHaveLength(1)
    expect(within(queue).getByText('Due bill')).toBeInTheDocument()
    expect(within(queue).getByText('Future draft')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).toHaveTextContent('Savings: 900 HUF → 300 HUF')
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).toHaveTextContent('Travel: 110,00 EUR → 120,00 EUR')
    expect(within(queue).queryByRole('button', { name: 'Confirm MCP draft' })).not.toBeInTheDocument()
    await user.click(within(queue).getByRole('button', { name: 'Confirm transfer review draft' }))
    await waitFor(() => expect(within(queue).queryByText('Draft transfer')).not.toBeInTheDocument())
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/api/transactions/debit/confirm', { method: 'POST' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).toHaveTextContent('Savings: 900 HUF → 400 HUF')
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).not.toHaveTextContent('Travel')
  })

  it('retains failed confirmations and hides review mutations for either locked leg', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockRejectedValue(new Error('Try again'))
    renderTransfers({ transactions: [], upcomingTransactions: [
      { id: 'due', account_id: 'source', amount: -500, date: '2020-01-01', description: 'Due bill', pending_kind: 'upcoming' },
      { id: 'locked-pair', account_id: 'source', amount: -100, date: '2020-01-01', pending_kind: 'mcp_review', linked_transaction_id: 'locked-credit' },
      { id: 'locked-credit', account_id: 'locked', amount: 100, date: '2020-01-01', pending_kind: 'mcp_review', linked_transaction_id: 'locked-pair' },
    ] })
    await user.click(screen.getByRole('button', { name: 'Confirm transaction' }))
    expect(screen.getByText('Due bill')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).toHaveTextContent('Savings: 900 HUF → 400 HUF')
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).not.toHaveTextContent('Locked cash')
    expect(screen.queryByRole('button', { name: 'Confirm transfer review draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Decline transfer review draft' })).not.toBeInTheDocument()
  })

  it('expands upcoming items without offering early confirmation', async () => {
    const user = userEvent.setup()
    renderTransfers({ transactions: [], upcomingTransactions: [{ id: 'future', account_id: 'source', amount: -700, date: '2099-01-01', description: 'Future bill', pending_kind: 'upcoming' }] })
    const toggle = screen.getByRole('button', { name: /1 upcoming/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Edit upcoming transaction' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Edit upcoming transaction' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm transaction' })).not.toBeInTheDocument()
  })

  it('shows cash flow daily totals without transfers, native HUF precision, and foreign equivalents', async () => {
    const user = userEvent.setup()
    renderTransfers({ transactions: [...postedTransfer,
      { id: 'expense', account_id: 'source', amount: -20000, date: '2020-01-01', description: 'Groceries' },
      { id: 'foreign', account_id: 'destination', amount: -4.2, date: '2020-01-01', description: 'Coffee' },
    ], convertToMasterCurrency: (amount, id) => id === 'destination' ? amount * 400 : amount })
    expect(screen.getByLabelText('Daily total')).toHaveTextContent('−21 680 HUF')
    expect(screen.getByText('−20 000 HUF')).toBeInTheDocument()
    expect(screen.getByText('≈ 1 680 HUF')).toBeInTheDocument()
    expect(screen.getByText('100 HUF')).not.toHaveClass('text-destructive')
    await user.click(screen.getByRole('button', { name: 'Transfers', exact: true }))
    expect(screen.queryByLabelText('Daily total')).not.toBeInTheDocument()
  })

  it('omits transfer-only day totals but preserves real zero cash-flow totals', () => {
    renderTransfers({ transactions: [...postedTransfer,
      { id: 'income', account_id: 'source', amount: 100, date: '2020-01-02' },
      { id: 'expense', account_id: 'source', amount: -100, date: '2020-01-02' },
    ] })
    const transferDay = screen.getByRole('region', { name: 'Wednesday, Jan 1, 2020' })
    expect(within(transferDay).queryByLabelText('Daily total')).not.toBeInTheDocument()
    expect(within(transferDay).getByText('100 HUF')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Thursday, Jan 2, 2020' })).getByLabelText('Daily total')).toHaveTextContent('0 HUF')
  })

  it('marks converted totals unavailable when a required rate is absent and masks totals in privacy mode', () => {
    const { unmount } = render(<TransactionList transactions={[{ id: 'foreign', account_id: 'destination', amount: -4.2, date: '2020-01-01' }]} upcomingTransactions={[]} accounts={transferAccounts}
      onTransactionAdded={vi.fn()} availableCategories={[]} dateRange={{ startDate: '2020-01-01', endDate: '2020-01-31' }} onDateRangeChange={vi.fn()}
      currentMonth={new Date(2020, 0, 1)} onMonthChange={vi.fn()} masterCurrency="HUF" convertToMasterCurrency={() => null} />)
    expect(screen.getByLabelText('Daily total')).toHaveTextContent('Total unavailable')
    expect(screen.getByText('−4,20 EUR')).toBeInTheDocument()
    expect(screen.getByText('Conversion unavailable')).toBeInTheDocument()
    unmount()
    privacy.mode = 'hidden'
    renderTransfers({ transactions: [...postedTransfer, { id: 'expense', account_id: 'source', amount: -5, date: '2020-01-01' }], convertToMasterCurrency: amount => amount })
    expect(screen.getByLabelText('Daily total')).toHaveTextContent('••••••')
    expect(screen.queryByText('100 HUF')).not.toBeInTheDocument()
  })
})

describe('confirmation balance preview', () => {
  it('includes ready ordinary income and expenses, excludes future/locked/archived items, and preserves negative balances', () => {
    vi.mocked(apiFetch).mockClear()
    renderTransfers({ transactions: [], upcomingTransactions: [
      { id: 'due', account_id: 'source', amount: -1200, date: '2020-01-01', pending_kind: 'upcoming' },
      { id: 'income', account_id: 'source', amount: 100, date: '2020-01-01', pending_kind: 'upcoming' },
      { id: 'future', account_id: 'source', amount: -700, date: '2099-01-01', pending_kind: 'upcoming' },
      { id: 'future-draft', account_id: 'source', amount: -900, date: '2099-01-01', pending_kind: 'mcp_review' },
      { id: 'locked', account_id: 'locked', amount: -500, date: '2020-01-01', pending_kind: 'upcoming' },
      { id: 'archived', account_id: 'archived', amount: 200, date: '2020-01-01', pending_kind: 'upcoming' },
    ] })
    const preview = screen.getByRole('region', { name: 'Confirmation balance preview' })
    expect(preview).toHaveTextContent('If all ready transactions are confirmed')
    expect(preview).toHaveTextContent('Savings: 900 HUF → −200 HUF')
    expect(preview).not.toHaveTextContent('Locked cash')
    expect(preview).not.toHaveTextContent('Archived cash')
    expect(transferAccounts[0].balance).toBe(900)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('previews the filtered queue and includes both transfer legs when only the credit matches', async () => {
    const user = userEvent.setup()
    renderTransfers({ transactions: [], upcomingTransactions: [
      { id: 'debit', account_id: 'source', amount: -100, date: '2020-01-01', pending_kind: 'mcp_review', linked_transaction_id: 'credit' },
      { id: 'credit', account_id: 'destination', amount: 10, date: '2020-01-01', pending_kind: 'mcp_review', linked_transaction_id: 'debit' },
      { id: 'other', account_id: 'other', amount: -50, date: '2020-01-01', pending_kind: 'upcoming' },
    ] })
    await user.type(screen.getByRole('searchbox', { name: 'Filter transactions' }), 'Travel')
    const preview = screen.getByRole('region', { name: 'Confirmation balance preview' })
    expect(preview).toHaveTextContent('Savings: 900 HUF → 800 HUF')
    expect(preview).toHaveTextContent('Travel: 110,00 EUR → 120,00 EUR')
    expect(preview).not.toHaveTextContent('Other cash')
  })

  it('masks native balances and negative signs in privacy mode', () => {
    privacy.mode = 'hidden'
    renderTransfers({ transactions: [], upcomingTransactions: [
      { id: 'due', account_id: 'source', amount: -1200, date: '2020-01-01', pending_kind: 'upcoming' },
    ] })
    const preview = screen.getByRole('region', { name: 'Confirmation balance preview' })
    expect(preview).toHaveTextContent('Savings: •••••• → ••••••')
    expect(preview).not.toHaveTextContent(/900|300|−/)
  })

  it('removes resolved ordinary transactions from the preview after declining', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    renderTransfers({ transactions: [], upcomingTransactions: [
      { id: 'due', account_id: 'source', amount: -500, date: '2020-01-01', pending_kind: 'upcoming' },
    ] })
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).toHaveTextContent('Savings: 900 HUF → 400 HUF')
    await user.click(screen.getByRole('button', { name: 'Decline transaction' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Confirmation balance preview' })).not.toBeInTheDocument())
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/api/transactions/due/decline', { method: 'POST' })
    expect(transferAccounts[0].balance).toBe(900)
  })
})
