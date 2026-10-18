import {MarketReader} from '../../../shared/market-reader'
import {D1MarketCache} from '../../../shared/market-cache'
import {DAY,calendarDate,dateRange,marketSymbol,isoDate} from '../../../shared/market-data'
import type {PriceHistory,Quote,FxHistory} from '../../../shared/market-data'
import {validRates} from '../../../shared/currency'
import {tradeCurrencies} from '../../../shared/investment-trade'
import {calculatePortfolioHistory,downsampleHistory,supportedStart} from '../../../shared/investment-history'
import type {HistoryPoint} from '../../../shared/investment-history'
import {addDays,rangeStart} from '../../../shared/investment-history-dates'
import type {PortfolioRange} from '../../../shared/investment-history-dates'
import type {PortfolioHistoryResponse,PortfolioHistoryPoint} from '../../../shared/investment-history-contract'
import {InvestmentHistoryRepository} from '../repositories/investment-history.repository'
import {AppError} from '../errors/codes'
export type HistoryRequest={range?:PortfolioRange;from?:string;to?:string;currency:string;timezone:string;maxPoints:number;expectedRevision?:number;clientDate?:string;signal:AbortSignal}
export class InvestmentHistoryService {
 constructor(private repo:InvestmentHistoryRepository,private market:MarketReader,private clock=()=>Date.now()) {}
 async read(request:HistoryRequest):Promise<PortfolioHistoryResponse> {
  const now=this.clock(),nativeToday=calendarDate(now,request.timezone)
  const today=isoDate(request.clientDate)&&Math.abs(Date.parse(request.clientDate)-Date.parse(nativeToday))<=DAY?request.clientDate:nativeToday
  const to=request.to??today,signal=AbortSignal.any([request.signal,AbortSignal.timeout(45_000)])
  signal.throwIfAborted()
  const facts=await this.repo.read()
  signal.throwIfAborted()
  if(request.expectedRevision!==undefined&&request.expectedRevision!==facts.revision)throw new AppError('INVESTMENT_HISTORY_CONFLICT','Investment facts changed; refresh the portfolio before loading history.',409)
  const horizon=new Date(now-3659*DAY).toISOString().slice(0,10)
  const earliest=[...facts.accounts.map(a=>supportedStart(facts.anchors.filter(p=>p.account_id===a.id),to)),to].sort()[0]
  const start=request.from??rangeStart(request.range??'1m',to,addDays(earliest,1))
  const from=[start,addDays(horizon,1)].sort().at(-1)!,prior=addDays(from,-1)
  if(start<horizon && request.from)throw AppError.validation('Portfolio history is limited to the last ten years')
  try {dateRange(prior,to,now,3660,today)} catch {throw AppError.validation('Choose real, ordered dates within the last ten years and no later than today')}
  if(from>to)throw AppError.validation('History start must be on or before its end')
  if(to>today)throw AppError.validation('Future portfolio history is unavailable')
  const positionDays=(Math.round((Date.parse(to)-Date.parse(prior))/DAY)+1)*facts.accounts.length
  if(positionDays>75_000)throw new AppError('INVESTMENT_HISTORY_LIMIT','This range exceeds 75,000 daily holding positions; choose a shorter range.',422)
  const symbols=[...new Set(facts.accounts.filter(a=>a.asset_type!=='manual'&&a.pricing_method!=='manual'&&a.symbol).flatMap(a=>{try{return [marketSymbol(a.symbol!)]}catch{return []}}))]
  const sourceStarts=Object.fromEntries(symbols.map(symbol=>{
   const starts=facts.accounts.filter(a=>a.symbol?.trim().toUpperCase()===symbol).map(a=>supportedStart(facts.anchors.filter(p=>p.account_id===a.id),to))
   // Corporate actions before the selected range still affect owned units.
   // Use the supported position boundary, reusing the metrics source cache.
   return [symbol,[horizon,[addDays(prior,-4),...starts].sort()[0]].sort().at(-1)!]
  }))
  const sourceDays=symbols.reduce((sum,symbol)=>sum+Math.max(0,Math.round((Date.parse(to)-Date.parse(sourceStarts[symbol]))/DAY)+1),0)
  if(sourceDays>150_000)throw new AppError('INVESTMENT_HISTORY_LIMIT','Historical source coverage exceeds the supported work limit; fewer holdings or a newer reconciled position boundary is required.',422)
  const prices:Record<string,PriceHistory>={},quotes:Record<string,Quote>={}
  // Fetch a whole window per unique symbol with bounded concurrency. A history
  // read also warms its quote cache, avoiding one request per holding per date.
  let next=0
  await Promise.all(Array.from({length:Math.min(4,symbols.length)},async()=>{
   while(next<symbols.length){const symbol=symbols[next++];try{prices[symbol]=await this.market.history(symbol,sourceStarts[symbol],to,signal,today)}catch{signal.throwIfAborted()}}
  }))
  for(let i=0;i<symbols.length;i+=50)Object.assign(quotes,await this.market.quotes(symbols.slice(i,i+50),signal))
  const currentFx: {rates:Record<string,number>;as_of:string|null}=await (async()=>{
   const missing={rates:{},as_of:null}
   if(to!==today)return missing
   try {
    const r=await fetch('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.any([signal,AbortSignal.timeout(6000)])})
    if(!r.ok)return missing
    const b=await r.json<{result?:string;rates?:unknown;time_last_update_utc?:string}>(),rates=validRates(b.rates)
    if(b.result!=='success'||rates.USD!==1)return missing
    const time=b.time_last_update_utc?Date.parse(b.time_last_update_utc):NaN
    return {rates,as_of:Number.isFinite(time)&&time<=this.clock()?new Date(time).toISOString():null}
   }catch{signal.throwIfAborted();return missing}
  })()
  const sourceCurrency=(a:typeof facts.accounts[number])=>a.asset_type==='manual'?a.currency:a.quote_currency??prices[a.symbol?.trim().toUpperCase()??'']?.currency??quotes[a.symbol?.trim().toUpperCase()??'']?.currency
  const needsFx=facts.accounts.some(a=>sourceCurrency(a)!==request.currency)||facts.trades.some(t=>t.cash_currency&&t.cash_currency!==request.currency)
  const currencies=needsFx?[...new Set([request.currency,...facts.accounts.map(sourceCurrency),...facts.trades.map(t=>t.cash_currency)].filter((c):c is string=>!!c&&(tradeCurrencies as readonly string[]).includes(c)&&c!=='EUR'))]:[]
  const fx:FxHistory[]=[]
  const fxDates=[prior,...facts.trades.filter(t=>t.date<=to&&t.cash_currency&&t.cash_currency!==request.currency).map(t=>t.date)]
  const wanted=fxDates.filter(d=>d>=horizon&&d<=to).sort()[0]??prior
  const first=[horizon,wanted].sort().at(-1)!
  // At most eleven annual windows in the provider's supported horizon. Source
  // cache keys include exact currencies/ranges; financial derived reads are not cached.
  if(currencies.length)for(let year=Number(first.slice(0,4));year<=Number(to.slice(0,4));year++) {
   const begin=[`${year}-01-01`,first].sort().at(-1)!,end=[`${year}-12-31`,to].sort()[0]
   if(begin<=end)fx.push(await this.market.fx(begin,end,currencies,signal,today))
  }
  const asOf=this.clock()
  if(calendarDate(asOf,request.timezone)!==nativeToday)throw new AppError('INVESTMENT_HISTORY_CONFLICT','The reporting day changed during history loading; refresh and retry.',409)
  const calculated=calculatePortfolioHistory({accounts:facts.accounts,anchors:facts.anchors,trades:facts.trades,valuations:facts.valuations,
   prices,quotes,fx,current_rates:currentFx.rates,current_fx_as_of:currentFx.as_of,from,to,currency:request.currency,timezone:request.timezone,today,as_of:asOf,signal})
  let sampled:HistoryPoint[]
  try{sampled=downsampleHistory(calculated.points.slice(1),request.maxPoints)}catch{throw new AppError('INVESTMENT_HISTORY_LIMIT','Too many material events for this chart; choose a shorter range or increase max_points (maximum 1200).',422)}
  const point=(p:HistoryPoint):PortfolioHistoryPoint=>{
   const index=Math.round((Date.parse(p.date)-Date.parse(prior))/DAY)
   const priceDates=calculated.holdings.map(h=>h.points[index].price_as_of).filter((v):v is string=>v!==null).sort()
   const fxDates=calculated.holdings.map(h=>h.points[index].fx_as_of).filter((v):v is string=>v!==null).sort()
   return {date:p.date,value:p.value,net_invested:p.net_invested,contribution:p.contribution,withdrawal:p.withdrawal,event:p.event,provisional:p.provisional,coverage:p.issues.length?'partial':'complete',
    price_as_of_oldest:priceDates[0]??null,price_as_of_latest:priceDates.at(-1)??null,fx_as_of_oldest:fxDates[0]??null,fx_as_of_latest:fxDates.at(-1)??null}
  }
  const coverage:PortfolioHistoryResponse['coverage_ranges']=[]
  for(const h of calculated.holdings)for(const kind of ['value','performance'] as const){
   let active:typeof coverage[number]|null=null
   for(const p of h.points){const reasons=kind==='value'?p.reasons:p.performance_reasons
    if(!reasons.length){active=null;continue}
    if(active&&active.reasons.join('|')===reasons.join('|')&&addDays(active.to,1)===p.date)active.to=p.date
    else{active={account_id:h.account_id,from:p.date,to:p.date,reasons,kind};coverage.push(active)}
   }
  }
  if(coverage.length>4000)throw new AppError('INVESTMENT_HISTORY_LIMIT','Too many distinct coverage intervals; choose a shorter history range.',422)
  signal.throwIfAborted()
  if(await this.repo.revision()!==facts.revision)throw new AppError('INVESTMENT_HISTORY_CONFLICT','Investment records changed during history loading; refresh and retry.',409)
  return {as_of:new Date(asOf).toISOString(),source_revision:facts.revision,currency:request.currency,timezone:request.timezone,range:request.range??'custom',from,to,prior_date:prior,
   scope:'all_investment_holdings_including_archived',points:sampled.map(point),opening:point(calculated.points[0]),summary:calculated.summary,coverage_ranges:coverage,
   holdings:calculated.holdings.map(h=>({account_id:h.account_id,name:h.name,archived:h.archived,summary:h.summary,first_price_as_of:h.points[0]?.price_as_of??null,last_price_as_of:h.points.at(-1)?.price_as_of??null})),
   sampling:{daily_points:calculated.points.length-1,returned_points:sampled.length,max_points:request.maxPoints,method:'daily first; preserve events, neighbors, extrema and gaps'},
   sources:symbols.map(symbol=>({symbol,provider:'yahoo',retrieved_at:prices[symbol]?.retrieved_at??null,status:prices[symbol]?.status??'missing',from:prices[symbol]?.from??prior,to:prices[symbol]?.to??to,timezone:prices[symbol]?.timezone??null})),
   method:{return_label:'Estimated return',flow_timing:'Contributions at start of day; withdrawals at end; geometrically link daily factors. No annualization.',
    price_timing:'Native daily closes are conservatively available at the end of their source calendar day; exact historical session-end times are unavailable. Reporting cutoffs can therefore use the prior source day. Crypto uses UTC daily close. Missing weekdays never carry.',
    fx_timing:'Dated ECB observations; conservative publication-day cutoff, bounded TARGET holiday carry. Never current FX for past values or flows.',
    current_endpoint:'Current local day is provisional at response as_of, using stored current units, current quotes and current FX. Historical dates use dated observations.'}}
 }
}
export function createInvestmentHistoryService(db:D1Database){return new InvestmentHistoryService(new InvestmentHistoryRepository(db),new MarketReader(new D1MarketCache(db)))}
