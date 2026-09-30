import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardService } from '../services/dashboard.service'

const accounts = [
  { id: 'huf', type: 'cash', balance: 100_000, currency: 'HUF' },
  { id: 'usd', type: 'cash', balance: 100, currency: 'USD' },
  { id: 'eur', type: 'cash', balance: 100, currency: 'EUR' },
]
const service = (rows = accounts) => new DashboardService({ findAll: async () => rows } as never)
const rates = (values: unknown) => vi.stubGlobal('fetch', vi.fn(async () => Response.json({ result: 'success', rates: values })))
afterEach(() => vi.unstubAllGlobals())

describe('dashboard currency safety', () => {
  it('returns a complete converted net worth for mixed accounts', async () => {
    rates({ HUF: 1, USD: 1 / 360, EUR: 1 / 400 })
    expect(await service().getNetWorth()).toMatchObject({ net_worth: 176_000, missing_currencies: [] })
  })
  it.each([undefined, 0, -1, '0.002', Infinity])('returns null plus native account details when a rate is %s', async rate => {
    rates({ HUF: 1, USD: rate, EUR: 1 / 400 })
    const result = await service().getNetWorth()
    expect(result.net_worth).toBeNull()
    expect(result.missing_currencies).toEqual(['USD'])
    expect(result.accounts).toContainEqual({ id: 'usd', balance: 100, currency: 'USD', balance_in_master: null })
    expect(result.accounts).toContainEqual({ id: 'eur', balance: 100, currency: 'EUR', balance_in_master: 40_000 })
  })
  it('recovers from a service outage without labelling foreign balances as HUF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await service().getNetWorth()).toMatchObject({ net_worth: null, missing_currencies: ['EUR', 'USD'] })
    expect(await service([accounts[0]]).getNetWorth()).toMatchObject({ net_worth: 100_000, missing_currencies: [] })
    rates({ HUF: 1, USD: 1 / 360, EUR: 1 / 400 })
    expect((await service().getNetWorth()).net_worth).toBe(176_000)
  })
  it('does not require rates for excluded accounts or holding-unit currencies', async () => {
    rates({})
    const rows = [accounts[0], { ...accounts[1], exclude_from_net_worth: true }, { ...accounts[2], type: 'investment', currency: 'SHARE' }]
    expect(await service(rows).getNetWorth()).toMatchObject({ net_worth: 100_000, missing_currencies: [] })
  })
  it('fails a spending estimate explicitly rather than using a raw foreign expense', async () => {
    rates({ HUF: 1 })
    const dashboard = new DashboardService(
      { findAll: async () => accounts } as never,
      { findAll: async () => [{ id: 'expense', account_id: 'usd', amount: -100, date: '2026-09-01' }] } as never,
      {} as never, {} as never,
    )
    await expect(dashboard.getSpendingEstimate('month')).rejects.toMatchObject({ code: 'EXCHANGE_RATE_UNAVAILABLE', statusCode: 503 })
  })
})
