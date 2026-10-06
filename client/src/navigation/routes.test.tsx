import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { ThemeProvider } from '../context/ThemeContext'
import { AlertProvider } from '../context/AlertContext'
import { appRoutes } from './routes'
import { WIDGET_DEFS } from '../components/analytics-module/widgetConfig'

vi.mock('../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: 'visible', togglePrivacyMode: vi.fn(), shouldHideNetWorth: () => false, shouldHideInvestment: () => false }),
}))
vi.mock('../components/dashboard-module/AccountList', () => ({ AccountList: () => <div>Account overview</div> }))
vi.mock('../components/investments-module/Investments', () => ({ Investments: () => <h2>Investment portfolio</h2> }))
vi.mock('../components/dashboard-module/RecurringTransactions', () => ({ RecurringTransactions: () => <h2>Recurring schedules</h2> }))
vi.mock('../components/settings-module/Settings', () => ({ default: () => <h2>App settings</h2> }))

const fetchMock = vi.fn<typeof fetch>()
const categories = [{ id: 'food', name: 'Food', type: 'expense' }, { id: 'salary', name: 'Salary', type: 'income' }]
const posted = { id: 'posted', account_id: 'cash', category_id: 'salary', amount: 100, date: '2026-10-05', status: 'posted' }
const pending = { id: 'pending', account_id: 'cash', category_id: 'salary', amount: 10, date: '2026-10-07', status: 'pending', pending_kind: 'upcoming' }
let upcoming: unknown[]
let holdUpcoming: Promise<Response> | undefined
let holdCategories: Promise<Response> | undefined
let failSave: boolean
const routers: ReturnType<typeof createMemoryRouter>[] = []
const browserStorage = window.localStorage

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 6, 12))
  vi.stubGlobal('localStorage', browserStorage)
  localStorage.clear()
  localStorage.setItem('analytics-widget-visibility', JSON.stringify(Object.fromEntries(WIDGET_DEFS.map(widget => [widget.id, widget.id === 'summary-cards']))))
  upcoming = [pending]
  holdUpcoming = undefined
  holdCategories = undefined
  failSave = false
  vi.stubGlobal('scrollTo', vi.fn())
  fetchMock.mockImplementation(async (input, options) => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
    if (path === '/transactions/upcoming' && holdUpcoming) return holdUpcoming
    if (path === '/categories' && holdCategories) return holdCategories
    if (options?.method === 'POST' && failSave) return Response.json({ error: 'Save failed' }, { status: 400 })
    const payloads: Record<string, unknown> = {
      '/accounts': [{ id: 'cash', name: 'Cash', type: 'cash', balance: 100, currency: 'HUF', updated_at: 1 }],
      '/transactions': [posted], '/transactions/date-range': [posted], '/transactions/upcoming': upcoming,
      '/categories': categories, '/dashboard/net-worth': { net_worth: 100 }, '/v6/latest/HUF': { rates: { HUF: 1 } },
      '/settings/navigation': { visible_menus: { dashboard: false, analytics: true, investments: true, recurring: true }, updated_at: 1 },
      '/financial-outlook/latest': { snapshot: null }, '/financial-outlook-snapshots': { snapshots: [], next_cursor: null },
    }
    return Response.json(payloads[path] ?? {})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  routers.splice(0).forEach(router => router.dispose())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function open(entry: string, entries = [entry], initialIndex = entries.length - 1) {
  const router = createMemoryRouter(appRoutes, { initialEntries: entries, initialIndex })
  routers.push(router)
  const rendered = render(<ThemeProvider><AlertProvider><RouterProvider router={router} /></AlertProvider></ThemeProvider>)
  return { router, ...rendered }
}
const href = (router: ReturnType<typeof createMemoryRouter>) => router.state.location.pathname + router.state.location.search
const clickLink = (name: string) => fireEvent.click(screen.getAllByRole('link', { name })[0])
async function go(router: ReturnType<typeof createMemoryRouter>, target: number | string) {
  await act(async () => { if (typeof target === 'number') await router.navigate(target); else await router.navigate(target) })
}

describe('page navigation and view filters', () => {
  it('opens Dashboard regardless of last-view storage and legacy hidden-Dashboard settings', async () => {
    localStorage.setItem('finance_last_view', 'analytics')
    localStorage.setItem('finance_visible_menus', JSON.stringify({ dashboard: false, analytics: true }))
    const { router } = open('/')
    expect(await screen.findByText('Account overview')).toBeInTheDocument()
    expect(href(router)).toBe('/dashboard')
    expect(screen.getAllByRole('link', { name: 'Dashboard' })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    clickLink('Analytics')
    await screen.findByRole('button', { name: 'Show previous month' })
    expect(localStorage.getItem('finance_last_view')).toBe('analytics')
    expect(href(router)).toBe('/analytics')
  })

  it('restores dashboard controls on deep link, Back/Forward, and remount', async () => {
    const entry = '/dashboard?from=2026-09-01&to=2026-09-30&category=food&sort=amount-low'
    const { router, unmount } = open(entry)
    await screen.findByRole('combobox', { name: 'Transaction category' })
    expect(screen.getByRole('combobox', { name: 'Transaction category' })).toHaveValue('food')
    expect(screen.getByRole('combobox', { name: 'Transaction sort order' })).toHaveValue('amount-low')
    fireEvent.change(screen.getByRole('combobox', { name: 'Transaction sort order' }), { target: { value: 'amount-high' } })
    await waitFor(() => expect(href(router)).toContain('sort=amount-high'))
    await go(router, -1)
    expect(href(router)).toBe(entry)
    expect(screen.getByRole('combobox', { name: 'Transaction sort order' })).toHaveValue('amount-low')
    await go(router, 1)
    expect(screen.getByRole('combobox', { name: 'Transaction sort order' })).toHaveValue('amount-high')
    const saved = href(router)
    unmount()
    open(saved)
    expect(await screen.findByRole('combobox', { name: 'Transaction sort order' })).toHaveValue('amount-high')
  })

  it('waits for navigation settings before rejecting a deep link based on an old browser cache', async () => {
    localStorage.setItem('finance_visible_menus', JSON.stringify({ dashboard: true, analytics: false }))
    const { router } = open('/analytics?period=year&year=2025')
    expect(await screen.findByRole('button', { name: 'Show previous year' })).toBeInTheDocument()
    expect(href(router)).toBe('/analytics?period=year&year=2025')
    expect(screen.getAllByRole('link', { name: 'Analytics' })[0]).toHaveAttribute('aria-current', 'page')
  })

  it('commits calendar and period together as one history entry and preserves transfer filtering', async () => {
    const { router } = open('/dashboard?category=transfer')
    await screen.findByRole('combobox', { name: 'Transaction category' })
    expect(screen.getByRole('combobox', { name: 'Transaction category' })).toHaveValue('transfer')
    fireEvent.click(screen.getByRole('button', { name: 'Calendar', exact: true }))
    await waitFor(() => expect(href(router)).toBe('/dashboard?from=2026-10-01&to=2026-10-31&category=transfer&view=calendar'))
    expect(screen.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await go(router, -1)
    expect(href(router)).toBe('/dashboard?category=transfer')
    expect(screen.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Account overview')).toBeInTheDocument()
  })

  it('uses links for every section and handles unknown/hidden paths and trailing slashes', async () => {
    const { router } = open('/settings')
    expect(await screen.findByRole('heading', { name: 'App settings' })).toBeInTheDocument()
    clickLink('Investments')
    expect(await screen.findByRole('heading', { name: 'Investment portfolio' })).toBeInTheDocument()
    clickLink('Recurring')
    expect(await screen.findByRole('heading', { name: 'Recurring schedules' })).toBeInTheDocument()
    await go(router, '/missing')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    clickLink('Go to Dashboard')
    expect(await screen.findByText('Account overview')).toBeInTheDocument()
    await go(router, '/analytics/?period=year&year=2025')
    await waitFor(() => expect(href(router)).toBe('/analytics?period=year&year=2025'))
    localStorage.setItem('finance_visible_menus', JSON.stringify({ analytics: false, dashboard: false }))
    act(() => window.dispatchEvent(new Event('finance:menu-visibility')))
    await waitFor(() => expect(href(router)).toBe('/dashboard'))
  })

  it('keeps category deep links during loading and removes unavailable categories after success', async () => {
    let resolveCategories!: (response: Response) => void
    holdCategories = new Promise(resolve => { resolveCategories = resolve })
    const { router } = open('/dashboard?category=food&sort=invalid&notes=private')
    await waitFor(() => expect(href(router)).toBe('/dashboard?category=food'))
    await act(async () => { resolveCategories(Response.json(categories)) })
    expect(await screen.findByRole('combobox', { name: 'Transaction category' })).toHaveValue('food')
    await go(router, '/dashboard?category=removed')
    await waitFor(() => expect(href(router)).toBe('/dashboard'))
  })

  it('retains Projected links through loading and returns to Actual on period navigation', async () => {
    let resolveUpcoming!: (response: Response) => void
    holdUpcoming = new Promise(resolve => { resolveUpcoming = resolve })
    const { router } = open('/analytics?month=2026-10&mode=projected')
    await waitFor(() => expect(document.title).toBe('Analytics · Finance'))
    expect(href(router)).toContain('mode=projected')
    await act(async () => { resolveUpcoming(Response.json([pending, { ...pending, id: 'review', pending_kind: 'mcp_review' }])) })
    expect(await screen.findByRole('button', { name: 'Projected (1)' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Show previous month' }))
    await waitFor(() => expect(href(router)).toBe('/analytics?month=2026-09'))
    await go(router, -1)
    expect(href(router)).toBe('/analytics?month=2026-10&mode=projected')
    expect(screen.getByRole('button', { name: 'Projected (1)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('canonicalizes an ineligible Projected link without adding a history entry', async () => {
    upcoming = [{ ...pending, pending_kind: 'mcp_review' }]
    const { router } = open('/analytics?mode=projected', ['/settings', '/analytics?mode=projected'])
    await waitFor(() => expect(href(router)).toBe('/analytics'))
    expect(screen.queryByRole('button', { name: /Projected/ })).not.toBeInTheDocument()
    await go(router, -1)
    expect(href(router)).toBe('/settings')
  })

  it('retains a Projected URL on a failed first load rather than treating the failure as empty', async () => {
    holdUpcoming = Promise.resolve(Response.json({ error: 'Unavailable' }, { status: 503 }))
    const { router } = open('/analytics?mode=projected')
    expect(await screen.findByRole('alert')).toHaveTextContent('Upcoming transactions: Unavailable.')
    expect(href(router)).toBe('/analytics?mode=projected')
  })

  it('protects failed-save form values during menu navigation, Back, and reload', async () => {
    const { router } = open('/dashboard', ['/analytics', '/dashboard'])
    await screen.findByRole('button', { name: 'Add', exact: true })
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
    const note = screen.getByLabelText('Description')
    fireEvent.change(note, { target: { value: 'Unfinished private note' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'cash' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'food' } })
    failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Add Expense', exact: true }))
    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Expense', exact: true })).toBeEnabled())
    clickLink('Analytics')
    expect(await screen.findByRole('button', { name: 'Keep editing' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect([...router.state.blockers.values()].every(blocker => blocker.state === 'unblocked')).toBe(true))
    expect(href(router)).toBe('/dashboard')
    expect(note).toHaveValue('Unfinished private note')
    const reload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(reload)
    expect(reload.defaultPrevented).toBe(true)
    await go(router, -1)
    expect(await screen.findByRole('button', { name: 'Keep editing' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect([...router.state.blockers.values()].every(blocker => blocker.state === 'unblocked')).toBe(true))
    expect(note).toHaveValue('Unfinished private note')
    expect(href(router)).not.toMatch(/Unfinished|private|amount/)
    clickLink('Settings')
    fireEvent.click(await screen.findByRole('button', { name: 'Leave page' }))
    expect(await screen.findByRole('heading', { name: 'App settings' })).toBeInTheDocument()
  })
})

it('opens the global transaction editor on another section and retains a failed-save draft', async () => {
  const { router } = open('/settings')
  await screen.findByRole('heading', { name: 'App settings' })
  const compose = screen.getAllByRole('button', { name: 'New transaction', exact: true })[0]
  await waitFor(() => expect(compose).toBeEnabled())
  fireEvent.click(compose)
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Global draft' } })
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'cash' } })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'food' } })
  failSave = true
  fireEvent.click(screen.getByRole('button', { name: 'Add Expense' }))
  expect(await screen.findByText('Save failed')).toBeInTheDocument()
  fireEvent.click(compose)
  expect(screen.getByLabelText('Description')).toHaveValue('Global draft')
  clickLink('Dashboard')
  expect(await screen.findByRole('button', { name: 'Keep editing' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect([...router.state.blockers.values()].every(blocker => blocker.state === 'unblocked')).toBe(true))
  expect(href(router)).toBe('/settings')
  expect(screen.getByLabelText('Description')).toHaveValue('Global draft')
  clickLink('Dashboard')
  fireEvent.click(await screen.findByRole('button', { name: 'Leave page' }))
  await waitFor(() => expect(href(router)).toBe('/dashboard'))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Transaction' })).not.toBeInTheDocument())
})

it('supports Accounts deep links, trailing slash canonicalization and saved visibility', async () => {
  const { router } = open('/accounts/')
  await waitFor(() => expect(href(router)).toBe('/accounts'))
  expect(document.title).toBe('Accounts · Finance')
  expect(screen.getAllByRole('link', { name: 'Accounts' })[0]).toHaveAttribute('aria-current', 'page')
  localStorage.setItem('finance_visible_menus', JSON.stringify({ accounts: false }))
  act(() => window.dispatchEvent(new Event('finance:menu-visibility')))
  await waitFor(() => expect(href(router)).toBe('/dashboard'))
  expect(screen.queryByRole('link', { name: 'Accounts', exact: true })).not.toBeInTheDocument()
})

it('groups sidebar cash/investments and sorts both by converted monetary value', async () => {
  const baseFetch = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation(async (input, options) => {
    const url = String(input)
    const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '')
    if (path === '/accounts') return Response.json([
      { id: 'huf', name: 'Local cash', type: 'cash', currency: 'HUF', balance: 30000, updated_at: 1 },
      { id: 'eur', name: 'Euro cash', type: 'cash', currency: 'EUR', balance: 100, updated_at: 1 },
      { id: 'many', name: 'Many units', type: 'investment', asset_type: 'stock', symbol: 'LOW', currency: 'SHARE', balance: 100, updated_at: 1 },
      { id: 'valuable', name: 'Valuable holding', type: 'investment', asset_type: 'stock', symbol: 'HIGH', quote_currency: 'EUR', currency: 'SHARE', balance: 2, updated_at: 1 },
      { id: 'archived', name: 'Archived cash', type: 'cash', currency: 'HUF', balance: 0, archived_at: 1, updated_at: 1 },
    ])
    if (path === '/v6/latest/HUF') return Response.json({ rates: { HUF: 1, EUR: 1 / 400, USD: 1 / 360 } })
    if (path === '/investment-transactions') return Response.json([])
    if (path === '/market/quote') return Response.json({ regularMarketPrice: url.includes('HIGH') ? 200 : 1, currency: 'USD' })
    return baseFetch(input, options)
  })
  open('/dashboard')
  const cashGroup = await screen.findByRole('region', { name: 'Cash account shortcuts' })
  const investments = await screen.findByRole('region', { name: 'Investment account shortcuts' })
  const order = (group: HTMLElement) => within(group).getAllByRole('link').map(link => link.textContent)
  await waitFor(() => expect(order(cashGroup)[0]).toMatch(/^Euro cash/))
  await waitFor(() => expect(order(investments)[0]).toMatch(/^Valuable holding/))
  expect(order(cashGroup)[1]).toMatch(/^Local cash/)
  expect(order(investments)[1]).toMatch(/^Many units/)
  expect(cashGroup).toHaveTextContent('100 EUR')
  expect(investments).toHaveTextContent('160K HUF')
  expect(screen.queryByRole('link', { name: /Archived cash/ })).not.toBeInTheDocument()
})
