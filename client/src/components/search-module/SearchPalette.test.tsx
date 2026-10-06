import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchPalette } from './SearchPalette'

const privacy = vi.hoisted(() => ({ hidden: false }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: privacy.hidden ? 'hidden' : 'visible' }) }))
const ready = { loaded: true, loading: false, stale: false, error: false }
const close = vi.fn(), compose = vi.fn(), refresh = vi.fn(async () => {})
const destinations = ['dashboard', 'accounts', 'recurring', 'settings'].map(key => ({ key, label: key[0].toUpperCase() + key.slice(1), icon: null }))
let failSchedules = false
function finance(): ComponentProps<typeof SearchPalette>['finance'] {
  return {
    accounts: [{ id: 'cash', name: 'Daily account', balance: 0, currency: 'HUF', type: 'cash', is_locked: true, updated_at: 1 }],
    categories: [{ id: 'subscriptions', name: 'Subscriptions', type: 'expense' }],
    allTransactions: Array.from({ length: 8 }, (_, i) => ({ id: `tx${i}`, account_id: 'cash', amount: -2990, category_id: 'subscriptions', description: 'Netflix', date: `2020-01-${String(i + 1).padStart(2, '0')}`, status: 'posted' as const })),
    upcomingTransactions: [{ id: 'pending', account_id: 'cash', amount: -2990, category_id: 'subscriptions', description: 'Netflix upcoming', date: '2026-10-08', status: 'pending', pending_kind: 'upcoming' }],
    dataStatus: { accounts: ready, categories: ready, transactions: ready, history: ready, upcoming: ready, netWorth: ready, investment: ready, exchangeRates: ready },
    handleDataChange: refresh,
  }
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}|{JSON.stringify(location.state)}</output> }
function open(data = finance(), unfinished = false, pages = destinations) {
  return render(<MemoryRouter initialEntries={['/analytics?period=year']}><SearchPalette isOpen onClose={close} finance={data} canCompose hasUnfinishedChanges={unfinished} destinations={pages} onNewTransaction={compose} /><Location /></MemoryRouter>)
}
beforeEach(() => {
  privacy.hidden = false; failSchedules = false
  close.mockClear(); compose.mockClear(); refresh.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => failSchedules ? Response.json({}, { status: 500 }) : Response.json([
    { id: 'schedule', description: 'Netflix subscription', account_id: 'cash', amount: -2990, category_id: 'subscriptions', frequency: 'monthly', is_active: true },
  ])))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Search everything palette', () => {
  it('keeps Tab focus inside the dialog when result options use roving keyboard selection', () => {
    const rectangles = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList)
    try {
      open()
      const input = screen.getByRole('combobox')
      const closeButton = screen.getByRole('button', { name: 'Close', exact: true })
      fireEvent.keyDown(input, { key: 'Tab' })
      expect(closeButton).toHaveFocus()
      fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
      expect(input).toHaveFocus()
    } finally { rectangles.mockRestore() }
  })

  it('offers keyboard quick actions and closes without changing filters', async () => {
    open()
    const input = screen.getByRole('combobox', { name: 'Search everything' })
    expect(input).toHaveFocus()
    expect(screen.getByRole('option', { name: /New transaction/ })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(compose).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('location')).toHaveTextContent('/analytics?period=year|null')
  })
  it('finds old and pending transactions, opens read-only details, and carries matching search to full history', async () => {
    open()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Netflix' } })
    expect(screen.getByRole('option', { name: /View all matching transactions \(9\)/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /^Netflix.*2020-01-08/ }))
    expect(screen.getByRole('button', { name: 'Back to results' })).toHaveFocus()
    expect(screen.getByText('2020-01-08')).toBeInTheDocument()
    expect(screen.getByText('Posted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))
    expect(screen.getByRole('combobox')).toHaveFocus()
    fireEvent.click(screen.getByRole('option', { name: /View all matching transactions/ }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?range=allTime|{"transactionSearch":"Netflix"}'))
  })
  it('navigates to category history and recurring editing', async () => {
    open()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Subscriptions' } })
    fireEvent.click(screen.getByRole('option', { name: /^Subscriptions.*View/ }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?range=allTime&category=subscriptions'))
    fireEvent.change(input, { target: { value: 'Netflix' } })
    fireEvent.click(await screen.findByRole('option', { name: /^Netflix subscription.*monthly/ }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/recurring|{"editScheduleId":"schedule"}'))
  })
  it('keeps account destinations and financial quick actions out of hidden sections and protects unfinished forms', () => {
    open(finance(), true, destinations.filter(item => item.key !== 'accounts'))
    expect(screen.queryByRole('option', { name: 'Add account' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /New transaction/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Add recurring transaction' })).toBeDisabled()
  })
  it('masks amounts in results and details and surfaces independent data errors with retry', async () => {
    privacy.hidden = true; failSchedules = true
    const data = finance()
    data.dataStatus.upcoming = { ...ready, error: true }
    open(data)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Netflix' } })
    expect(screen.queryByText(/2\s*990/)).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Netflix.*2020-01-08/ })).toHaveTextContent('••••••')
    fireEvent.click(screen.getByRole('button', { name: 'Retry search data' }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: 'Retry recurring search' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /^Netflix.*2020-01-08/ }))
    expect(screen.getByText('••••••')).toBeInTheDocument()
  })
  it('does not misrepresent unavailable complete history as an empty search', () => {
    const data = finance()
    data.dataStatus.history = { ...ready, error: true }
    open(data)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Netflix' } })
    expect(screen.queryByRole('option', { name: /View all matching/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry search data' })).toBeInTheDocument()
  })
})
