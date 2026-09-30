import { describe, expect, it } from 'vitest'
import { calculatePosition, convertToDisplayCurrency } from './utils'

describe('calculatePosition', () => {
  it('converts EUR-listed securities to USD only after valuing them in EUR', () => {
    const position = calculatePosition(
      {
        id: 'vwce',
        name: 'Vanguard FTSE All-World',
        type: 'investment',
        balance: 25,
        currency: 'SHARE',
        quote_currency: 'EUR',
        symbol: 'VWCE.MI',
        asset_type: 'stock',
        updated_at: 0,
      },
      [{
        id: 'purchase',
        account_id: 'vwce',
        amount: 4_000,
        quantity: 25,
        price: 160,
        date: '2026-07-14',
        is_recurring: false,
      }],
      { 'VWCE.MI': { regularMarketPrice: 165, currency: 'EUR' } },
      { EUR: 0.85 },
    )

    expect(position.quoteCurrency).toBe('EUR')
    expect(position.displayValue).toBe(4_125)
    expect(position.currentValue).toBeCloseTo(4_125 / 0.85)
    expect(position.nativeInvested).toBe(4_000)
    expect(position.netInvested).toBeCloseTo(4_000 / 0.85)
  })
})

describe('missing investment FX', () => {
  const manual = { id: 'manual', name: 'Manual', type: 'investment' as const, balance: 40_000, currency: 'HUF', asset_type: 'manual' as const, updated_at: 0 }
  it.each([undefined, 0, -1, Infinity, NaN])('keeps native manual value but withholds USD value for rate %s', rate => {
    const position = calculatePosition(manual, [], {}, { HUF: rate as number })
    expect(position.displayValue).toBe(40_000)
    expect(position.nativeInvested).toBe(40_000)
    expect(position.currentValue).toBeNull()
    expect(position.netInvested).toBeNull()
    expect(position.gainLoss).toBeNull()
    expect(position.missingCurrencies).toEqual(['HUF'])
  })
  it('converts manual returns and invested amounts consistently', () => {
    const position = calculatePosition(manual, [{ id: 'gain', account_id: 'manual', amount: 360, date: '2026-09-01', is_recurring: false }], {}, { HUF: 360 })
    expect(position.netInvested).toBeCloseTo(40_000 / 360)
    expect(position.gainLoss).toBe(1)
  })
  it('preserves EUR quote values but withholds portfolio value without EUR FX', () => {
    const stock = { ...manual, balance: 2, currency: 'SHARE', quote_currency: 'EUR', symbol: 'TEST', asset_type: 'stock' as const }
    const position = calculatePosition(stock, [{ id: 'buy', account_id: 'manual', amount: 20, quantity: 2, date: '2026-09-01', is_recurring: false }], { TEST: { regularMarketPrice: 12, currency: 'EUR' } }, {})
    expect(position.displayValue).toBe(24)
    expect(position.nativeInvested).toBe(20)
    expect(position.currentValue).toBeNull()
    expect(position.missingCurrencies).toEqual(['EUR'])
  })
  it('uses the selected display currency even when reporting settings differ', () => {
    expect(convertToDisplayCurrency(100, 'HUF', { HUF: 360, EUR: 0.9 })).toBe(36_000)
    expect(convertToDisplayCurrency(100, 'HUF', {})).toBeNull()
    expect(convertToDisplayCurrency(100, 'USD', {})).toBe(100)
  })
})
