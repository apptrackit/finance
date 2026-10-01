import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecurringTransactions } from './RecurringTransactions'

const { showAlert, privacy } = vi.hoisted(() => ({ showAlert: vi.fn(), privacy: { privacyMode: 'visible' } }))
vi.mock('../../context/AlertContext', () => ({ useAlert: () => ({ confirm: vi.fn(), showAlert }) }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => privacy }))

const accounts = [{ id: 'cash', name: 'Test cash', type: 'cash' as const, balance: 1000, currency: 'HUF' }]
const categories = [{ id: 'food', name: 'Test food', type: 'expense' as const }]
const yearly = {
  id: 'yearly', type: 'transaction', frequency: 'yearly', day_of_month: 31,
  account_id: 'cash', category_id: 'food', amount: -25, description: 'Annual bill',
  is_active: true, created_at: new Date(2025, 2, 1).getTime(),
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 2, 1, 12))
  privacy.privacyMode = 'visible'
  showAlert.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function openEdit() {
  fireEvent.click(screen.getByRole('button', { name: /Manage Schedules/ }))
  const title = await screen.findByText('Annual bill')
  const card = title.closest('.overflow-hidden') as HTMLElement
  fireEvent.click(within(card).getAllByRole('button', { name: '' })[0])
}

describe('yearly recurring schedules', () => {
  it.each([
    { month: 6, selected: '6', next: '07.31', expenses: '0', calendarCount: 0 },
    { month: 0, selected: '0', next: '2027.01.31', expenses: '0', calendarCount: 0 },
    { month: null, selected: '2', next: '03.31', expenses: '-25', calendarCount: 1 },
    { month: undefined, selected: '2', next: '03.31', expenses: '-25', calendarCount: 1 },
  ])('uses month $month for next date, upcoming impact, calendar and edit defaults', async ({ month, selected, next, expenses, calendarCount }) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ ...yearly, month }])))
    render(<RecurringTransactions accounts={accounts} categories={categories} />)
    await screen.findByText('Annual bill')
    expect(screen.getByText(new RegExp(next.replaceAll('.', '\\.')))).toBeInTheDocument()
    const expenseCard = screen.getByText('Next 30 Days Expenses').closest('.rounded-xl') as HTMLElement
    expect(within(expenseCard).getByText(expenses)).toBeInTheDocument()
    expect(screen.queryAllByTitle('Annual bill - Test cash - 25')).toHaveLength(calendarCount)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.queryAllByTitle('Annual bill - Test cash - 25')).toHaveLength(calendarCount)
    await openEdit()
    expect(screen.getByLabelText('Month')).toHaveValue(selected)
  })

  it('keeps the selected month after save and reload, including January', async () => {
    let stored = { ...yearly, month: 6 }
    const fetch = vi.fn(async (_input, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        stored = { ...stored, ...JSON.parse(String(init.body)) }
        return Response.json(stored)
      }
      return Response.json([stored])
    })
    vi.stubGlobal('fetch', fetch)
    render(<RecurringTransactions accounts={accounts} categories={categories} />)
    await openEdit()
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Schedule' }))
    await waitFor(() => expect(screen.queryByText('Edit Recurring Schedule')).not.toBeInTheDocument())
    expect(stored.month).toBe(0)
    expect(screen.getByText(/2027\.01\.31/)).toBeInTheDocument()
    await openEdit()
    expect(screen.getByLabelText('Month')).toHaveValue('0')
  })

  it('preserves the month draft when an edit fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input, init?: RequestInit) => init?.method === 'PUT'
      ? Response.json({ error: 'Save failed' }, { status: 500 })
      : Response.json([{ ...yearly, month: 6 }])))
    render(<RecurringTransactions accounts={accounts} categories={categories} />)
    await openEdit()
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Schedule' }))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })))
    expect(screen.getByLabelText('Month')).toHaveValue('1')
    expect(screen.getByText('Edit Recurring Schedule')).toBeInTheDocument()
  })

  it.each([375, 1280])('shows the selected month with private amounts at viewport width %i', async width => {
    vi.stubGlobal('innerWidth', width)
    privacy.privacyMode = 'hidden'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ ...yearly, month: 2 }])))
    render(<RecurringTransactions accounts={accounts} categories={categories} />)
    await screen.findByText('Annual bill')
    expect(screen.getByText(/03\.31/)).toBeInTheDocument()
    expect(screen.getByTitle('Annual bill - Test cash - ••••')).toBeInTheDocument()
    expect(screen.queryByTitle('Annual bill - Test cash - 25')).not.toBeInTheDocument()
  })
})
