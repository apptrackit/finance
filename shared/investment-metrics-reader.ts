/** Independent Worker read adapter. User facts are read only; only the disposable
 * source cache can be refreshed. No API dependency from MCP. */
import { HOLDING_ACCOUNT_SELECT, mapHoldingAccount, usesMarketPricing, validLocalDate } from './holding'
import { D1MarketCache } from './market-cache'
import { MarketReader } from './market-reader'
import { DAY, dailyPriceAt, datedFxAt, marketSymbol } from './market-data'
import type { FxHistory, PriceHistory, Quote } from './market-data'
import { convertCurrency, validRates } from './currency'
import {addExact,tradeCurrencies} from './investment-trade'
import { afterAnchor, estimatedReturn, holdingMetrics, portfolioMetrics, positionUnits } from './investment-metrics'
import type { DatedConversion, HoldingMetrics, MetricAccount, MetricTrade } from './investment-metrics'

export class MetricsReadError extends Error {
  constructor(readonly code:'conflict'|'limit',message:string) {super(message)}
}
export type MetricFacts = { accounts: MetricAccount[]; trades: MetricTrade[]; revision: number }
export class InvestmentMetricsRepository {
  constructor(private db: D1Database) {}
  async revision() { return (await this.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1').first<{revision:number}>())?.revision??0 }
  async read(scope: 'investments'|'net_worth'='investments'): Promise<MetricFacts> {
    const included=scope==='net_worth'?' AND COALESCE(a.exclude_from_net_worth,0)=0':''
    const rows=await this.db.batch([
      this.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1'),
      this.db.prepare(`${HOLDING_ACCOUNT_SELECT} WHERE a.type='investment' AND a.archived_at IS NULL${included} ORDER BY a.id LIMIT 101`),
      this.db.prepare(`SELECT it.* FROM investment_transactions it JOIN accounts a ON a.id=it.account_id WHERE a.type='investment' AND a.archived_at IS NULL${included} ORDER BY it.date,it.effective_order,it.id LIMIT 10001`),
    ])
    const accounts=rows[1].results as MetricAccount[], trades=rows[2].results as MetricTrade[]
    if (accounts.length>100 || trades.length>10000) throw new MetricsReadError('limit','Investment metrics limit exceeded (100 holdings / 10000 trades); no partial history was published')
    return {accounts:accounts.map(a=>mapHoldingAccount(a)),trades,revision:(rows[0].results[0] as {revision:number}|undefined)?.revision??0}
  }
}
export type MetricsReadOptions = { currencies: string[]; date?: string; scope?: 'investments'|'net_worth'; partial?: boolean; signal?: AbortSignal }
export class InvestmentMetricsReader {
  constructor(private repo: InvestmentMetricsRepository,private market: MarketReader,private clock=()=>Date.now()) {}
  async read(options: MetricsReadOptions, preview?: {account: MetricAccount; trades: MetricTrade[]; revision:number}) {
    const signal=AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(45_000)])
    const now=this.clock(),utc=new Date(now).toISOString().slice(0,10)
    const date=validLocalDate(options.date??'') && Math.abs(Date.parse(options.date!)-Date.parse(utc))<=DAY?options.date!:utc
    const prior=new Date(Date.parse(date)-DAY).toISOString().slice(0,10)
    const facts=await this.repo.read(options.scope)
    if (preview) {
      if (facts.revision!==preview.revision) throw new MetricsReadError('conflict','Investment records changed before preview; refresh and retry')
      facts.accounts=facts.accounts.filter(a=>a.id===preview.account.id).map(()=>preview.account)
      facts.trades=preview.trades
    }
    const accounts=facts.accounts.filter(a=>options.scope!=='net_worth' || !a.exclude_from_net_worth)
    const ids=new Set(accounts.map(a=>a.id)),trades=facts.trades.filter(t=>ids.has(t.account_id))
    const symbolOf=(a:MetricAccount)=>{try{return a.symbol?marketSymbol(a.symbol):null}catch{return null}}
    const symbols=[...new Set(accounts.filter(a=>usesMarketPricing(a) && a.symbol && (a.balance!==0 || trades.some(t=>t.account_id===a.id))).map(symbolOf).filter((s):s is string=>s!==null))]
    const quotes: Record<string,Quote>={},histories: Record<string,PriceHistory>={}
    for(let i=0;i<symbols.length;i+=50) Object.assign(quotes,await this.market.quotes(symbols.slice(i,i+50),signal))
    // Historical prices are only used for event coverage and the prior daily
    // boundary here. Full portfolio series and lifetime percentages belong to #132.
    let next=0
    await Promise.all(Array.from({length:Math.min(4,symbols.length)},async()=>{
      while(next<symbols.length) {
        const symbol=symbols[next++]
        const starts=accounts.filter(a=>symbolOf(a)===symbol).map(a=>a.holding_position?.anchor?.effective_date).filter((v):v is string=>!!v)
        const earliest=[prior,...starts].sort()[0]
        const from=earliest<new Date(now-3659*DAY).toISOString().slice(0,10)?prior:earliest
        try { histories[symbol]=await this.market.history(symbol,from,date,signal,date) } catch { signal.throwIfAborted() }
      }
    }))
    let rates: Record<string,number>={}
    let ratesAsOf: string|null=null
    try {
      const response=await fetch('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.any([signal,AbortSignal.timeout(6000)])})
      if(response.ok) { const data=await response.json<{result?:string;rates?:unknown;time_last_update_utc?:string}>(); const values=validRates(data.rates);rates=data.result==='success' && values.USD===1?values:{};ratesAsOf=data.time_last_update_utc??null }
    } catch { signal.throwIfAborted() }
    const currentConvert=(amount:number,source:string,target:string)=>convertCurrency(amount,source,target,rates,'USD').value
    const fx: FxHistory[]=[]
    const currencies=[...new Set([...options.currencies,...accounts.map(a=>a.asset_type==='manual'?a.currency:a.quote_currency||quotes[symbolOf(a)??'']?.currency),...trades.map(t=>t.cash_currency)].filter((c):c is string=>!!c && (tradeCurrencies as readonly string[]).includes(c) && c!=='EUR'))]
    // Request only years containing required flows, with at most eleven bounded
    // windows in the ten-year provider horizon. Missing older facts stay unknown.
    const dates=[...(accounts.some(a=>usesMarketPricing(a)&&a.balance!==0&&options.currencies.some(c=>c!==(a.quote_currency||a.currency)))?[prior]:[]),...trades.filter(t=>t.cash_currency && options.currencies.some(c=>c!==t.cash_currency)).map(t=>t.date)]
    const first=new Date(now-3659*DAY).toISOString().slice(0,10)
    const years=[...new Set(dates.filter(d=>validLocalDate(d)&&d>=first&&d<=date).map(d=>d.slice(0,4)))].sort()
    for(const year of years) {
      const from=[`${year}-01-01`,first].sort().at(-1)!,to=[`${year}-12-31`,date].sort()[0]
      for(let i=0;i<currencies.length;i+=10) {
        try { fx.push(await this.market.fx(from,to,currencies.slice(i,i+10),signal,date)) } catch { signal.throwIfAborted() }
      }
    }
    const datedConvert: DatedConversion=(amount,source,target,day)=>{
      if(source===target || amount===0) return Number.isFinite(amount)?amount:null
      const rate=(currency:string)=>currency==='EUR'?1:fx.find(h=>day>=h.from&&day<=h.to&&h.currencies.includes(currency))
      const sourceHistory=rate(source),targetHistory=rate(target)
      const s=typeof sourceHistory==='number'?sourceHistory:sourceHistory && sourceHistory.status!=='stale'?datedFxAt(sourceHistory,day,source).rate:null
      const t=typeof targetHistory==='number'?targetHistory:targetHistory && targetHistory.status!=='stale'?datedFxAt(targetHistory,day,target).rate:null
      return s && t ? convertCurrency(amount,source,target,{[source]:s,[target]:t},'EUR').value:null
    }
    const byCurrency=Object.fromEntries(options.currencies.map(currency=>{
      const holdings=accounts.map(account=>{
        const history=account.symbol?histories[symbolOf(account)??'']:undefined
        const anchor=account.holding_position?.anchor
        const events=history?.events.some(e=>!anchor || e.date>anchor.effective_date)??false
        const metric=holdingMetrics(account,trades.filter(t=>t.account_id===account.id),currency,quotes[symbolOf(account)??''],currentConvert,datedConvert,date,events)
        if (usesMarketPricing(account) && (account.balance!==0 || trades.some(t=>t.account_id===account.id)) && (!history || history.status==='stale')) {
          metric.coverage.cost.push('unverified_corporate_actions')
          for(const id of Object.keys(metric.trade_realized)) metric.trade_realized[id]=null
          metric.realized_gain=null;metric.unrealized_gain=null;metric.total_gain=null
          metric.native.realized_gain=null;metric.native.unrealized_gain=null;metric.native.total_gain=null
        }
        return metric
      })
      const today=this.today(accounts,trades,holdings,quotes,histories,currency,date,prior,datedConvert)
      const totals=portfolioMetrics(holdings,options.partial)
      for(const h of holdings) h.allocation_percent=totals.valuation_status==='complete' && totals.total_value!==null && totals.total_value>0 && h.value!==null?h.value/totals.total_value*100:null
      // MCP allows partial current value. Unknown costs/gains never become zero
      // merely because every holding is uncovered.
      for(const key of ['total_invested','remaining_basis','realized_gain','unrealized_gain','total_gain'] as const) {
        const field=key==='total_invested'?'net_invested':key
        if(holdings.length && !holdings.some(h=>h[field]!==null)) totals[key]=null
      }
      return [currency,{...totals,currency,holdings,market_today:today}]
    }))
    signal.throwIfAborted()
    if (await this.repo.revision()!==facts.revision) throw new MetricsReadError('conflict','Investment records changed while calculating metrics; refresh and retry')
    return {as_of:new Date(now).toISOString(),date,scope:options.scope??'investments',source_revision:facts.revision,
      accounts,trades,current_fx:{base:'USD',as_of:ratesAsOf,rates},quotes,by_currency:byCurrency}
  }
  private today(accounts:MetricAccount[],trades:MetricTrade[],holdings:HoldingMetrics[],quotes:Record<string,Quote>,histories:Record<string,PriceHistory>,currency:string,date:string,prior:string,convert:DatedConversion) {
    const excluded:{account_id:string;reasons:string[]}[]=[]
    let start=0,end=0,contribution=0,withdrawal=0,count=0
    for(const a of accounts) {
      const symbol=a.symbol?.trim().toUpperCase()??''
      const h=holdings.find(h=>h.account_id===a.id)!,q=quotes[symbol],history=histories[symbol]
      const reasons:string[]=[]
      if(!usesMarketPricing(a)) reasons.push('manual_pricing')
      const today=trades.filter(t=>t.account_id===a.id&&t.date===date)
      const anchor=a.holding_position?.anchor
      if(!anchor || anchor.effective_date>prior || today.some(t=>!afterAnchor(a,t))) reasons.push('unknown_prior_position')
      let units=positionUnits(a)
      for(const t of today) { if(units!==null) {try {units=addExact(units,t.type==='buy'?-t.quantity:t.quantity)} catch {units=null}} }
      if(h.coverage.cost.some(r=>['quantity_mismatch','ambiguous_event_order','unsupported_position_history','future_trade'].includes(r))) reasons.push('unverified_position_history')
      if(units===null || units<0) reasons.push('quantity_mismatch')
      const price=history?dailyPriceAt(history,prior):null
      const priorValue=units===0?0:units!==null && price?.price!=null && history?convert(units*price.price,history.currency,currency,prior):null
      if(history?.points.find(p=>p.date===prior)?.provisional) reasons.push('provisional_prior_price')
      if(priorValue===null) reasons.push(price?.price==null?'missing_prior_price':'missing_prior_fx')
      if(h.value===null) reasons.push('missing_current_value')
      if((units!==0 || a.balance!==0) && (!q || q.status==='stale' || q.status==='missing' || q.status==='unsupported')) reasons.push('stale_or_missing_quote')
      if(history?.status==='stale') reasons.push('stale_history')
      if(history?.events.some(e=>e.date>=prior)) reasons.push('unsupported_event')
      let c=0,w=0
      for(const t of today) {
        const cash=t.cash_amount!=null&&t.cash_currency?convert(t.cash_amount,t.cash_currency,currency,date):null
        if(cash===null) reasons.push('unknown_today_cash_or_fx')
        else if(t.type==='buy') c+=cash
        else w+=cash
      }
      if(reasons.length) { excluded.push({account_id:a.id,reasons:[...new Set(reasons)]});continue }
      count++;start+=priorValue!;end+=h.value!;contribution+=c;withdrawal+=w
    }
    const result=count?estimatedReturn(start,[{value:end,contribution,withdrawal}]):{gain:null,percent:null}
    return {gain:result.gain,estimated_return_percent:result.percent,currency,date,prior_date:prior,covered_holdings:count,total_holdings:accounts.length,excluded,
      method:'local_calendar_day_prior_close_with_dated_fx; contributions_at_start_withdrawals_at_end',
      boundary:'Last available completed daily close at prior calendar date; weekend carry only. Intraday return is an estimate.'}
  }
}
export function createInvestmentMetricsReader(db:D1Database) {
  return new InvestmentMetricsReader(new InvestmentMetricsRepository(db),new MarketReader(new D1MarketCache(db)))
}
