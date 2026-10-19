import { holdingNativeValue, usesMarketPricing, effectivePositionAnchor } from './holding'
import type { HoldingFields } from './holding'
import { addExact } from './investment-trade'
import type { TradeFacts } from './investment-trade'
import type { Quote } from './market-data'

export type MetricAccount = HoldingFields & {
  id: string; name: string; type: string; balance: number; currency: string
  quote_currency?: string | null; asset_type?: string | null; symbol?: string | null
  exclude_from_net_worth?: boolean | number; archived_at?: number | null
}
export type MetricTrade = TradeFacts & {
  id: string; account_id: string; type: 'buy' | 'sell'; quantity: number; price: number
  total_amount: number; date: string; cash_source?: 'linked_transaction'
}
export type DatedConversion = (amount: number, source: string, target: string, date: string) => number | null
export type LedgerMetrics = {
  remaining_basis: number | null; average_cost: number | null; net_invested: number | null
  realized_gain: number | null; unrealized_gain: number | null; total_gain: number | null
}
export type HoldingMetrics = LedgerMetrics & {
  allocation_percent: number | null; account_id: string; currency: string; quantity: number | null; value: number | null
  native_currency: string; native_value: number | null; native: LedgerMetrics
  unrealized_gain_percent: number | null; estimated_return_percent: number | null
  trade_realized: Record<string,number | null>; performance_start: string | null; coverage: Record<string,string[]>
  price_change: number | null; price_change_percent: number | null
}
const finite = (n: number | null): number | null => n !== null && Number.isFinite(n) ? n : null
const plus = (a: number | null,b: number | null) => a === null || b === null ? null : finite(a+b)
const minus = (a: number | null,b: number | null) => a === null || b === null ? null : finite(a-b)
export const orderedTrades = (trades: MetricTrade[]) => [...trades].sort((a,b) => a.date.localeCompare(b.date) || (a.effective_order??0)-(b.effective_order??0) || a.id.localeCompare(b.id))
export function afterAnchor(account: MetricAccount, trade: MetricTrade) {
  const a = effectivePositionAnchor(account)
  return !a || (a.kind === 'opening' ? trade.date > a.effective_date : (trade.effective_order??0) > (a.trade_order_boundary??a.trade_rowid_boundary))
}
export function positionUnits(account: MetricAccount): number | null {
  return account.asset_type !== 'manual' ? account.holding_position?.recorded_history?.quantity ?? account.balance : account.manual_ownership === 'owned' ? 1
    : account.manual_ownership === 'unowned' || account.manual_ownership === 'disposed' ? 0 : null
}
function nativeCash(t: MetricTrade, currency: string): number | null {
  if (t.execution_currency !== currency || t.fee_status !== 'known' || t.fee_amount == null || t.fee_amount < 0) return null
  const gross = t.gross_amount ?? t.quantity*t.price
  // Settlement cash includes the fee. Same-currency settlement rounding stays
  // authoritative instead of adding an unrounded synthetic cash amount.
  if (t.cash_currency === currency && t.cash_amount != null) return t.cash_amount
  if (t.cash_amount == null || t.cash_currency !== t.fee_currency) return null
  const grossCash = t.type === 'buy' ? t.cash_amount-t.fee_amount : t.cash_amount+t.fee_amount
  if (gross === 0 && t.cash_amount === 0 && t.fee_amount === 0) return 0
  if (!(grossCash>0) || !(gross>0)) return null
  const fee = t.fee_amount/(grossCash/gross)
  return finite(t.type === 'buy' ? gross+fee : gross-fee)
}
function ledger(account: MetricAccount,trades: MetricTrade[],currency: string,value: number | null,convert: DatedConversion,native: boolean,asOf: string) {
  const anchor = effectivePositionAnchor(account)
  const manual = account.asset_type === 'manual'
  const knownStart = !!anchor && anchor.kind === 'opening'
  let q: number | null = anchor ? manual ? anchor.owned == null ? anchor.balance>0 ? 1 : null : Number(anchor.owned) : anchor.balance : null
  // Only an explicit zero opening establishes complete lifetime cash/realized history.
  const lifetime = knownStart && q === 0 && !trades.some(t => !afterAnchor(account,t))
  let basis: number | null = q === 0 ? 0 : anchor?.cost_currency === currency ? anchor.cost_amount : null
  let invested: number | null = lifetime ? 0 : null, realized: number | null = lifetime ? 0 : null
  const realizedByTrade: Record<string,number|null> = {}
  const reasons = new Set<string>()
  if (!knownStart) reasons.add('unknown_opening')
  if (!lifetime) reasons.add('unknown_prior_cash_and_realized_history')
  for (const t of orderedTrades(trades.filter(t => afterAnchor(account,t)))) {
    if (t.date > asOf || !Number.isSafeInteger(t.effective_order) || (t.effective_order??0)<1 || !anchor || t.date<anchor.effective_date) {
      q=null; basis=null; invested=null; realized=null; reasons.add(t.date>asOf?'future_trade':'ambiguous_event_order'); continue
    }
    const amount = native ? nativeCash(t,currency) : t.cash_amount != null && t.cash_currency
      ? convert(t.cash_amount,t.cash_currency,currency,t.date) : null
    if (amount === null) reasons.add(native ? 'unknown_execution_currency_or_fee' : t.cash_amount == null || !t.cash_currency ? 'unknown_cash_flow' : 'missing_dated_fx')
    // Native execution basis is not a converted external cash ledger. The
    // settlement ratio can price a known fee, but must not invent native cash.
    const cash = native ? t.cash_currency===currency && t.cash_amount!=null?t.cash_amount:null : amount
    if(native && t.cash_currency!==currency) reasons.add('cash_recorded_in_other_currency')
    invested = plus(invested,cash === null ? null : t.type==='buy'?cash:-cash)
    const quantity = manual ? t.quantity === 1 && t.asset_event === (t.type==='buy'?'acquisition':'disposal') ? 1 : null : t.quantity
    if (q === null || quantity === null || !Number.isFinite(quantity) || quantity<=0 || (t.type==='sell' && quantity>q) || (manual && (t.type==='buy'?q!==0:q!==1))) {
      q=null; basis=null; realized=null; reasons.add('unsupported_position_history'); continue
    }
    let next: number
    try { next = addExact(q,t.type==='buy'?quantity:-quantity) } catch { q=null; basis=null; realized=null; reasons.add('unsupported_precision'); continue }
    if (t.type==='buy') basis=plus(basis,amount)
    else {
      const removed = basis === null ? null : basis*quantity/q
      basis = next===0 ? 0 : minus(basis,removed)
      realizedByTrade[t.id]=minus(amount,removed)
      realized = plus(realized,realizedByTrade[t.id])
    }
    q=next
  }
  const current = positionUnits(account)
  if (q === null || current === null || q !== current) { basis=null; realized=null; invested=null; reasons.add('quantity_mismatch') }
  // An independently known empty current position has zero remaining basis,
  // even though earlier realized gains and contributions can remain unknown.
  if (current === 0) basis=0
  if (basis === null) reasons.add('unknown_cost')
  const unrealized = minus(value,basis)
  return { metrics:{ remaining_basis:finite(basis),average_cost:current && basis!==null?finite(basis/current):null,
    net_invested:finite(invested),realized_gain:finite(realized),unrealized_gain:unrealized,total_gain:plus(realized,unrealized) },reasons:[...reasons],realizedByTrade }
}
export function holdingMetrics(account: MetricAccount,trades: MetricTrade[],currency: string,quote: Quote | undefined,
  currentConvert: (amount: number,source: string,target: string) => number | null, datedConvert: DatedConversion, asOf: string,
  unsupportedEvent = false): HoldingMetrics {
  const current = holdingNativeValue(account,quote)
  const value = current.value === null ? null : current.value===0 ? 0 : currentConvert(current.value,current.currency,currency)
  const reporting = ledger(account,trades,currency,value,datedConvert,false,asOf)
  const native = ledger(account,trades,current.currency,current.value,datedConvert,true,asOf)
  const coverage: Record<string,string[]> = {
    value:current.value===null?[current.reason||'missing_price']:value===null?['missing_fx']:[],
    cost:reporting.reasons,native_cost:native.reasons,
    estimated_return:['daily_history_required'],
  }
  if (quote?.status==='stale') coverage.value.push('stale_price')
  if (account.manual_valuation?.status==='stale') coverage.value.push('stale_manual_valuation')
  // Automated corporate actions are outside this ledger. Current value remains
  // independently useful, but raw prices/trades cannot prove total performance.
  if (unsupportedEvent) {
    for (const result of [reporting,native]) {
      result.metrics={...result.metrics,remaining_basis:null,average_cost:null,realized_gain:null,unrealized_gain:null,total_gain:null}
      for(const id of Object.keys(result.realizedByTrade)) result.realizedByTrade[id]=null
      result.reasons.push('unsupported_event')
    }
  }
  return { allocation_percent:null,account_id:account.id,currency,quantity:positionUnits(account),value,native_currency:current.currency,native_value:current.value,
    ...reporting.metrics,native:native.metrics,unrealized_gain_percent:reporting.metrics.remaining_basis!==null && reporting.metrics.remaining_basis>0 && reporting.metrics.unrealized_gain!==null
      ?finite(reporting.metrics.unrealized_gain/reporting.metrics.remaining_basis*100):null,
    estimated_return_percent:null,performance_start:null,trade_realized:reporting.realizedByTrade,coverage,
    price_change:usesMarketPricing(account)?quote?.change??null:null,price_change_percent:usesMarketPricing(account)?quote?.change_percent??null:null }
}
export type ReturnDay = { value: number | null; contribution: number | null; withdrawal: number | null }
export function estimatedReturn(start: number | null,days: ReturnDay[]) {
  let previous=start,product: number | null=1,active=false
  const factors=days.map(day => {
    const {value,contribution:c,withdrawal:w}=day
    let factor: number | null=null
    if (previous!==null && value!==null && c!==null && w!==null && [previous,value,c,w].every(v=>Number.isFinite(v)&&v>=0)) {
      if (previous===0 && value===0 && c===0 && w===0) factor=1
      else { active=true; const d=previous+c; factor=d>0?finite((value+w)/d):null }
    }
    product=product===null || factor===null?null:finite(product*factor)
    previous=value
    return factor
  })
  const contributions=days.reduce<number|null>((sum,d)=>plus(sum,d.contribution),0)
  const withdrawals=days.reduce<number|null>((sum,d)=>plus(sum,d.withdrawal),0)
  const gain=minus(plus(minus(days.length?days[days.length-1].value:start,start),withdrawals),contributions)
  return { gain,percent:active && product!==null?finite((product-1)*100):null,factors }
}
export function portfolioMetrics(holdings: HoldingMetrics[],partial = false) {
  const sum = (key: keyof LedgerMetrics | 'value') => {
    const values=holdings.map(h=>h[key])
    if (!partial && values.some(v=>v===null)) return null
    return finite(values.reduce<number>((s,v)=>s+(v??0),0))
  }
  return { total_value:sum('value'),total_invested:sum('net_invested'),remaining_basis:sum('remaining_basis'),
    realized_gain:sum('realized_gain'),unrealized_gain:sum('unrealized_gain'),total_gain:sum('total_gain'),estimated_return_percent:null,
    valuation_status:holdings.every(h=>h.value!==null)?'complete':'partial',
    coverage:{holdings_total:holdings.length,value_covered:holdings.filter(h=>h.value!==null).length,
      invested_covered:holdings.filter(h=>h.net_invested!==null).length,realized_covered:holdings.filter(h=>h.realized_gain!==null).length,unrealized_covered:holdings.filter(h=>h.unrealized_gain!==null).length,
      cost_covered:holdings.filter(h=>h.remaining_basis!==null).length,gain_covered:holdings.filter(h=>h.total_gain!==null).length,
      method:'moving_weighted_average',return_method:'daily_linked_estimate',return_reason:'daily_history_required'} }
}
export type MarketTodayMetrics = {
  gain:number|null;estimated_return_percent:number|null;currency:string;date:string;prior_date:string
  covered_holdings:number;total_holdings:number;excluded:{account_id:string;reasons:string[]}[];method:string;boundary:string
}
export type CurrencyMetrics = ReturnType<typeof portfolioMetrics> & {currency:string;holdings:HoldingMetrics[];market_today:MarketTodayMetrics}
export type InvestmentMetricsSnapshot = {
  overview?: {trends:Record<string,import('./investment-overview').HoldingTrend>}
  as_of:string;date:string;scope:'investments'|'net_worth';source_revision:number
  accounts:MetricAccount[];trades:MetricTrade[];quotes:Record<string,Quote>
  current_fx:{base:string;as_of:string|null;rates:Record<string,number>};by_currency:Record<string,CurrencyMetrics>
}
