import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../config'
import { TransactionList } from './TransactionList'

vi.mock('../../config', () => ({
  API_BASE_URL: '/api',
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}))
const alerts = vi.hoisted(() => ({ confirm: vi.fn(async () => true), showAlert: vi.fn() }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: 'visible', shouldHideInvestment: () => false }) }))
vi.mock('../../context/AlertContext', () => ({ useAlert: () => alerts }))

const accounts = [
  { id: 'otp', name: 'OTP Bank', balance: 100000, currency: 'HUF', type: 'cash' as const },
  { id: 'stock', name: 'Portfolio', balance: 2, currency: 'SHARE', quote_currency: 'USD', type: 'investment' as const, symbol: 'TEST', asset_type: 'stock' as const },
]
const categories = [
  { id: 'groceries', name: 'Groceries', icon: '🛒', type: 'expense' as const },
  { id: 'household', name: 'Household', icon: '🧴', type: 'expense' as const },
  { id: 'salary', name: 'Salary', icon: '💼', type: 'income' as const },
]
const base = { account_id: 'otp', date: '2020-01-10', status: 'posted' as const, split_id: 'sp1', split_description: 'Spar' }
// Entered as groceries then household; the API lists rows newest first.
const splitLines = [
  { ...base, id: 'b', category_id: 'household', amount: -11350, description: null },
  { ...base, id: 'a', category_id: 'groceries', amount: -24900, description: 'Weekly shop' },
]
const other = { id: 'c', account_id: 'otp', category_id: 'groceries', amount: -8950, description: 'BKK pass', date: '2020-01-10', status: 'posted' as const }

function renderList(overrides: Partial<ComponentProps<typeof TransactionList>> = {}) {
  const onTransactionAdded = vi.fn()
  render(
    <TransactionList
      transactions={[]}
      upcomingTransactions={[]}
      accounts={accounts}
      availableCategories={categories}
      onTransactionAdded={onTransactionAdded}
      dateRange={{ startDate: '2020-01-01', endDate: '2020-01-31' }}
      onDateRangeChange={vi.fn()}
      currentMonth={new Date('2020-01-01')}
      onMonthChange={vi.fn()}
      masterCurrency="HUF"
      {...overrides}
    />
  )
  return { onTransactionAdded }
}
const calls = () => vi.mocked(apiFetch).mock.calls.map(([url, options]) => ({ url: String(url), method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) : undefined }))
const dialog = () => screen.getByRole('dialog')

beforeEach(() => { localStorage.clear(); vi.mocked(apiFetch).mockClear(); alerts.showAlert.mockClear() })

describe('transaction composer: split mode', () => {
  it('replaces bulk add with one New button', () => {
    renderList()
    expect(screen.queryByRole('button', { name: /bulk add/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New' })).toHaveLength(1)
  })

  it('splits a total into lines, gives the first line the rest, and saves one split', async () => {
    const user = userEvent.setup()
    const { onTransactionAdded } = renderList()
    await user.click(screen.getByRole('button', { name: 'New' }))
    await user.selectOptions(within(dialog()).getByLabelText('Account', { selector: '#account' }), 'otp')
    await user.type(within(dialog()).getByLabelText('Amount'), '48600')
    await user.type(within(dialog()).getByLabelText('Description'), '  Spar ')
    await user.click(within(dialog()).getByRole('button', { name: 'Split into categories' }))

    expect(within(dialog()).getByLabelText('Total')).toHaveValue('48 600')
    expect(within(dialog()).queryByLabelText('Category')).not.toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Amount for line 1')).toHaveValue('48 600')
    expect(within(dialog()).getByText('Rest')).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Assign the full amount' })).toBeInTheDocument()

    await user.selectOptions(within(dialog()).getByLabelText('Category for line 1'), 'groceries')
    await user.selectOptions(within(dialog()).getByLabelText('Category for line 2'), 'household')
    await user.type(within(dialog()).getByLabelText('Amount for line 2'), '11350')
    expect(within(dialog()).getByLabelText('Amount for line 1')).toHaveValue('37 250')
    await user.type(within(dialog()).getByLabelText('Note for line 2'), 'Cleaning')
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Fully assigned')

    await user.click(within(dialog()).getByRole('button', { name: 'Add 2 transactions' }))
    await waitFor(() => expect(onTransactionAdded).toHaveBeenCalledOnce())
    const save = calls().find(call => call.url.endsWith('/transactions/splits'))
    expect(save).toMatchObject({ method: 'POST', body: {
      account_id: 'otp', description: 'Spar', exclude_from_estimate: false,
      lines: [{ category_id: 'groceries', amount: -37250, note: null }, { category_id: 'household', amount: -11350, note: 'Cleaning' }],
    } })
    expect(calls().some(call => call.url.endsWith('/transactions') && call.method === 'POST')).toBe(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the draft and says what is wrong when the split is incomplete or the save fails', async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: 'New' }))
    await user.selectOptions(within(dialog()).getByLabelText('Account', { selector: '#account' }), 'otp')
    await user.type(within(dialog()).getByLabelText('Amount'), '100')
    await user.click(within(dialog()).getByRole('button', { name: 'Split into categories' }))
    await user.selectOptions(within(dialog()).getByLabelText('Category for line 1'), 'groceries')
    await user.selectOptions(within(dialog()).getByLabelText('Category for line 2'), 'household')
    // Editing the first line ends its automatic rest, so the total can now be under-assigned.
    await user.clear(within(dialog()).getByLabelText('Amount for line 1'))
    await user.type(within(dialog()).getByLabelText('Amount for line 1'), '30')
    await user.type(within(dialog()).getByLabelText('Amount for line 2'), '40')
    expect(within(dialog()).queryByText('Rest')).not.toBeInTheDocument()
    expect(within(dialog()).getByRole('status')).toHaveTextContent('30 HUF left')
    await user.click(within(dialog()).getByRole('button', { name: 'Assign the full amount' }))
    expect(calls().some(call => call.url.endsWith('/splits'))).toBe(false)

    await user.clear(within(dialog()).getByLabelText('Amount for line 2'))
    await user.type(within(dialog()).getByLabelText('Amount for line 2'), '80')
    expect(within(dialog()).getByRole('status')).toHaveTextContent('10 HUF over')
    await user.clear(within(dialog()).getByLabelText('Amount for line 2'))
    await user.type(within(dialog()).getByLabelText('Amount for line 2'), '70')
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('This split changed. Refresh and try again.'))
    await user.click(within(dialog()).getByRole('button', { name: 'Add 2 transactions' }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'This split changed. Refresh and try again.' }))
    expect(dialog()).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Amount for line 2')).toHaveValue('70')
  })

  it('offers undo, excludes investment posting accounts, and blocks future splits with the reason', async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: 'New' }))
    expect([...within(dialog()).getByLabelText<HTMLSelectElement>('Account', { selector: '#account' }).options].map(option => option.value)).not.toContain('stock')
    await user.selectOptions(within(dialog()).getByLabelText('Account', { selector: '#account' }), 'otp')
    await user.click(within(dialog()).getByRole('button', { name: 'Split into categories' }))
    await user.selectOptions(within(dialog()).getByLabelText('Category for line 1'), 'groceries')
    await user.click(within(dialog()).getByRole('button', { name: 'Undo split' }))
    expect(within(dialog()).getByLabelText('Category')).toHaveValue('groceries')
    expect(within(dialog()).queryByLabelText('Category for line 1')).not.toBeInTheDocument()
    fireDate('2999-01-01')
    expect(within(dialog()).getByRole('button', { name: 'Split into categories' })).toBeDisabled()
    expect(dialog()).toHaveTextContent('A split cannot be dated in the future.')
  })
})

function fireDate(value: string) {
  const input = screen.getByLabelText('Date') as HTMLInputElement
  // userEvent cannot type into date inputs reliably across jsdom versions.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('transaction composer: save and add another', () => {
  it('keeps type, account and date, clears amount, category and description, and leaves the composer open', async () => {
    const user = userEvent.setup()
    const { onTransactionAdded } = renderList()
    await user.click(screen.getByRole('button', { name: 'New' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Income' }))
    await user.selectOptions(within(dialog()).getByLabelText('Account', { selector: '#account' }), 'otp')
    await user.type(within(dialog()).getByLabelText('Amount'), '1000')
    await user.selectOptions(within(dialog()).getByLabelText('Category'), 'salary')
    await user.type(within(dialog()).getByLabelText('Description'), 'Pay')
    await user.click(within(dialog()).getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(onTransactionAdded).toHaveBeenCalledOnce())
    expect(calls().find(call => call.url.endsWith('/transactions'))).toMatchObject({ method: 'POST', body: { account_id: 'otp', amount: 1000, category_id: 'salary', description: 'Pay' } })
    expect(dialog()).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Amount')).toHaveValue('')
    expect(within(dialog()).getByLabelText('Category')).toHaveValue('')
    expect(within(dialog()).getByLabelText('Description')).toHaveValue('')
    expect(within(dialog()).getByLabelText('Account', { selector: '#account' })).toHaveValue('otp')
    expect(within(dialog()).getByRole('button', { name: 'Add Income' })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('Type, account and date are kept')
  })

  it('closes after a normal save and does not clear the form when the save fails', async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: 'New' }))
    await user.selectOptions(within(dialog()).getByLabelText('Account', { selector: '#account' }), 'otp')
    await user.type(within(dialog()).getByLabelText('Amount'), '500')
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Save rejected'))
    await user.click(within(dialog()).getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'Save rejected' }))
    expect(within(dialog()).getByLabelText('Amount')).toHaveValue('500')
    await user.click(within(dialog()).getByRole('button', { name: 'Add Expense' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('split rows in the list', () => {
  it('shows one grouped row with the total, expands to the lines, and searches the shared description', async () => {
    const user = userEvent.setup()
    renderList({ transactions: [...splitLines, other] })
    const row = screen.getByRole('button', { name: 'Actions for Spar' })
    expect(row).toBeInTheDocument()
    expect(screen.getByText(/Split · 2 lines · OTP Bank/)).toBeInTheDocument()
    expect(screen.getByText('−36 250 HUF')).toBeInTheDocument()
    expect(screen.queryByText('Weekly shop')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show split lines' }))
    const lines = within(screen.getByRole('list', { name: 'Split lines' }))
    expect(lines.getByText(/Groceries · Weekly shop/)).toBeInTheDocument()
    expect(lines.getByText(/Household/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Filter transactions'), 'spar')
    expect(screen.getByRole('button', { name: 'Actions for Spar' })).toBeInTheDocument()
    expect(screen.queryByText('BKK pass')).not.toBeInTheDocument()
  })

  it('opens the whole split from the group, saves changes to it, and deletes every line at once', async () => {
    const user = userEvent.setup()
    const { onTransactionAdded } = renderList({ transactions: [...splitLines, other] })
    await user.click(screen.getByRole('button', { name: 'Edit split' }))
    expect(screen.getByRole('heading', { name: 'Edit Split' })).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Total')).toHaveValue('36 250')
    expect(within(dialog()).getByLabelText('Description')).toHaveValue('Spar')
    expect(within(dialog()).getByLabelText('Note for line 1')).toHaveValue('Weekly shop')
    expect(within(dialog()).getByLabelText('Amount for line 2')).toHaveValue('11 350')
    expect(within(dialog()).queryByRole('button', { name: 'Save and add another' })).not.toBeInTheDocument()
    await user.clear(within(dialog()).getByLabelText('Amount for line 2'))
    await user.type(within(dialog()).getByLabelText('Amount for line 2'), '10000')
    await user.click(within(dialog()).getByRole('button', { name: 'Assign the full amount' }))
    expect(calls().some(call => call.method === 'PUT')).toBe(false)
    await user.clear(within(dialog()).getByLabelText('Amount for line 1'))
    await user.type(within(dialog()).getByLabelText('Amount for line 1'), '26250')
    await user.click(within(dialog()).getByRole('button', { name: 'Save 2 transactions' }))
    await waitFor(() => expect(onTransactionAdded).toHaveBeenCalledOnce())
    expect(calls().find(call => call.method === 'PUT')).toMatchObject({ url: '/api/transactions/splits/sp1', body: {
      account_id: 'otp', date: '2020-01-10', description: 'Spar',
      lines: [{ category_id: 'groceries', amount: -26250, note: 'Weekly shop' }, { category_id: 'household', amount: -10000, note: null }],
    } })

    vi.mocked(apiFetch).mockClear()
    await user.click(screen.getByRole('button', { name: 'Delete split' }))
    await waitFor(() => expect(calls().some(call => call.method === 'DELETE')).toBe(true))
    expect(calls().filter(call => call.method === 'DELETE')).toEqual([expect.objectContaining({ url: '/api/transactions/splits/sp1' })])
  })

  it('turns a split with one line left back into an ordinary transaction', async () => {
    const user = userEvent.setup()
    renderList({ transactions: splitLines })
    await user.click(screen.getByRole('button', { name: 'Edit split' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Undo split' }))
    expect(within(dialog()).getByLabelText('Category')).toHaveValue('groceries')
    await user.click(within(dialog()).getByRole('button', { name: 'Save as single transaction' }))
    await waitFor(() => expect(calls().some(call => call.method === 'PUT')).toBe(true))
    expect(calls().find(call => call.method === 'PUT')).toMatchObject({ url: '/api/transactions/splits/sp1', body: { description: 'Spar', lines: [{ category_id: 'groceries', amount: -36250 }] } })
  })

  it('does not offer to change a split on a locked account', () => {
    renderList({ transactions: splitLines, accounts: [{ ...accounts[0], is_locked: true }, accounts[1]] })
    expect(screen.queryByRole('button', { name: 'Edit split' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete split' })).not.toBeInTheDocument()
  })
})

describe('MCP split review drafts', () => {
  const review = { status: 'pending' as const, pending_kind: 'mcp_review' as const, review_source: 'chatgpt_mcp' as const, review_flags: [] }
  const reviewLines = splitLines.map(line => ({ ...line, ...review, split_id: 'mcp1', split_description: 'Tesco' }))

  it('shows a pending split as one review item with its total, lines and balance preview', async () => {
    const user = userEvent.setup()
    renderList({ upcomingTransactions: reviewLines })
    const section = within(screen.getByRole('region', { name: /needs review/i }).closest('section') ?? document.body)
    expect(section.getAllByRole('button', { name: 'More actions for Tesco' })).toHaveLength(1)
    expect(section.getByText(/Split · 2 lines · OTP Bank · Jan 10, 2020/)).toBeInTheDocument()
    expect(section.getByText('−36 250 HUF')).toBeInTheDocument()
    expect(screen.getByText(/1 MCP drafts/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Confirmation balance preview' })).toHaveTextContent('OTP Bank: 100 000 HUF → 63 750 HUF')
    await user.click(section.getByRole('button', { name: 'Show split lines' }))
    expect(within(screen.getByRole('list', { name: 'Split lines' })).getByText(/Groceries · Weekly shop/)).toBeInTheDocument()
  })

  it('confirms and declines the whole split through the split endpoints', async () => {
    const user = userEvent.setup()
    const { onTransactionAdded } = renderList({ upcomingTransactions: reviewLines })
    await user.click(screen.getByRole('button', { name: 'Confirm split review draft' }))
    await waitFor(() => expect(onTransactionAdded).toHaveBeenCalledOnce())
    expect(calls()).toContainEqual(expect.objectContaining({ url: '/api/transactions/splits/mcp1/confirm', method: 'POST' }))
    expect(screen.queryByRole('button', { name: 'More actions for Tesco' })).not.toBeInTheDocument()
  })

  it('declines every line at once', async () => {
    const user = userEvent.setup()
    renderList({ upcomingTransactions: reviewLines })
    await user.click(screen.getByRole('button', { name: 'Decline split review draft' }))
    await waitFor(() => expect(calls()).toContainEqual(expect.objectContaining({ url: '/api/transactions/splits/mcp1/decline', method: 'POST' })))
    expect(alerts.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('all 2 of its lines') }))
  })

  it('edits a future-dated pending split in the composer and keeps it a split', async () => {
    const user = userEvent.setup()
    renderList({ upcomingTransactions: reviewLines.map(line => ({ ...line, date: '2999-01-10' })) })
    await user.click(screen.getByRole('button', { name: 'Edit split review draft' }))
    expect(within(dialog()).queryByText('A split cannot be dated in the future.')).not.toBeInTheDocument()
    await user.click(within(dialog()).getByRole('button', { name: 'Save 2 transactions' }))
    await waitFor(() => expect(calls().some(call => call.method === 'PUT')).toBe(true))
    expect(calls().find(call => call.method === 'PUT')).toMatchObject({ url: '/api/transactions/splits/mcp1', body: { date: '2999-01-10', description: 'Tesco' } })
  })
})
