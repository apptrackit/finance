import { manualValuationStatus } from './manual-valuation'
import type { ManualValuation, ManualValuationStatus } from './manual-valuation'
import { addDecimal, recoverLedgerResidue } from './decimal-balance'
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
  recorded_history?: { effective_date: string; first_trade_date: string | null; quantity: number; trade_count: number }
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
export type RecordedTrade = {
  id: string
  type: string
  quantity: number
  date: string
  effective_order: number
}
/** A calculated zero start for the recorded ledger, never a saved opening or
 * invented acquisition. Explicit imported openings/corrections take precedence. */
export function recordedHistory(
  a: HoldingInput,
  trades: RecordedTrade[],
  today: string,
): HoldingPosition['recorded_history'] | null {
  const anchor = a.holding_position?.anchor
  if (
    a.type !== 'investment' ||
    a.asset_type === 'manual' ||
    (anchor && anchor.kind !== 'observed') ||
    trades.length > 10000
  )
    return null
  if (
    trades.some(
      (t) => typeof t.date !== 'string' || typeof t.id !== 'string' || !t.id,
    )
  )
    return null
  const ordered = [...trades].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.effective_order - b.effective_order ||
      a.id.localeCompare(b.id),
  )
  const orders = new Set<number>(),
    ids = new Set<string>(),
    flows: number[] = []
  let quantity = 0
  try {
    for (const t of ordered) {
      if (
        !validLocalDate(t.date) ||
        t.date > today ||
        !['buy', 'sell'].includes(t.type) ||
        !validHoldingNumber(t.quantity) ||
        t.quantity <= 0 ||
        !Number.isSafeInteger(t.effective_order) ||
        t.effective_order < 1 ||
        orders.has(t.effective_order) ||
        ids.has(t.id)
      )
        return null
      orders.add(t.effective_order)
      ids.add(t.id)
      const signed = t.type === 'buy' ? t.quantity : -t.quantity
      flows.push(signed)
      quantity = addDecimal(quantity, signed)
      if (!validHoldingNumber(quantity)) return null
    }
    const recovery = recoverLedgerResidue(a.balance, flows, 1e-12)
    if (quantity !== a.balance && recovery?.value !== quantity) return null
    const first = ordered[0]?.date ?? null
    const effective = new Date(
      `${first ?? anchor?.effective_date ?? today}T00:00:00Z`,
    )
    effective.setUTCDate(effective.getUTCDate() - 1)
    const date = effective.toISOString().slice(0, 10)
    if (!validLocalDate(date)) return null
    return {
      effective_date: date,
      first_trade_date: first,
      quantity,
      trade_count: trades.length,
    }
  } catch {
    return null
  }
}
export function applyRecordedHistory<T extends HoldingInput>(
  a: T,
  trades: RecordedTrade[],
  today: string,
): T {
  if (!a.holding_position) return a
  const { recorded_history: previous, ...position } = a.holding_position
  const base = {
    ...a,
    holding_position: {
      ...position,
      ...(previous
        ? {
            history_status: 'unverified' as const,
            coverage_reasons: [
              ...new Set([...position.coverage_reasons, 'unknown_opening']),
            ],
          }
        : {}),
    },
  }
  const history = recordedHistory(base, trades, today)
  if (history)
    return {
      ...base,
      holding_position: {
        ...base.holding_position,
        recorded_history: history,
        history_status: 'reconciled',
        residual: 0,
        coverage_reasons: base.holding_position.coverage_reasons.filter(
          (r) => !['unknown_opening', 'quantity_mismatch'].includes(r),
        ),
      },
    }
  return base
}
export function effectivePositionAnchor(
  a: HoldingFields,
): PositionAnchor | null {
  const history = a.holding_position?.recorded_history
  return history
    ? {
        id: 'recorded-trade-history',
        kind: 'opening',
        effective_date: history.effective_date,
        balance: 0,
        cost_amount: null,
        cost_currency: null,
        trade_rowid_boundary: 0,
        trade_order_boundary: 0,
        created_at: 0,
      }
    : (a.holding_position?.anchor ?? null)
}

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
  CASE WHEN a.type='investment' AND a.asset_type IS NOT 'manual' AND (p.id IS NULL OR p.kind='observed')
    AND (SELECT COUNT(*) FROM investment_transactions)<=10000 THEN
    (SELECT json_group_array(json_object('id',h.id,'type',h.type,'quantity',h.quantity,'date',h.date,'effective_order',h.effective_order))
      FROM (SELECT id,type,quantity,date,effective_order FROM investment_transactions WHERE account_id=a.id ORDER BY date,effective_order,id LIMIT 10001) h)
    END AS _recorded_trades,
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
export function mapHoldingAccount<T extends HoldingInput>(raw: T & { _activity?: number; _after_anchor?: number; _anchor?: string | null; _has_history?: number; _valuation?: string | null; _manual_ownership?: HoldingFields['manual_ownership']; _recorded_trades?: string | null }, today = new Date().toISOString().slice(0,10)): T {
  const { _activity, _after_anchor, _anchor, _has_history, _valuation, _manual_ownership, _recorded_trades, ...account } = raw
  const a = account as T
  if (a.type === 'investment') {
    const anchor = _anchor ? JSON.parse(_anchor) as PositionAnchor : null
    if (anchor?.owned != null) anchor.owned = Boolean(anchor.owned)
    a.holding_position = { ...positionFromObservation(a, _activity ?? 0, _after_anchor ?? 0, anchor), has_history: Boolean(_has_history) }
    const history = _recorded_trades ? recordedHistory(a,JSON.parse(_recorded_trades) as RecordedTrade[],today) : null
    if (history) a.holding_position = {...a.holding_position,recorded_history:history,history_status:'reconciled',residual:0,
      coverage_reasons:a.holding_position.coverage_reasons.filter(r=>!['unknown_opening','quantity_mismatch'].includes(r))}
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
