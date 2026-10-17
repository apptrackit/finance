import { validHoldingNumber } from './holding'

export const tradeCurrencies = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'RON', 'MXN'] as const
export type TradeFacts = {
  asset_event?: 'acquisition' | 'disposal' | null
  execution_currency?: string | null; gross_amount?: number | null
  fee_amount?: number | null; fee_currency?: string | null; fee_status?: 'known' | 'unknown' | null
  cash_amount?: number | null; cash_currency?: string | null; effective_order?: number | null; trade_version?: number
}
export type TradeInput = {
  idempotency_key: string; holding_account_id: string; cash_account_id: string
  type: 'buy' | 'sell'; quantity: number; price: number; execution_currency: string
  cash_amount: number; fee_status: 'known' | 'unknown'; fee_amount?: number | null
  date: string; notes?: string | null; expected_version?: number
}
// All supported cash currencies use two settlement minor digits here, including
// HUF. This boundary never rounds holding units or historical cash records.
export const validSettlement = (v: number) => validHoldingNumber(v) && Number(v.toFixed(2)) === v
export const roundSettlement = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
export const unitInteger = (v: number): bigint => {
  if (!validHoldingNumber(Math.abs(v))) throw new Error('Unsupported quantity/value precision; reconcile this position first')
  return BigInt(v.toFixed(12).replace('.', ''))
}
export function addExact(a: number, b: number): number {
  const result = Number(unitInteger(a) + unitInteger(b)) / 1e12
  if (!validHoldingNumber(Math.abs(result)) || unitInteger(result) !== unitInteger(a) + unitInteger(b)) throw new Error('Result exceeds supported quantity/value precision or range')
  return result
}
export function settlementDetails(t: TradeInput) {
  const gross = t.quantity * t.price
  const fee = t.fee_status === 'known' ? t.fee_amount : null
  const grossCash = fee == null ? null : t.type === 'buy' ? t.cash_amount - fee : t.cash_amount + fee
  return { gross_amount: gross, implied_settlement_rate: grossCash == null || grossCash <= 0 ? null : grossCash / gross }
}
export function tradeCoverage(t: TradeFacts & { quantity: number; price: number; total_amount: number }) {
  const reasons: string[] = []
  if (!t.execution_currency) reasons.push('unknown_execution_currency')
  if (t.fee_status !== 'known') reasons.push('unknown_fee_breakdown')
  if (t.cash_amount == null || !t.cash_currency) reasons.push('unknown_cash_flow')
  if (t.gross_amount == null && Math.abs(t.total_amount-t.quantity*t.price)>Math.max(1e-10,Math.abs(t.total_amount)*Number.EPSILON*8)) reasons.push('legacy_gross_discrepancy')
  return { status:reasons.length ? 'partial' : 'recorded',reasons }
}
