import { describe, expect, it } from 'vitest'
import { accountValueForOrdering, sortAccountsByValue } from './account-order'
import type { ValuedAccount } from './account-order'

const rates = { HUF: 1, EUR: 1 / 400, USD: 1 / 360 }
const cash = (id: string, balance: number, currency = 'HUF'): ValuedAccount => ({ id, name: id, type: 'cash', balance, currency })

describe('account value ordering', () => {
  it('compares converted cash balances rather than raw foreign amounts and preserves input order', () => {
    const accounts = [cash('HUF account', 30000), cash('EUR account', 100, 'EUR'), cash('USD account', 100, 'USD')]
    const values = Object.fromEntries(accounts.map(account => [account.id, accountValueForOrdering(account, {}, 'HUF', rates).value]))
    expect(sortAccountsByValue(accounts, values).map(account => account.id)).toEqual(['EUR account', 'USD account', 'HUF account'])
    expect(accounts.map(account => account.id)).toEqual(['HUF account', 'EUR account', 'USD account'])
  })

  it('values stocks/crypto in their quote currency and manual assets in native currency', () => {
    const accounts: ValuedAccount[] = [
      { ...cash('Many units', 100, 'SHARE'), type: 'investment', asset_type: 'stock', symbol: 'LOW' },
      { ...cash('Valuable holding', 2, 'SHARE'), type: 'investment', asset_type: 'stock', symbol: 'HIGH', quote_currency: 'EUR' },
      { ...cash('Manual asset', 200, 'USD'), type: 'investment', asset_type: 'manual', symbol: 'IGNORED' },
      { ...cash('Crypto', 0.01, 'BTC'), type: 'investment', asset_type: 'crypto', symbol: 'BTC-USD' },
    ]
    const quotes = { LOW: { regularMarketPrice: 1, currency: 'USD' }, HIGH: { regularMarketPrice: 200, currency: 'USD' }, 'BTC-USD': { regularMarketPrice: 10000, currency: 'USD' } }
    const values = Object.fromEntries(accounts.map(account => [account.id, accountValueForOrdering(account, quotes, 'HUF', rates).value]))
    expect(values).toEqual({ 'Many units': 36000, 'Valuable holding': 160000, 'Manual asset': 72000, Crypto: 36000 })
    expect(sortAccountsByValue(accounts, values).map(account => account.id)).toEqual(['Valuable holding', 'Manual asset', 'Crypto', 'Many units'])
  })

  it('lists unavailable values last without inventing exchange rates or prices', () => {
    const accounts: ValuedAccount[] = [cash('Foreign', 1000000, 'EUR'), cash('Debt', -100), cash('Zero', 0), { ...cash('No quote', 1000000, 'SHARE'), type: 'investment', symbol: 'MISSING' }]
    const values = Object.fromEntries(accounts.map(account => [account.id, accountValueForOrdering(account, {}, 'HUF', {}).value]))
    expect(values).toEqual({ Foreign: null, Debt: -100, Zero: 0, 'No quote': null })
    expect(sortAccountsByValue(accounts, values).map(account => account.id)).toEqual(['Zero', 'Debt', 'Foreign', 'No quote'])
    expect(accountValueForOrdering(accounts[0], {}, 'HUF', { EUR: 0 })).toMatchObject({ value: null, missingCurrencies: ['EUR'] })
  })

  it('uses stable name/id ties and treats invalid sort values as unavailable', () => {
    const accounts = [{ id: 'b', name: 'Same' }, { id: 'a', name: 'Same' }, { id: 'bad', name: 'Bad' }]
    expect(sortAccountsByValue(accounts, { a: 1, b: 1, bad: NaN }).map(account => account.id)).toEqual(['a', 'b', 'bad'])
  })

  it('recognizes empty market positions without quotes and rejects invalid nonzero prices', () => {
    const account = { ...cash('Stock', 0, 'SHARE'), type: 'investment', symbol: 'TEST' }
    expect(accountValueForOrdering(account, {}, 'HUF', {}).value).toBe(0)
    for (const price of [0, -1, NaN, Infinity]) {
      expect(accountValueForOrdering({ ...account, balance: 1 }, { TEST: { regularMarketPrice: price } }, 'HUF', rates).value).toBe(null)
    }
  })
})
