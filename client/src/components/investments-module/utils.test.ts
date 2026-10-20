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
    expect(position.nativeInvested).toBeNull()
    expect(position.netInvested).toBeNull()
  })
})

describe('missing investment FX', () => {
  const manual = { id: 'manual', name: 'Manual', type: 'investment' as const, balance: 40_000, currency: 'HUF', asset_type: 'manual' as const, updated_at: 0 }
  it.each([undefined, 0, -1, Infinity, NaN])('keeps native manual value but withholds USD value for rate %s', rate => {
    const position = calculatePosition(manual, [], {}, { HUF: rate as number })
    expect(position.displayValue).toBe(40_000)
    expect(position.nativeInvested).toBeNull()
    expect(position.currentValue).toBeNull()
    expect(position.netInvested).toBeNull()
    expect(position.gainLoss).toBeNull()
    expect(position.missingCurrencies).toEqual(['HUF'])
  })
  it('does not invent manual cost or profit from a current appraisal', () => {
    const position = calculatePosition(manual, [{ id: 'gain', account_id: 'manual', amount: 360, date: '2026-09-01', is_recurring: false }], {}, { HUF: 360 })
    expect(position.netInvested).toBeNull()
    expect(position.gainLoss).toBeNull()
  })
  it('preserves EUR quote values but withholds portfolio value without EUR FX', () => {
    const stock = { ...manual, balance: 2, currency: 'SHARE', quote_currency: 'EUR', symbol: 'TEST', asset_type: 'stock' as const }
    const position = calculatePosition(stock, [{ id: 'buy', account_id: 'manual', amount: 20, quantity: 2, date: '2026-09-01', is_recurring: false }], { TEST: { regularMarketPrice: 12, currency: 'EUR' } }, {})
    expect(position.displayValue).toBe(24)
    expect(position.nativeInvested).toBeNull()
    expect(position.currentValue).toBeNull()
    expect(position.missingCurrencies).toEqual(['EUR'])
  })
  it('uses the selected display currency even when reporting settings differ', () => {
    expect(convertToDisplayCurrency(100, 'HUF', { HUF: 360, EUR: 0.9 })).toBe(36_000)
    expect(convertToDisplayCurrency(100, 'HUF', {})).toBeNull()
    expect(convertToDisplayCurrency(100, 'USD', {})).toBe(100)
  })
})

describe('holding metadata reads', () => {
  it('values stored units even when the available trade history is shorter', () => {
    const account = { id: 'opening', name: 'Opening ETF', type: 'investment' as const, balance: 5, currency: 'SHARE', quote_currency: 'EUR', asset_type: 'etf' as const, updated_at: 1,
      holding_position: { quantity: 5, activity_quantity: 2, residual: 3, history_status: 'mismatch' as const, coverage_reasons: ['unknown_opening'], anchor: null } }
    const position = calculatePosition(account, [{ id: 'buy', account_id: 'opening', amount: 20, quantity: 2, date: '2026-01-02', is_recurring: false }], { 'TEST': { regularMarketPrice: 12 } }, { EUR: 1 })
    expect(position.actualQuantity).toBe(5)
    expect(position.netInvested).toBeNull()
    expect(position.gainLoss).toBeNull()
  })
  it('uses a saved manual unit price without requiring a market symbol', () => {
    const account = { id: 'manual-etf', name: 'Manual ETF', type: 'investment' as const, balance: 2, currency: 'SHARE', quote_currency: 'EUR', asset_type: 'etf' as const, pricing_method: 'manual' as const, manual_price: 120, updated_at: 1 }
    const position = calculatePosition(account, [], {}, { EUR: 0.8 })
    expect(position.displayValue).toBe(240)
    expect(position.currentValue).toBe(300)
    expect(position.priceFetchError).toBe(false)
  })
})

describe('server accounting ledgers',()=>{
  it('uses selected-currency history directly and preserves negative invested cash',()=>{
    const account={id:'cash-ledger',name:'Synthetic',type:'investment' as const,balance:1,currency:'SHARE',quote_currency:'USD',asset_type:'stock' as const,updated_at:0}
    const metrics={account_id:account.id,currency:'HUF',quantity:1,value:20000,native_value:50,native_currency:'USD',remaining_basis:20000,average_cost:20000,net_invested:-45600,realized_gain:65600,unrealized_gain:0,total_gain:65600,
      native:{remaining_basis:50,average_cost:50,net_invested:-114,realized_gain:164,unrealized_gain:0,total_gain:164},allocation_percent:100,
      estimated_return_percent:null,unrealized_gain_percent:0,trade_realized:{},performance_start:null,coverage:{value:[],cost:[]},price_change:null,price_change_percent:null}
    const position=calculatePosition(account,[],{}, {USD:1,HUF:999},metrics,'HUF')
    expect(position).toMatchObject({currentValue:20000,netInvested:-45600,gainLoss:65600,gainLossPercent:null,nativeInvested:-114,reportingCurrency:'HUF'})
  })
})
