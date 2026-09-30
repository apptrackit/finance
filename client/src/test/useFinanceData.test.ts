import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useFinanceData } from '../hooks/useFinanceData'

const mockAccount = {
  id: 'acc-1', name: 'Test Account', type: 'cash', balance: 100000,
  currency: 'HUF', updated_at: 1,
}
const mockTransaction = {
  id: 'tx-1', account_id: 'acc-1', amount: -5000, date: '2026-04-01', category_id: 'cat-1',
}
const investmentAccount = { ...mockAccount, id: 'investment', type: 'investment', asset_type: 'manual' }
const investmentTransaction = {
  id: 'investment-tx', account_id: 'investment', type: 'buy', quantity: 2,
  price: 500, total_amount: 1000, date: '2026-04-02', notes: 'Purchase',
}
const category = { id: 'cat-1', name: 'Expense', type: 'expense' }
const dateRange = { startDate: '2026-04-01', endDate: '2026-04-30' }
const payloads: Record<string, unknown> = {}
const failures = new Map<string, () => Promise<Response>>()
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  failures.clear()
  Object.keys(payloads).forEach(key => delete payloads[key])
  Object.assign(payloads, {
    '/accounts': [mockAccount], '/transactions/date-range': [mockTransaction],
    '/transactions': [mockTransaction], '/transactions/upcoming': [], '/categories': [category],
    '/dashboard/net-worth': { net_worth: 100000 },
    '/investment-transactions': [investmentTransaction],
    '/v6/latest/HUF': { rates: { HUF: 1, USD: 0.0026, EUR: 0.0025 } },
  })
  fetchMock.mockImplementation(async input => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
    if (failures.has(path)) return failures.get(path)!()
    return Response.json(payloads[path] ?? [])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function setup() { return renderHook(() => useFinanceData(dateRange, 'HUF')) }
async function settled(result: ReturnType<typeof setup>['result']) {
  await waitFor(() => expect(result.current.transactionsLoading).toBe(false))
  await waitFor(() => expect(result.current.allTransactionsLoading).toBe(false))
  await waitFor(() => expect(result.current.dataStatus.categories.loading).toBe(false))
}

const failureCases = [
  ['401', async () => Response.json({ error: 'Private payload' }, { status: 401 })],
  ['403', async () => Response.json({ error: 'Private payload' }, { status: 403 })],
  ['500', async () => Response.json({ error: 'Private payload' }, { status: 500 })],
  ['network', async () => { throw new Error('Private payload') }],
  ['invalid JSON', async () => new Response('{')],
  ['wrong shape', async () => Response.json({ unexpected: true })],
  ['invalid row', async () => Response.json([null])],
] as const

describe('useFinanceData', () => {
  it('distinguishes initial loading from a genuine loaded-empty response', async () => {
    for (const path of ['/accounts', '/transactions', '/transactions/date-range', '/transactions/upcoming', '/categories']) payloads[path] = []
    const { result } = setup()
    expect(result.current.dataStatus.accounts).toMatchObject({ loading: true, loaded: false, error: false })
    await settled(result)
    expect(result.current.accounts).toEqual([])
    expect(result.current.transactions).toEqual([])
    expect(result.current.dataStatus.accounts).toEqual({ loading: false, loaded: true, error: false, stale: false })
    expect(result.current.dataStatus.history.loaded).toBe(true)
  })

  it.each(failureCases)('shows an initial account %s failure instead of a loaded empty snapshot', async (_, fail) => {
    failures.set('/accounts', fail)
    const { result } = setup()
    await settled(result)
    expect(result.current.dataStatus.accounts).toEqual({ loading: false, loaded: false, error: true, stale: false })
    expect(result.current.dataStatus.transactions.error).toBe(true)
    expect(result.current.dataStatus.history.error).toBe(true)
    expect(result.current.dataStatus.categories.loaded).toBe(true)
  })

  it.each([
    ['/transactions/date-range', 'transactions'], ['/transactions', 'history'],
    ['/transactions/upcoming', 'upcoming'], ['/categories', 'categories'],
    ['/dashboard/net-worth', 'netWorth'],
  ] as const)('exposes partial failure in %s while loading other datasets', async (path, key) => {
    failures.set(path, async () => Response.json({ error: 'Unavailable' }, { status: 500 }))
    const { result } = setup()
    await settled(result)
    await waitFor(() => expect(result.current.dataStatus[key].error).toBe(true))
    expect(result.current.dataStatus[key].loaded).toBe(false)
    expect(result.current.accounts).toEqual([mockAccount])
    expect(result.current.dataStatus.accounts.error).toBe(false)
    if (key !== 'history') expect(result.current.allTransactions).toEqual([mockTransaction])
  })

  it('retains every last successful dataset during a failed refresh and clears stale errors on retry', async () => {
    const { result } = setup()
    await settled(result)
    const original = result.current
    for (const path of ['/accounts', '/transactions/date-range', '/transactions', '/transactions/upcoming', '/categories', '/dashboard/net-worth', '/v6/latest/HUF']) {
      failures.set(path, async () => { throw new Error('Network failure') })
    }
    await act(async () => { await result.current.handleDataChange() })
    for (const key of ['accounts', 'transactions', 'history', 'upcoming', 'categories', 'netWorth', 'exchangeRates'] as const) {
      expect(result.current.dataStatus[key]).toEqual({ loading: false, loaded: true, error: true, stale: true })
    }
    expect(result.current.accounts).toEqual(original.accounts)
    expect(result.current.transactions).toEqual(original.transactions)
    expect(result.current.allTransactions).toEqual(original.allTransactions)
    expect(result.current.netWorth).toBe(100000)
    expect(result.current.categories).toEqual([category])
    expect(result.current.exchangeRates).toEqual(original.exchangeRates)
    failures.clear()
    payloads['/transactions'] = []
    await act(async () => { await result.current.handleDataChange() })
    expect(result.current.allTransactions).toEqual([])
    expect(result.current.dataStatus.history).toEqual({ loading: false, loaded: true, error: false, stale: false })
    expect(result.current.dataStatus.accounts.stale).toBe(false)
  })

  it.each([
    ['/transactions/date-range', 'transactions'], ['/transactions', 'history'],
    ['/transactions/upcoming', 'upcoming'], ['/categories', 'categories'],
  ] as const)('rejects malformed %s data rather than marking it loaded-empty', async (path, key) => {
    payloads[path] = { error: 'Unexpected response' }
    const { result } = setup()
    await settled(result)
    expect(result.current.dataStatus[key]).toMatchObject({ loaded: false, error: true, stale: false })
    expect(result.current.dataStatus.accounts.loaded).toBe(true)
  })

  it('recovers from an initial failure with the same retry action used for mutations', async () => {
    failures.set('/accounts', async () => { throw new Error('offline') })
    const { result } = setup()
    await settled(result)
    failures.clear()
    fetchMock.mockClear()
    await act(async () => { await result.current.handleDataChange() })
    expect(result.current.accounts).toEqual([mockAccount])
    expect(result.current.transactions).toEqual([mockTransaction])
    expect(result.current.allTransactions).toEqual([mockTransaction])
    expect(result.current.dataStatus.accounts.error).toBe(false)
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some(url => url.includes('/transactions/date-range'))).toBe(true)
    expect(urls).toContain('/api/transactions')
    expect(urls).toContain('/api/accounts')
  })

  it('keeps period transactions distinct from complete cash and investment history', async () => {
    payloads['/accounts'] = [mockAccount, investmentAccount]
    payloads['/transactions'] = [mockTransaction, { ...mockTransaction, id: 'older', date: '2026-03-01' }]
    payloads['/investment-transactions'] = [investmentTransaction, { ...investmentTransaction, id: 'older-investment', date: '2026-03-02' }]
    const { result } = setup()
    await settled(result)
    expect(result.current.transactions.map(row => row.id)).toEqual(['investment-tx', 'tx-1'])
    expect(result.current.allTransactions.map(row => row.id)).toEqual(['investment-tx', 'tx-1', 'older-investment', 'older'])
  })

  it.each(failureCases)('does not publish truncated histories after an investment %s failure', async (_, fail) => {
    payloads['/accounts'] = [mockAccount, investmentAccount]
    const { result } = setup()
    await settled(result)
    const originalTransactions = result.current.transactions
    const originalHistory = result.current.allTransactions
    failures.set('/investment-transactions', fail)
    payloads['/transactions'] = []
    await act(async () => { await result.current.handleDataChange() })
    expect(result.current.transactions).toEqual(originalTransactions)
    expect(result.current.allTransactions).toEqual(originalHistory)
    expect(result.current.dataStatus.transactions).toMatchObject({ error: true, stale: true })
    expect(result.current.dataStatus.history).toMatchObject({ error: true, stale: true })
  })

  it('preserves investment value if any market quote fails and uses a privacy-safe error', async () => {
    payloads['/accounts'] = [
      { ...investmentAccount, id: 'one', asset_type: 'stock', symbol: 'ONE', currency: 'USD', balance: 2 },
      { ...investmentAccount, id: 'two', asset_type: 'stock', symbol: 'TWO', currency: 'USD', balance: 2 },
    ]
    payloads['/market/quote'] = { regularMarketPrice: 10, currency: 'HUF' }
    const { result } = setup()
    await waitFor(() => expect(result.current.dataStatus.investment.loaded).toBe(true))
    expect(result.current.investmentValue).toBe(40)
    fetchMock.mockImplementation(async input => {
      const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
      if (String(input).includes('symbol=TWO')) return Response.json({ error: 'Private account details' }, { status: 403 })
      return Response.json(payloads[path] ?? [])
    })
    await act(async () => { await result.current.fetchInvestmentValue() })
    expect(result.current.investmentValue).toBe(40)
    expect(result.current.dataStatus.investment).toMatchObject({ error: true, stale: true })
    expect(result.current.investmentError).toBe('Unable to load investment value.')
  })

  it('ignores an older date-range response that finishes after a newer request', async () => {
    let resolveOld: (response: Response) => void = () => {}
    failures.set('/transactions/date-range', () => new Promise(resolve => { resolveOld = resolve }))
    const { result, rerender } = renderHook(({ range }) => useFinanceData(range, 'HUF'), { initialProps: { range: dateRange } })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/transactions/date-range'))).toBe(true))
    failures.clear()
    payloads['/transactions/date-range'] = [{ ...mockTransaction, id: 'newer', date: '2026-05-01' }]
    rerender({ range: { startDate: '2026-05-01', endDate: '2026-05-31' } })
    await waitFor(() => expect(result.current.transactions[0]?.id).toBe('newer'))
    await act(async () => { resolveOld(Response.json([mockTransaction])) })
    expect(result.current.transactions[0]?.id).toBe('newer')
    expect(result.current.dataStatus.transactions.error).toBe(false)
  })
  it('accepts unavailable API net worth as a loaded result with missing-rate details', async () => {
    payloads['/dashboard/net-worth'] = { net_worth: null, missing_currencies: ['EUR'] }
    const { result } = setup()
    await waitFor(() => expect(result.current.dataStatus.netWorth.loaded).toBe(true))
    expect(result.current.netWorth).toBeNull()
    expect(result.current.netWorthMissingCurrencies).toEqual(['EUR'])
    expect(result.current.dataStatus.netWorth.error).toBe(false)
  })

  it.each(['manual', 'stock'])('makes %s investment FX unavailable and restores it after retry', async assetType => {
    payloads['/accounts'] = [{ ...investmentAccount, asset_type: assetType, symbol: 'TEST', currency: 'EUR', quote_currency: 'EUR', balance: 2 }]
    payloads['/market/quote'] = { regularMarketPrice: 10, currency: 'EUR' }
    payloads['/v6/latest/HUF'] = { rates: { HUF: 1 } }
    const { result } = setup()
    await waitFor(() => expect(result.current.dataStatus.investment.loaded).toBe(true))
    expect(result.current.investmentValue).toBeNull()
    expect(result.current.investmentMissingCurrencies).toEqual(['EUR'])
    payloads['/v6/latest/HUF'] = { rates: { HUF: 1, EUR: 1 / 400 } }
    await act(async () => { await result.current.fetchInvestmentValue() })
    expect(result.current.investmentValue).toBe(assetType === 'manual' ? 800 : 8000)
    expect(result.current.investmentMissingCurrencies).toEqual([])
  })

  it('withholds required conversions after a rate-service failure and recovers on retry', async () => {
    payloads['/accounts'] = [{ ...investmentAccount, currency: 'EUR', balance: 100 }]
    const { result } = setup()
    await waitFor(() => expect(result.current.dataStatus.investment.loaded).toBe(true))
    failures.set('/v6/latest/HUF', async () => { throw new Error('offline') })
    await act(async () => { await result.current.handleDataChange(); await result.current.fetchInvestmentValue() })
    expect(result.current.usableExchangeRates).toEqual({})
    expect(result.current.investmentValue).toBeNull()
    expect(result.current.investmentMissingCurrencies).toEqual(['EUR'])
    failures.clear()
    await act(async () => { await result.current.handleDataChange(); await result.current.fetchInvestmentValue() })
    expect(result.current.investmentValue).toBe(40_000)
    expect(result.current.investmentMissingCurrencies).toEqual([])
  })

})
