import { manualValuationStatus } from './manual-valuation'
import type { ManualValuation, ManualValuationStatus } from './manual-valuation'
/** Shared read semantics; no market requests or investment writes. */
export type HoldingCategory = 'etf' | 'stock' | 'crypto' | 'manual'
export type PricingMethod = 'market' | 'manual'
export type PositionAnchor = {
  id: string; kind: 'opening' | 'observed' | 'correction'; effective_date: string
  owned?: boolean | null; balance: number; cost_amount: number | null; cost_currency: string | null
  trade_rowid_boundary: number; trade_order_boundary?: number | null; created_at: number
}
export type HoldingPosition = {
  has_history?: boolean; quantity: number | null; activity_quantity: number; residual: number | null
  history_status: 'unverified' | 'reconciled' | 'mismatch'
  coverage_reasons: string[]; anchor: PositionAnchor | null
}
export type HoldingFields = {
  pricing_method?: PricingMethod | null; unit?: string | null
  provider?: 'yahoo' | null; exchange?: string | null
  manual_price?: number | null; manual_price_date?: string | null
  manual_valuation?: ManualValuationStatus | null
  manual_ownership?: 'owned' | 'unowned' | 'disposed' | 'unknown' | null
  holding_position?: HoldingPosition | null
}
type HoldingInput = HoldingFields & { type: string; balance: number; currency: string; asset_type?: string | null; quote_currency?: string | null; symbol?: string | null }
export const isTotalValueHolding = (a: Pick<HoldingInput, 'asset_type'>) => a.asset_type === 'manual'
export const usesMarketPricing = (a: Pick<HoldingInput, 'asset_type' | 'pricing_method'>) =>
  !isTotalValueHolding(a) && a.pricing_method !== 'manual'
export function holdingNativeValue(a: HoldingInput, quote?: { regularMarketPrice?: number | null; currency?: string | null }): { value: number | null; currency: string; reason?: string } {
  if (isTotalValueHolding(a)) return { value: a.balance, currency: a.currency }
  const market = usesMarketPricing(a)
  const price = market ? quote?.regularMarketPrice : a.manual_price
  const currency = (market ? a.quote_currency || quote?.currency : a.quote_currency) || ''
  const currencyMismatch = market && a.quote_currency && quote?.currency && a.quote_currency !== quote.currency
  if (currencyMismatch && a.balance !== 0) return {value:null,currency,reason:'quote_currency_mismatch'}
  const value = a.balance === 0 ? 0 : currencyMismatch ? null : typeof price === 'number' && Number.isFinite(price) && (market ? price > 0 : price >= 0) && currency ? a.balance * price : null
  return { value: value !== null && Number.isFinite(value) ? value : null, currency }
}
export function positionFromObservation(a: HoldingInput, activity: number, afterAnchor: number, anchor: PositionAnchor | null): HoldingPosition {
  if (isTotalValueHolding(a)) return { quantity: null, activity_quantity: activity, residual: null,
    history_status: anchor?.kind === 'opening' ? 'reconciled' : 'unverified', coverage_reasons: [...(anchor?.kind !== 'opening' ? ['unknown_opening'] : []), ...(anchor?.cost_amount == null ? ['unknown_cost'] : [])], anchor }
  const expected = anchor?.kind === 'opening' ? anchor.balance + afterAnchor : activity
  const residual = a.balance - expected
  const mismatch = Math.abs(residual) > Math.max(5e-13, Math.abs(a.balance) * Number.EPSILON * 8)
  const confirmed = anchor?.kind === 'opening'
  return { quantity: a.balance, activity_quantity: activity, residual: mismatch ? residual : 0,
    history_status: mismatch ? 'mismatch' : confirmed ? 'reconciled' : 'unverified',
    coverage_reasons: [...(!confirmed ? ['unknown_opening'] : []), ...(mismatch ? ['quantity_mismatch'] : []), ...(anchor?.cost_amount == null ? ['unknown_cost'] : [])], anchor }
}
// Current balances and old ledger rows remain authoritative facts. An observed
// anchor is not a historical acquisition, even if the activity residual is zero.
export const MANUAL_OWNERSHIP_SQL = `COALESCE((SELECT CASE WHEN t.asset_event = 'acquisition' THEN 'owned' ELSE 'disposed' END
  FROM investment_transactions t WHERE t.account_id = a.id AND t.asset_event IS NOT NULL
    AND (CASE WHEN p.kind = 'opening' THEN t.date > p.effective_date ELSE t.effective_order > COALESCE(p.trade_order_boundary,p.trade_rowid_boundary,0) END)
  ORDER BY t.date DESC, t.effective_order DESC, t.id DESC LIMIT 1),
  CASE WHEN p.owned = 1 THEN 'owned' WHEN p.owned = 0 THEN 'unowned' WHEN p.balance > 0 THEN 'owned' ELSE 'unknown' END)`
export const HOLDING_ACCOUNT_SELECT = `SELECT a.*,
  CASE WHEN a.asset_type = 'manual' THEN ${MANUAL_OWNERSHIP_SQL} END AS _manual_ownership,
  (SELECT json_object('id',v.id,'account_id',v.account_id,'effective_date',v.effective_date,'kind',v.kind,
    'amount',v.amount,'currency',v.currency,'source',v.source,'source_trade_id',v.source_trade_id,'version',v.version,'created_at',v.created_at,'updated_at',v.updated_at)
    FROM investment_valuations v WHERE v.account_id = a.id ORDER BY v.effective_date DESC LIMIT 1) AS _valuation,
  CASE WHEN a.balance != 0 OR EXISTS (SELECT 1 FROM investment_valuations v WHERE v.account_id = a.id) OR EXISTS (SELECT 1 FROM investment_transactions h WHERE h.account_id = a.id)
    OR EXISTS (SELECT 1 FROM transactions c WHERE c.account_id = a.id)
    OR EXISTS (SELECT 1 FROM investment_position_anchors h WHERE h.account_id = a.id AND h.balance != 0) THEN 1 ELSE 0 END AS _has_history,
  COALESCE((SELECT SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE -t.quantity END) FROM investment_transactions t WHERE t.account_id = a.id), 0) AS _activity,
  COALESCE((SELECT SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE -t.quantity END) FROM investment_transactions t WHERE t.account_id = a.id AND t.date > p.effective_date), 0) AS _after_anchor,
  CASE WHEN p.id IS NOT NULL THEN json_object('id', p.id, 'kind', p.kind, 'effective_date', p.effective_date, 'balance', p.balance,
    'owned', p.owned, 'cost_amount', p.cost_amount, 'cost_currency', p.cost_currency, 'trade_rowid_boundary', p.trade_rowid_boundary, 'trade_order_boundary', p.trade_order_boundary, 'created_at', p.created_at) END AS _anchor
 FROM accounts a LEFT JOIN investment_position_anchors p ON p.rowid =
   (SELECT x.rowid FROM investment_position_anchors x WHERE x.account_id = a.id ORDER BY x.rowid DESC LIMIT 1)`
export function mapHoldingAccount<T extends HoldingInput>(raw: T & { _activity?: number; _after_anchor?: number; _anchor?: string | null; _has_history?: number; _valuation?: string | null; _manual_ownership?: HoldingFields['manual_ownership'] }, today = new Date().toISOString().slice(0,10)): T {
  const { _activity, _after_anchor, _anchor, _has_history, _valuation, _manual_ownership, ...account } = raw
  const a = account as T
  if (a.type === 'investment') {
    const anchor = _anchor ? JSON.parse(_anchor) as PositionAnchor : null
    if (anchor?.owned != null) anchor.owned = Boolean(anchor.owned)
    a.holding_position = { ...positionFromObservation(a, _activity ?? 0, _after_anchor ?? 0, anchor), has_history: Boolean(_has_history) }
  }
  if (a.type === 'investment' && !usesMarketPricing(a)) {
    a.manual_valuation = manualValuationStatus(_valuation ? JSON.parse(_valuation) as ManualValuation : null, today)
    a.manual_ownership = _manual_ownership ?? null
    if (a.manual_ownership === 'unknown' && a.holding_position) a.holding_position = { ...a.holding_position,
      history_status:'unverified',coverage_reasons:[...a.holding_position.coverage_reasons,'unknown_ownership'] }
  }
  return a
}
export function validLocalDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}
/** At most 12 fractional / 15 significant decimal digits; SQLite REAL remains finite precision. */
export const validHoldingNumber = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1e12 && Number(v.toFixed(12)) === v && Number(v.toPrecision(15)) === v
