import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    fireEvent.click(screen.getByRole('button', { name: 'Archive account', exact: true }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'Save rejected' }))
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Archive account', exact: true })).toBeEnabled()
  })

  it('preserves the account drawer draft and exclusions when a save fails', async () => {
    fail = true
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Everyday' }))
    fireEvent.change(screen.getByLabelText('Account Name'), { target: { value: 'Renamed account' } })
    fireEvent.click(screen.getByLabelText(/Exclude from net worth/))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith({ type: 'error', message: 'Save rejected' }))
    expect(screen.getByLabelText('Account Name')).toHaveValue('Renamed account')
    expect(screen.getByLabelText(/Exclude from net worth/)).toBeChecked()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('requires a typed account name before enabling permanent deletion', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Everyday' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Delete account permanently?' })
    expect(dialog).toHaveTextContent('Linked transfers block deletion')
    expect(screen.getAllByRole('button', { name: 'Delete permanently', exact: true }).at(-1)).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type Everyday to confirm'), { target: { value: 'Everyday' } })
    expect(screen.getAllByRole('button', { name: 'Delete permanently', exact: true }).at(-1)).toBeEnabled()
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
    expect(screen.getByRole('button', { name: 'Edit Legacy cash' })).toHaveTextContent(/^Legacy cashCash \/ bank · HUF$/)
    const locked = screen.getByRole('button', { name: 'Edit Locked cash' })
    expect(locked).toBeDisabled()
    expect(locked).toHaveTextContent(/^Locked cashCash \/ bank · HUFExcluded from net worth$/)
  })

  it('masks native values and never makes an archived account editable', () => {
    privacy.hidden = true
    open()
    expect(screen.queryByText('0 Ft')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Old account, archived' })).toBeDisabled()
  })
})
