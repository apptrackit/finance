import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LegacyTradeDetails } from './LegacyTradeDetails'
import { apiFetch } from '../../config'
const alerts = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  showAlert: vi.fn(),
}))
vi.mock('../../context/AlertContext', () => ({ useAlert: () => alerts }))
vi.mock('../../config', () => ({ API_BASE_URL: '/api', apiFetch: vi.fn() }))
const data = {
  trade: {
    id: 'old',
    account_id: 'holding',
    type: 'buy',
    date: '2025-01-02',
    quantity: 0.123456789,
    price: 100,
    trade_version: 0,
    total_amount: 12.3456789,
  },
  account: {
    name: 'Synthetic holding',
    currency: 'COIN',
    is_locked: false,
    archived_at: null,
  },
}
const close = vi.fn(),
  saved = vi.fn(async () => {})
beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation(async (_url, options) =>
    options?.method === 'PUT'
      ? Response.json({ success: true })
      : Response.json(data),
  )
  close.mockClear()
  saved.mockClear()
  alerts.confirm.mockClear()
})
afterEach(cleanup)
async function fill() {
  const user = userEvent.setup()
  await screen.findByText(/0.123456789/)
  await user.selectOptions(
    screen.getByLabelText('Purchase/sale price currency'),
    'USD',
  )
  await user.selectOptions(
    screen.getByLabelText('Actual payment currency'),
    'USD',
  )
  await user.type(screen.getByLabelText('Total paid (including fees)'), '12,35')
  return user
}
it('shows stored facts, saves only explicitly confirmed historical metadata, and refreshes after success', async () => {
  render(
    <LegacyTradeDetails
      tradeId="old"
      hidden={false}
      onClose={close}
      onSaved={saved}
    />,
  )
  const user = await fill()
  expect(
    screen.getByText(/Date, units and price remain unchanged/),
  ).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Confirm details', exact: true }),
  )
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const put = vi
    .mocked(apiFetch)
    .mock.calls.find(([, o]) => o?.method === 'PUT')!
  expect(JSON.parse(String(put[1]?.body))).toEqual({
    expected_version: 0,
    execution_currency: 'USD',
    cash_currency: 'USD',
    cash_amount: 12.35,
    fee_status: 'unknown',
    fee_amount: null,
  })
  expect(alerts.confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('Cash balances, holding units'),
    }),
  )
  expect(close).toHaveBeenCalledOnce()
})
it('preserves drafts on a rejected save and never closes or refreshes', async () => {
  vi.mocked(apiFetch).mockImplementation(async (_url, o) => {
    if (o?.method === 'PUT')
      throw new Error('Historical details changed. Reopen this form.')
    return Response.json(data)
  })
  render(
    <LegacyTradeDetails
      tradeId="old"
      hidden={false}
      onClose={close}
      onSaved={saved}
    />,
  )
  const user = await fill()
  await user.click(
    screen.getByRole('button', { name: 'Confirm details', exact: true }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Historical details changed',
  )
  expect(screen.getByLabelText('Total paid (including fees)')).toHaveValue(
    '12.35',
  )
  expect(saved).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
})
it('withholds saved quantities and editable values in privacy mode', async () => {
  render(
    <LegacyTradeDetails tradeId="old" hidden onClose={close} onSaved={saved} />,
  )
  expect(
    await screen.findByText(
      'Show investment values to confirm historical details.',
    ),
  ).toBeVisible()
  expect(screen.queryByText(/0.123456789/)).not.toBeInTheDocument()
  expect(
    screen.queryByLabelText('Total paid (including fees)'),
  ).not.toBeInTheDocument()
})
it('blocks saving a locked holding', async () => {
  vi.mocked(apiFetch).mockResolvedValue(
    Response.json({ ...data, account: { ...data.account, is_locked: true } }),
  )
  render(
    <LegacyTradeDetails
      tradeId="old"
      hidden={false}
      onClose={close}
      onSaved={saved}
    />,
  )
  expect(await screen.findByText(/Unlock or restore/)).toBeVisible()
  expect(screen.getByLabelText('Actual payment currency')).toBeDisabled()
})
