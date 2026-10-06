import { describe, expect, it } from 'vitest'
import { matchesText, matchesTransaction, transactionCurrency } from './global-search'

const accounts = [
  { id: 'huf', name: 'Daily spending', currency: 'HUF', type: 'cash' },
  { id: 'stock', name: 'Index fund', currency: 'SHARE', quote_currency: 'EUR', type: 'investment', asset_type: 'stock' },
]
const categories = [{ id: 'sub', name: 'Subscriptions' }]
const tx = { account_id: 'huf', category_id: 'sub', amount: -2990, description: 'Netflix subscription', date: '2020-03-15' }

describe('global transaction matching', () => {
  it('matches every term across descriptions, accounts, categories and historical dates', () => {
    for (const query of ['Netflix', 'daily spending', 'subscriptions', '2020-03-15', '15/03/2020', 'Netflix spending subscriptions']) {
      expect(matchesTransaction(query, tx, accounts, categories)).toBe(true)
    }
    expect(matchesTransaction('Netflix grocery', tx, accounts, categories)).toBe(false)
    expect(matchesText('cafe', 'Café')).toBe(true)
  })
  it('accepts native amounts with grouping, optional currency and explicit signs', () => {
    for (const query of ['2990', '2 990', '2,990', '2.990', '-2990', '2990 HUF', 'Netflix 2990']) {
      expect(matchesTransaction(query, tx, accounts, categories)).toBe(true)
    }
    for (const query of ['2990 EUR', '+2990', '299', '2990.5']) expect(matchesTransaction(query, tx, accounts, categories)).toBe(false)
    expect(matchesTransaction('12,50 EUR', { ...tx, account_id: 'stock', amount: -12.5 }, accounts, categories)).toBe(true)
    expect(matchesTransaction('12.50', { ...tx, amount: -12.5 }, accounts, categories)).toBe(true)
  })
  it('distinguishes investment fiat transaction amounts from holding units', () => {
    expect(transactionCurrency(accounts[1])).toBe('EUR')
    expect(matchesTransaction('100 EUR', { ...tx, account_id: 'stock', amount: 100 }, accounts, categories)).toBe(true)
    expect(matchesTransaction('100 SHARE', { ...tx, account_id: 'stock', amount: 100 }, accounts, categories)).toBe(false)
    expect(matchesTransaction('anything', { ...tx, account_id: 'missing', category_id: undefined, description: undefined }, [], [])).toBe(false)
    expect(matchesTransaction(' ', tx, accounts, categories)).toBe(true)
  })
})
