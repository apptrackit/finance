import { describe, expect, it } from 'vitest'
import examples from '../../../tests/fixtures/investment-accounting-v1.json'
import { convertCurrency, sumAvailable } from '../../../shared/currency'

// Arithmetic checks for a reviewed specification, not the future investment
// implementation. Its adapters must later run against these same golden inputs.
const close = (actual: number | null, expected: number | null) => {
  if (expected === null) expect(actual).toBeNull()
  else {
    expect(actual).not.toBeNull()
    expect(actual!).toBeCloseTo(expected, 9)
  }
}

describe('investment accounting contract v1 examples', () => {
  it('reconciles remaining weighted-average basis, actual cash and lifetime gain', () => {
    let units = 0
    let basis = 0
    let realized = 0
    let invested = 0
    for (const event of examples.weighted_average.events) {
      const gross = event.quantity * event.price
      const buy = event.type === 'buy'
      close(event.net_cash, gross + (buy ? event.included_fee : -event.included_fee))
      if (buy) {
        units += event.quantity
        basis += event.net_cash
        invested += event.net_cash
      } else {
        expect(event.quantity).toBeLessThanOrEqual(units)
        const removedBasis = basis * event.quantity / units
        realized += event.net_cash - removedBasis
        basis -= removedBasis
        units -= event.quantity
        invested -= event.net_cash
      }
      const value = units === 0 ? 0 : units * event.mark!
      const unrealized = value - basis
      const expected = event.expected
      close(units, expected.quantity)
      close(basis, expected.remaining_basis)
      close(realized, expected.realized_gain)
      close(invested, expected.net_invested)
      close(units > 0 ? basis / units : null, expected.average_cost)
      close(value, expected.value)
      close(unrealized, expected.unrealized_gain)
      close(realized + unrealized, expected.total_gain)
      close(value - invested, expected.total_gain)
    }
  })

  it('preserves a current observation without fabricating an opening acquisition', () => {
    const fixture = examples.unknown_opening
    close(fixture.stored_current_quantity * fixture.price, fixture.expected.value)
    close(fixture.stored_current_quantity, fixture.expected.quantity)
    close(fixture.stored_current_quantity - fixture.signed_activity_quantity, fixture.expected.residual)
    expect(fixture.expected.opening_date).toBeNull()
    expect(fixture.expected.historical_quantity).toBeNull()
    expect(fixture.expected.remaining_basis).toBeNull()
    expect(fixture.expected.net_invested).toBeNull()
    expect(fixture.expected.total_gain).toBeNull()
    expect(fixture.expected.reasons).toContain('quantity_mismatch')
  })

  it('allows a known remaining basis after disposing all unknown-cost units, not a known lifetime return', () => {
    const fixture = examples.unknown_cost_disposal
    close(fixture.opening_quantity - fixture.sale_quantity + fixture.rebuy_quantity, fixture.expected.quantity)
    close(fixture.rebuy_cash, fixture.expected.remaining_basis)
    expect(fixture.opening_cost).toBeNull()
    expect(fixture.expected.lifetime_realized_gain).toBeNull()
    expect(fixture.expected.lifetime_net_invested).toBeNull()
    expect(fixture.expected.lifetime_total_gain).toBeNull()
  })

  it('does not treat known imported remaining basis as a lifetime cash contribution', () => {
    const f = examples.known_basis_unknown_cash
    close(f.opening_quantity * f.price, f.expected.value)
    close(f.expected.value - f.remaining_basis, f.expected.unrealized_gain)
    expect(f.expected.net_invested).toBeNull()
    expect(f.expected.lifetime_realized_gain).toBeNull()
    expect(f.expected.total_gain).toBeNull()
  })

  it('preserves small crypto units rather than rounding them as cash', () => {
    const f = examples.fractional_crypto
    close(f.quantity * f.price_usd + f.included_fee_usd, f.net_cash_usd)
    close(f.net_cash_usd, f.expected.remaining_basis_usd)
    close(f.net_cash_usd / f.quantity, f.expected.average_cost_usd)
    close(f.quantity * f.mark_usd, f.expected.value_usd)
    close(f.expected.value_usd - f.net_cash_usd, f.expected.unrealized_gain_usd)
    expect(f.quantity).toBeGreaterThan(0)
    expect(Math.round(f.quantity * 100) / 100).toBe(0)
  })

  it('keeps exact reporting-currency acquisition cost separate from current-FX native gain', () => {
    const f = examples.cross_currency
    const e = f.expected
    close(f.quantity * f.execution_price, e.gross_execution)
    close(f.net_cash_paid - f.included_fee_cash, e.gross_cash)
    close(e.gross_cash / e.gross_execution, e.implied_cash_per_execution)
    close(f.included_fee_cash / e.implied_cash_per_execution, e.fee_execution)
    close(e.gross_execution + e.fee_execution, e.native_basis)
    close(f.net_cash_paid, e.reporting_basis)
    close(f.quantity * f.mark_price, e.native_value)
    close(e.native_value * f.mark_huf_per_eur, e.reporting_value)
    close(e.native_value - e.native_basis, e.native_unrealized_gain)
    close(e.reporting_value - e.reporting_basis, e.reporting_unrealized_gain)
    close(e.native_unrealized_gain * f.mark_huf_per_eur, e.incorrect_current_fx_gain)
    expect(e.incorrect_current_fx_gain).not.toEqual(e.reporting_unrealized_gain)
  })

  it('carries a manual observation forward only, with no contribution on revaluation', () => {
    const f = examples.manual_total
    for (const observation of f.observations) {
      const known = f.valuations.filter(value => value.date <= observation.date).at(-1)
      close(known?.value ?? null, observation.expected_value)
    }
    close(f.acquisition_cost, f.expected.net_invested)
    close(f.acquisition_cost, f.expected.remaining_basis)
    close(f.expected.value - f.expected.remaining_basis, f.expected.unrealized_gain)
    expect(f.expected.cash_delta_on_revaluation).toBe(0)
    expect(f.expected.unit_delta_on_revaluation).toBe(0)
  })

  for (const period of examples.periods) {
    it(`checks daily cash-flow timing and geometric linking: ${period.id}`, () => {
      let previous: number | null = period.start_value
      let product = 1
      let covered = true
      let activeDays = 0
      let netFlow: number | null = 0
      for (const day of period.days) {
        const { value, contribution, withdrawal } = day
        netFlow = netFlow === null || contribution === null ? null : netFlow + contribution - withdrawal
        let factor: number | null = null
        if (previous !== null && value !== null && contribution !== null) {
          const denominator = previous + contribution
          const inactive = previous === 0 && value === 0 && contribution === 0 && withdrawal === 0
          if (inactive) factor = 1
          else if (denominator > 0 && value + withdrawal >= 0) {
            factor = (value + withdrawal) / denominator
            activeDays++
          }
        }
        close(factor, day.expected_factor)
        if (factor === null) covered = false
        else product *= factor
        previous = value
      }
      const endValue = period.days.at(-1)!.value
      const gain = endValue === null || netFlow === null ? null : endValue - period.start_value - netFlow
      close(gain, period.expected_gain)
      close(covered && activeDays > 0 ? product - 1 : null, period.expected_estimated_return)
    })
  }

  it('preserves missing and invalid FX in the shared conversion contract', () => {
    for (const f of examples.missing_inputs) {
      if (f.amount === undefined) continue
      const rates: Record<string, number> = {}
      for (const [currency, rate] of Object.entries(f.rates!)) {
        if (typeof rate === 'number') rates[currency] = rate
      }
      const result = convertCurrency(f.amount, f.source!, f.target!, rates, f.base!)
      close(result.value, f.expected_value!)
      expect(result.missingCurrencies).toEqual(f.expected_missing)
    }
    expect(sumAvailable([100, null])).toBeNull()
  })

  it('distinguishes known current zero from missing price on a nonzero position', () => {
    for (const f of examples.missing_inputs) {
      if (f.quantity === undefined) continue
      expect(f.price).toBeNull()
      close(f.quantity === 0 ? 0 : null, f.expected_native_value!)
    }
  })

  it('keeps investment, net-worth and market-today universes explicit', () => {
    const f = examples.scopes
    const active = f.holdings.filter(holding => !holding.archived)
    const netWorth = active.filter(holding => !holding.excluded_net_worth)
    const today = active.filter(holding => holding.pricing_method === 'market')
    expect(active.map(holding => holding.id)).toEqual(f.expected.investment_active_ids)
    expect(f.holdings.map(holding => holding.id)).toEqual(f.expected.historical_ids)
    close(sumAvailable(active.map(holding => holding.current_value)), f.expected.investment_current_value)
    close(sumAvailable(netWorth.map(holding => holding.current_value)), f.expected.net_worth_investment_value)
    close(sumAvailable(today.map(holding => holding.today_gain)), f.expected.market_today_gain)
    close(sumAvailable(today.map(holding => holding.prior_market_value)), f.expected.market_today_prior_value)
    expect(active.filter(holding => !today.includes(holding)).map(holding => holding.id))
      .toEqual(f.expected.market_today_excluded_ids)
  })

  it('includes dated FX movement in converted daily gain, not in native price change', () => {
    const f = examples.daily_fx
    close(f.current_price_usd - f.prior_price_usd, f.expected.native_price_change)
    close((f.current_price_usd / f.prior_price_usd - 1) * 100, f.expected.native_price_change_percent)
    close(f.quantity * f.prior_price_usd * f.prior_huf_per_usd, f.expected.prior_value_huf)
    close(f.quantity * f.current_price_usd * f.current_huf_per_usd, f.expected.current_value_huf)
    close(f.expected.current_value_huf - f.expected.prior_value_huf, f.expected.converted_gain_huf)
  })
})
