import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInvestmentData } from '../hooks/useInvestmentData'
import { calculatePosition } from '../components/investments-module/utils'

const holding = { id: 'holding', name: 'Synthetic holding', type: 'investment', balance: 0.1,
  currency: 'SHARE', quote_currency: 'USD', asset_type: 'stock', symbol: 'TEST', updated_at: 1 }
const buy = { id: 'buy', account_id: 'holding', type: 'buy', quantity: 0.1234567,
  price: 100, total_amount: 12.34567, date: '2026-10-01' }
const sell = { ...buy, id: 'sell', type: 'sell', quantity: 0.0234567, total_amount: 2.34567 }
const payloads: Record<string, unknown> = {}
const fetchMock = vi.fn<typeof fetch>()
const failed = new Set<string>()
beforeEach(() => {
  fetchMock.mockClear()
  failed.clear()
  Object.assign(payloads, {
    '/accounts': [holding, { ...holding, id: 'archived', archived_at: 1 }],
    '/investment-transactions': [buy, sell, { ...buy, id: 'old', account_id: 'archived' }],
    '/categories': [], '/market/quote': { regularMarketPrice: 150, currency: 'USD' },
    '/v6/latest/USD': { rates: { USD: 1, HUF: 400 } },
  })
  fetchMock.mockImplementation(async input => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
    return failed.has(path) ? Response.json({ error: 'Synthetic failure' }, { status: 503 }) : Response.json(payloads[path])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('portfolio snapshots across navigation', () => {
  it('loads on demand, retains fractional buy/sell history, and excludes archived accounts', async () => {
    const { result, rerender } = renderHook(({ active }) => useInvestmentData(active, 1), { initialProps: { active: false } })
    expect(fetchMock).not.toHaveBeenCalled()
    rerender({ active: true })
    await waitFor(() => expect(result.current.status.loaded).toBe(true))
    expect(result.current.data?.accounts.map(account => account.id)).toEqual(['holding'])
    expect(result.current.data?.transactions).toHaveLength(2)
    expect(result.current.data?.transactions[1]).toMatchObject({ amount: -2.34567, quantity: -0.0234567 })
    const snapshot = result.current.data!
    expect(calculatePosition(snapshot.accounts[0], snapshot.transactions, snapshot.quotes, snapshot.exchangeRates)).toMatchObject({
      actualQuantity: 0.1, currentValue: 15, netInvested: 10,
    })
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/investment-transactions'))).toHaveLength(1)
  })

  it('retains cash links on investment records without inventing links for standalone trades', async () => {
    payloads['/investment-transactions'] = [{ ...buy, linked_transaction_id: 'cash-purchase' }, sell]
    const { result } = renderHook(() => useInvestmentData(true, 1))
    await waitFor(() => expect(result.current.status.loaded).toBe(true))
    expect(result.current.data?.transactions[0]).toMatchObject({ id: 'buy', linked_transaction_id: 'cash-purchase' })
    expect(result.current.data?.transactions[1].linked_transaction_id).toBeUndefined()
  })

  it('retains data and display currency while a return visit refreshes in the background', async () => {
    const { result, rerender } = renderHook(({ active }) => useInvestmentData(active, 1), { initialProps: { active: true } })
    await waitFor(() => expect(result.current.status.loaded).toBe(true))
    const previous = result.current.data
    act(() => result.current.setCurrencyDisplay('USD'))
    rerender({ active: false })
    let release: (response: Response) => void = () => {}
    const baseFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, options) => String(input).includes('/investment-transactions')
      ? new Promise(resolve => { release = resolve }) : baseFetch(input, options))
    rerender({ active: true })
    await waitFor(() => expect(result.current.status.loading).toBe(true))
    expect(result.current.status.loaded).toBe(true)
    expect(result.current.data).toBe(previous)
    expect(result.current.currencyDisplay).toBe('USD')
    await act(async () => { release(Response.json([{ ...buy, quantity: 0.2, total_amount: 20 }])) })
    await waitFor(() => expect(result.current.status.loading).toBe(false))
    expect(result.current.data?.transactions[0].quantity).toBe(0.2)
  })

  it('keeps a complete snapshot after a failed refresh, including an empty portfolio', async () => {
    payloads['/accounts'] = []
    payloads['/investment-transactions'] = []
    const { result } = renderHook(() => useInvestmentData(true, 1))
    await waitFor(() => expect(result.current.status.loaded).toBe(true))
    const previous = result.current.data
    failed.add('/investment-transactions')
    await act(async () => { await result.current.refresh() })
    expect(result.current.data).toBe(previous)
    expect(result.current.status).toEqual({ loaded: true, loading: false, error: true, stale: true })
    failed.clear()
    await act(async () => { await result.current.refresh() })
    expect(result.current.status).toEqual({ loaded: true, loading: false, error: false, stale: false })
  })

  it.each(['/accounts', '/investment-transactions', '/categories'])('does not turn an initial %s failure into an empty portfolio', async path => {
    failed.add(path)
    const { result } = renderHook(() => useInvestmentData(true, 1))
    await waitFor(() => expect(result.current.status.error).toBe(true))
    expect(result.current.status.loaded).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('withholds incomplete prices and conversions while retaining native investment history', async () => {
    failed.add('/market/quote')
    failed.add('/v6/latest/USD')
    const { result } = renderHook(() => useInvestmentData(true, 1))
    await waitFor(() => expect(result.current.status.loaded).toBe(true))
    const snapshot = result.current.data!
    const position = calculatePosition(snapshot.accounts[0], snapshot.transactions, snapshot.quotes, snapshot.exchangeRates)
    expect(position).toMatchObject({ currentValue: null, priceFetchError: true, nativeInvested: 10, actualQuantity: 0.1 })
    expect(snapshot.exchangeRates).toEqual({})
  })

  it('invalidates hidden portfolios after a mutation and prevents a late older read from replacing them', async () => {
    const { result, rerender } = renderHook(({ active, key }) => useInvestmentData(active, key),
      { initialProps: { active: true, key: 1 } })
    await waitFor(() => expect(result.current.status.loaded).toBe(true))
    const previous = result.current.data
    let release: (response: Response) => void = () => {}
    const baseFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, options) => String(input).includes('/investment-transactions')
      ? new Promise(resolve => { release = resolve }) : baseFetch(input, options))
    let refreshing: Promise<void>
    act(() => { refreshing = result.current.refresh() })
    rerender({ active: false, key: 2 })
    await act(async () => { release(Response.json([])); await refreshing! })
    expect(result.current.data).toBe(previous)
    expect(result.current.status.stale).toBe(true)
    fetchMock.mockImplementation(baseFetch)
    payloads['/investment-transactions'] = [{ ...buy, quantity: 0.3 }]
    rerender({ active: true, key: 2 })
    await waitFor(() => expect(result.current.data?.transactions[0].quantity).toBe(0.3))
    expect(result.current.status.stale).toBe(false)
  })
})
