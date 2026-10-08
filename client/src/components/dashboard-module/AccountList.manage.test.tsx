import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountList } from './AccountList'

const alerts = vi.hoisted(() => ({ confirm: vi.fn(), showAlert: vi.fn() }))
const privacy = vi.hoisted(() => ({ hidden: false }))
vi.mock('../../context/AlertContext', () => ({ useAlert: () => alerts }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: privacy.hidden ? 'hidden' : 'visible', shouldHideInvestment: () => privacy.hidden }) }))
const accounts = [
  { id: 'active', name: 'Everyday', type: 'cash' as const, balance: 0, currency: 'HUF' },
  { id: 'archived', name: 'Old account', type: 'cash' as const, balance: 0, currency: 'HUF', archived_at: 1 },
]
const refresh = vi.fn()
const fetchMock = vi.fn<typeof fetch>()
let fail = false
beforeEach(() => {
  alerts.confirm.mockResolvedValue(true)
  alerts.showAlert.mockClear()
  refresh.mockClear()
  privacy.hidden = false
  fail = false
  fetchMock.mockClear()
  fetchMock.mockImplementation(async (input, options) => {
    if (String(input).includes('open.er-api')) return Response.json({ rates: { USD: 1, HUF: 360 } })
    if (options?.method && options.method !== 'GET') return fail ? Response.json({ error: 'Save rejected' }, { status: 409 }) : Response.json({})
    return Response.json([])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function open() { return render(<AccountList manage accounts={accounts} onAccountAdded={refresh} />) }

describe('dedicated account management', () => {
  it('shows independent active-group shares, withholding incomplete groups and masking private shares', () => {
    const sample: ComponentProps<typeof AccountList>['accounts'] = [
      { id: 'a', name: 'Cash A', type: 'cash', balance: 60, currency: 'USD', is_locked: true },
      { id: 'b', name: 'Cash B', type: 'cash', balance: 40, currency: 'EUR', exclude_from_cash_balance: true, exclude_from_net_worth: true },
      { id: 'i', name: 'Investment', type: 'investment', asset_type: 'manual', balance: 100, currency: 'USD' },
      accounts[1],
    ]
    const { rerender } = render(<AccountList manage accounts={sample} sortValues={{ a: 60, b: 40, i: 100 }} onAccountAdded={refresh} />)
    expect(screen.getByText('60.0%')).toBeInTheDocument()
    expect(screen.getByText('40.0%')).toBeInTheDocument()
    expect(screen.getByText('100.0%')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Archived accounts' })).queryByText(/\d+\.\d+%/)).not.toBeInTheDocument()
    rerender(<AccountList manage accounts={sample} sortValues={{ a: 60, b: null, i: 100 }} onAccountAdded={refresh} />)
    expect(screen.getAllByText('Share unavailable')).toHaveLength(2)
    expect(screen.getByText('100.0%')).toBeInTheDocument()
    privacy.hidden = true
    rerender(<AccountList manage accounts={sample} sortValues={{ a: 60, b: 40, i: 100 }} onAccountAdded={refresh} />)
    expect(screen.queryByText(/\d+\.\d+%/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Share hidden')).toHaveLength(3)
  })

  it('shows active/archived groups and restores through the persisted endpoint', async () => {
    open()
    expect(screen.getByText('1 active · 1 archived')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Archived accounts' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore', exact: true }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(alerts.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('remain paused') }))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/accounts/archived/restore'), expect.objectContaining({ method: 'PATCH' }))
  })

  it('explains archive failure without refreshing or hiding actions', async () => {
    fail = true
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Everyday' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive account', exact: true }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'Save rejected' }))
    expect(refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Everyday' }))
    expect(await screen.findByRole('menuitem', { name: 'Archive account', exact: true })).toBeEnabled()
  })

  it('preserves the centered account dialog draft and exclusions when a save fails', async () => {
    fail = true
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed account' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Net worth' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'Save rejected' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Renamed account')
    expect(screen.getByRole('switch', { name: 'Net worth' })).not.toBeChecked()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('tracks semantic changes and reverts all saved fields without writing', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Balance'), { target: { value: '0,00' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Draft' } })
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Cash balance' }))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(save).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Everyday')
    expect(screen.getByLabelText('Currency')).toHaveValue('HUF')
    expect(screen.getByRole('switch', { name: 'Cash balance' })).toBeChecked()
    expect(save).toBeDisabled()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false)
  })

  it('previews signed differences and keeps incomplete balances unsaved', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Balance'), { target: { value: '-12,50' } })
    expect(screen.getByText('-12.50 HUF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record as transaction' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Balance'), { target: { value: '-' } })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.queryByRole('group', { name: 'Balance adjustment method' })).not.toBeInTheDocument()
    expect(screen.getByText('Enter a complete balance to save.')).toBeInTheDocument()
  })

  it('defaults to the existing adjustment confirmation flow and retains the draft on cancel', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Balance'), { target: { value: '125,50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByText('Single Adjustment')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Edit account' })).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Balance Adjustment' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Balance')).toHaveValue('125.50')
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false)
  })

  it('overwrites only when selected and persists independent inclusion flags', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Balance'), { target: { value: '123,45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite balance' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Net worth' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ balance: 123.45, adjustWithTransaction: false, exclude_from_net_worth: true, exclude_from_cash_balance: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('preserves investment quantities, holding units, and trading currency', async () => {
    render(<AccountList manage accounts={[{ id: 'stock', name: 'Stock', type: 'investment', asset_type: 'stock', symbol: 'TEST', currency: 'SHARE', quote_currency: 'EUR', balance: 0.12345678 }]} onAccountAdded={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Stock' }))
    expect(screen.getByLabelText('Quantity')).toHaveValue('0.12345678')
    expect(screen.getByLabelText('Trading currency')).toHaveValue('EUR')
    expect(screen.queryByRole('switch', { name: 'Cash balance' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Trading currency'), { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ balance: 0.12345678, currency: 'SHARE', quote_currency: 'USD', asset_type: 'stock', symbol: 'TEST' })
  })

  it('masks saved balance and difference previews while allowing explicit edits', () => {
    privacy.hidden = true
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    expect(screen.getByText('Saved: •••••• HUF')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Balance'), { target: { value: '125' } })
    expect(screen.getByText('•••••• HUF')).toBeInTheDocument()
    expect(screen.queryByText('+125.00 HUF')).not.toBeInTheDocument()
    expect(screen.getByText(/adjustment transaction for •••••• HUF/)).toBeInTheDocument()
  })

  it('retains the inline deletion confirmation and draft when deletion fails', async () => {
    fail = true
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type Everyday to confirm'), { target: { value: 'Everyday' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'Save rejected' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Draft')
    expect(screen.getByLabelText('Type Everyday to confirm')).toHaveValue('Everyday')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('blocks repeat saves and immediate actions until the save completes', async () => {
    let finish: (response: Response) => void = () => {}
    const pending = new Promise<Response>(resolve => { finish = resolve })
    fetchMock.mockImplementation(async (input, options) => options?.method === 'PUT' ? pending
      : String(input).includes('open.er-api') ? Response.json({ rates: { USD: 1, HUF: 360 } }) : Response.json([]))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Net worth' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lock account', exact: true })).toBeDisabled()
    expect(within(screen.getByRole('dialog', { name: 'Edit account' })).getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText('Name').closest('form')!)
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
    finish(Response.json({}))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('requires a typed account name before enabling permanent deletion', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Everyday' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Delete account permanently?' })
    expect(dialog).toHaveTextContent('Linked transfers block deletion')
    expect(screen.getAllByRole('button', { name: 'Delete permanently', exact: true }).at(-1)).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type Everyday to confirm'), { target: { value: 'Everyday' } })
    expect(screen.getAllByRole('button', { name: 'Delete permanently', exact: true }).at(-1)).toBeEnabled()
  })

  it('keeps draft values while locking/unlocking from the editor', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kept draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lock account', exact: true }))
    expect(await screen.findByRole('button', { name: 'Unlock account', exact: true })).toBeEnabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByLabelText('Name')).toHaveValue('Kept draft')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/accounts/active/lock'), expect.objectContaining({ method: 'PATCH' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unlock account', exact: true }))
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeEnabled())
    expect(screen.getByLabelText('Name')).toHaveValue('Kept draft')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/accounts/active/unlock'), expect.objectContaining({ method: 'PATCH' }))
  })

  it('archives/restores from the editor and prevents edits until restored', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive account', exact: true }))
    expect(await screen.findByRole('button', { name: 'Restore account', exact: true })).toBeEnabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Restore account', exact: true }))
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeEnabled())
  })

  it('returns to the edit draft when typed deletion is cancelled', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kept name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently', exact: true }))
    expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Kept name')
  })

  it('preserves editor values on failed status changes', async () => {
    fail = true
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lock account', exact: true }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'Save rejected' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved draft')
    expect(screen.getByLabelText('Name')).toBeEnabled()
  })

  it('disables archive for nonzero saved balances in both menu and editor', async () => {
    render(<AccountList manage accounts={[{ id: 'funded', name: 'Funded account', type: 'cash', currency: 'HUF', balance: 5000 }]} onAccountAdded={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Funded account' }))
    expect(await screen.findByRole('menuitem', { name: 'Archive account' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Funded account' }))
    expect(screen.getByRole('button', { name: 'Archive account', exact: true })).toBeDisabled()
  })

  it('closes the editor only after a confirmed permanent deletion succeeds', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently', exact: true }))
    fireEvent.change(screen.getByLabelText('Type Everyday to confirm'), { target: { value: 'Everyday' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/accounts/active'), expect.objectContaining({ method: 'DELETE' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('renders legacy numeric account flags as status, never as stray zero text', () => {
    // Older APIs expose SQLite booleans as 0/1 instead of JSON booleans.
    const legacyAccounts = JSON.parse(JSON.stringify([
      { id: 'legacy', name: 'Legacy cash', type: 'cash', currency: 'HUF', balance: 350,
        is_locked: 0, exclude_from_net_worth: 0, exclude_from_cash_balance: 0 },
      { id: 'locked', name: 'Locked cash', type: 'cash', currency: 'HUF', balance: 350,
        is_locked: 1, exclude_from_net_worth: 1, exclude_from_cash_balance: 0 },
    ])) as ComponentProps<typeof AccountList>['accounts']
    render(<AccountList manage accounts={legacyAccounts} onAccountAdded={refresh} />)
    expect(screen.getByRole('button', { name: 'Edit Legacy cash' })).toHaveTextContent(/^Legacy cashCash \/ bank · HUF350 FtShare unavailable$/)
    const locked = screen.getByRole('button', { name: 'View Locked cash' })
    expect(locked).toBeEnabled()
    expect(locked).toHaveTextContent(/^Locked cashCash \/ bank · HUFExcluded from net worth350 FtShare unavailable$/)
  })

  it('orders management groups by converted value while displaying native balances', async () => {
    fetchMock.mockImplementation(async input => String(input).includes('open.er-api')
      ? Response.json({ rates: { USD: 1, HUF: 360, EUR: 0.9 } }) : Response.json([]))
    render(<AccountList manage accounts={[
      { id: 'huf', name: 'Local cash', type: 'cash', currency: 'HUF', balance: 30000 },
      { id: 'eur', name: 'Euro cash', type: 'cash', currency: 'EUR', balance: 100 },
      { id: 'manual-local', name: 'Local asset', type: 'investment', asset_type: 'manual', currency: 'HUF', balance: 30000 },
      { id: 'manual-usd', name: 'Dollar asset', type: 'investment', asset_type: 'manual', currency: 'USD', balance: 100 },
    ]} onAccountAdded={refresh} />)
    const cashGroup = within(screen.getByRole('region', { name: 'Cash accounts' }))
    const investmentGroup = within(screen.getByRole('region', { name: 'Investment accounts' }))
    const editOrder = (group: typeof cashGroup) => group.getAllByRole('button', { name: /^Edit / }).map(button => button.getAttribute('aria-label'))
    await waitFor(() => expect(editOrder(cashGroup)).toEqual(['Edit Euro cash', 'Edit Local cash']))
    expect(editOrder(investmentGroup)).toEqual(['Edit Dollar asset', 'Edit Local asset'])
    expect(cashGroup.getByText('€100,00')).toBeInTheDocument()
    expect(cashGroup.getByText(/30\s000 Ft/)).toBeInTheDocument()
  })

  it('does not require an archived currency rate for active account totals', async () => {
    render(<AccountList manage accounts={[
      { id: 'cash', name: 'Active cash', type: 'cash', currency: 'HUF', balance: 12500 },
      { id: 'archived-eur', name: 'Old euro account', type: 'cash', currency: 'EUR', balance: 0, archived_at: 1 },
    ]} onAccountAdded={refresh} />)
    await waitFor(() => expect(screen.queryByText('Accounts with unavailable converted values are listed last.')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('masks native values and never makes an archived account editable', () => {
    privacy.hidden = true
    open()
    expect(screen.queryByText('0 Ft')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Old account, archived' }))
    expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByLabelText('Balance')).toHaveValue('••••••')
  })
})
