import { describe, expect, it } from 'vitest'
import { calculatePosition } from './utils'

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
