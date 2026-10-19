import {addExact} from './investment-trade'
import {usesMarketPricing,effectivePositionAnchor} from './holding'
import type {PositionAnchor} from './holding'
import type {ManualValuation} from './manual-valuation'
import {dailyPriceAt,datedFxAt} from './market-data'
import type {FxHistory,PriceHistory,Quote} from './market-data'
import {convertCurrency,sumAvailable} from './currency'
import {estimatedReturn,orderedTrades,positionUnits} from './investment-metrics'
import type {MetricAccount,MetricTrade} from './investment-metrics'
import {addDays,dayCutoff,zonedDate} from './investment-history-dates'
export type HistoryAnchor=PositionAnchor & {account_id:string;record_order:number}
export type HistoryIssue={account_id:string;reasons:string[]}
export type HistoryPoint={date:string;value:number|null;net_invested:number|null;contribution:number|null;withdrawal:number|null;
 provisional:boolean;issues:HistoryIssue[];performance_issues:HistoryIssue[];event:boolean}
export type HoldingHistoryPoint={date:string;quantity:number|null;value:number|null;native_value:number|null;native_currency:string;
 net_invested:number|null;contribution:number|null;withdrawal:number|null;price_as_of:string|null;fx_as_of:string|null;
 reasons:string[];performance_reasons:string[];event:boolean;provisional:boolean}
export type HistoryInputs={accounts:MetricAccount[];anchors:HistoryAnchor[];trades:MetricTrade[];valuations:ManualValuation[];
 prices:Record<string,PriceHistory>;quotes:Record<string,Quote>;fx:FxHistory[];current_rates:Record<string,number>;current_fx_as_of?:string|null;
 from:string;to:string;currency:string;timezone:string;today:string;as_of:number;signal?:AbortSignal}
export type HistoryRangeSummary={gain:number|null;estimated_return_percent:number|null;start_value:number|null;end_value:number|null;
 contribution:number|null;withdrawal:number|null;coverage_start:string|null;status:'complete'|'partial';reasons:string[]}
type Context=HistoryInputs & {fxLookup:Map<string,ReturnType<typeof datedFxAt>>;publication:Map<string,number>;sourceDays:Map<string,{date:string;cutoff:number}>}
function lastOnOrBefore<T extends {date:string}>(points:T[],date:string):T|undefined {
 let low=0,high=points.length
 while(low<high){const mid=(low+high)>>>1;if(points[mid].date<=date)low=mid+1;else high=mid}
 return low?points[low-1]:undefined
}
const finite=(v:number|null)=>v!==null&&Number.isFinite(v)?v:null
const sum=(values:(number|null)[])=>finite(sumAvailable(values))
const plus=(a:number|null,b:number|null)=>a===null||b===null?null:finite(a+b)
const zeroOrConvert=(amount:number,source:string,target:string,rates:Record<string,number>)=>amount===0?0:convertCurrency(amount,source,target,rates,'USD').value
function effectiveAnchors(anchors:HistoryAnchor[]) {
 const sorted=[...anchors].sort((a,b)=>a.record_order-b.record_order)
 const opening=sorted.filter(a=>a.kind==='opening').at(-1)
 // A newly confirmed opening replaces older opening/observation versions. Later
 // corrections remain noncash dated boundaries, not hidden purchases.
 return sorted.filter(a=>!opening||a.record_order>=opening.record_order)
}
export function holdingHistoryAnchors(account:MetricAccount,anchors:HistoryAnchor[]):HistoryAnchor[] {
 const effective=effectivePositionAnchor(account)
 return account.holding_position?.recorded_history&&effective ? [{...effective,account_id:account.id,record_order:0}]
   : anchors.filter(p=>p.account_id===account.id)
}
export function supportedStart(anchors:HistoryAnchor[],today:string) {
 return anchors.length?effectiveAnchors(anchors).map(a=>a.effective_date).sort()[0]:today
}
function fxConvert(input:Context,amount:number,source:string,date:string,cutoff:number) {
 if(source===input.currency||amount===0)return {value:amount,as_of:null,reason:null}
 const get=(currency:string)=>{
  if(currency==='EUR')return {rate:1,as_of:null,reason:null}
  const key=`${currency}:${date}`,cached=input.fxLookup.get(key)
  if(cached)return cached
  const h=input.fx.find(h=>date>=h.from&&date<=h.to&&h.currencies.includes(currency))
  // Lookup the latest usable observation with a bounded annual scan once per
  // currency/date, shared across all holdings and same-date cash flows.
  const result=h&&h.status!=='stale'?datedFxAt(h,date,currency):{rate:null,as_of:null,reason:'missing_fx'}
  input.fxLookup.set(key,result);return result
 }
 const s=get(source),t=get(input.currency)
 const observation=[s.as_of,t.as_of].filter((v):v is string=>v!==null).sort().at(-1)??null
 // ECB supplies daily dates, not ticks. Treat each observation as certainly
 // available by that ECB calendar day's end; never borrow a later publication.
 if(observation&&!input.publication.has(observation))input.publication.set(observation,Math.min(dayCutoff(observation,'Europe/Brussels'),input.as_of))
 if(observation && input.publication.get(observation)!>cutoff)return {value:null,as_of:observation,reason:'fx_after_cutoff'}
 const result=s.rate&&t.rate?convertCurrency(amount,source,input.currency,{[source]:s.rate,[input.currency]:t.rate},'EUR').value:null
 return {value:result,as_of:observation,reason:result===null?'missing_fx':null}
}
function sourcePrice(input:Context,a:MetricAccount,cutoff:number) {
 const symbol=a.symbol?.trim().toUpperCase()??'',h=input.prices[symbol]
 if(!h)return {value:null,currency:a.quote_currency??'',as_of:null,reason:'missing_price'}
 if(h.status==='stale')return {value:null,currency:h.currency,as_of:null,reason:'stale_history'}
 // Daily bars lack historical session-end timestamps. Source-day end is a
 // conservative availability boundary, including holidays/half sessions.
 const zone=h.category==='crypto'?'UTC':h.timezone,key=`${zone}:${cutoff}`
 let boundary=input.sourceDays.get(key)
 if(!boundary){const day=zonedDate(cutoff,zone);boundary={date:day,cutoff:dayCutoff(day,zone)};input.sourceDays.set(key,boundary)}
 const target=boundary.cutoff>cutoff?addDays(boundary.date,-1):boundary.date
 const point=lastOnOrBefore(h.points,target)
 const p=dailyPriceAt({...h,points:point?[point]:[]},target)
 if(a.quote_currency && h.currency!==a.quote_currency)return {value:null,currency:h.currency,as_of:p.as_of,reason:'quote_currency_mismatch'}
 // Provider daily bars are labelled with native session dates. No backward fill
 // before listing, missing weekday carry or indefinite outage bridging.
 return {value:p.price,currency:h.currency,as_of:p.as_of,reason:p.price===null?p.reason??'missing_price':null}
}
function holdingSeries(input:Context,a:MetricAccount,dates:string[],cutoffs:Map<string,number>) {
 const anchors=effectiveAnchors(holdingHistoryAnchors(a,input.anchors)).sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.record_order-b.record_order)
 const trades=orderedTrades(input.trades.filter(t=>t.account_id===a.id))
 const values=input.valuations.filter(v=>v.account_id===a.id).sort((a,b)=>a.effective_date.localeCompare(b.effective_date))
 const lastOpening=anchors.find(a=>a.kind==='opening'),manual=a.asset_type==='manual'
 const zeroStart=lastOpening?.kind==='opening'&&(manual?lastOpening.owned===false:lastOpening.balance===0)&&!trades.some(t=>t.date<=lastOpening.effective_date)
 const start=dates[0],symbol=a.symbol?.trim().toUpperCase()??'',history=input.prices[symbol]
 let anchorIndex=0,investedAvailable=0
 let q:number|null=zeroStart?0:null,anchor:HistoryAnchor|undefined,tradeIndex=0,valueIndex=0,valuation:ManualValuation|undefined
 let invested:number|null=zeroStart?0:null,unsupportedUnits=false,unsupportedCash=!zeroStart
 const points:HoldingHistoryPoint[]=[]
 const flowCache=new Map<string,ReturnType<typeof fxConvert>>()
 const cashAt=(t:MetricTrade,cutoff:number)=>{
  if(t.cash_amount==null||!Number.isFinite(t.cash_amount)||t.cash_amount<0||!t.cash_currency)return {value:null,as_of:null,reason:'unknown_cash_flow'}
  const key=`${t.id}:${cutoff}`
  let result=flowCache.get(key)
  if(!result){result=fxConvert(input,t.cash_amount,t.cash_currency,t.date,cutoff);flowCache.set(key,result)}
  return result
 }
 // Establish the requested opening boundary by replaying earlier facts once.
 // Each later day advances cursors; there is no dates × entire-trade-list scan.
 const process=(date:string,cutoff:number,emit:boolean)=>{
  const reasons=new Set<string>(),performance=new Set<string>()
  let event=false,c:number|null=0,w:number|null=0,heldDuringDay=q!==0
  let nextAnchor=anchor
  while(anchorIndex<anchors.length&&anchors[anchorIndex].effective_date<=date){const p=anchors[anchorIndex++];if(!nextAnchor||p.record_order>nextAnchor.record_order)nextAnchor=p}
  if(nextAnchor && anchor?.id!==nextAnchor.id) {
   anchor=nextAnchor;q=manual?anchor.owned==null?anchor.balance>0?1:null:Number(anchor.owned):anchor.balance
   unsupportedUnits=false;heldDuringDay ||= q!==0
   if(emit&&anchor.effective_date===date){event=true;if(anchor.kind!=='opening'||q!==0)performance.add('noncash_position_boundary')}
  }
  const included=(t:MetricTrade)=>anchor ? anchor.kind==='opening'?t.date>anchor.effective_date:(t.effective_order??0)>(anchor.trade_order_boundary??anchor.trade_rowid_boundary):false
  while(tradeIndex<trades.length&&trades[tradeIndex].date<=date) {
   const t=trades[tradeIndex++]
   const cash=cashAt(t,cutoff),knownCash=cashAt(t,input.as_of),sameDay=t.date===date
   invested=plus(invested,knownCash.value===null?null:t.type==='buy'?knownCash.value:-knownCash.value)
   if(knownCash.as_of&&knownCash.as_of.length===10&&t.cash_currency!==input.currency)investedAvailable=Math.max(investedAvailable,Math.min(dayCutoff(knownCash.as_of,'Europe/Brussels'),input.as_of))
   if(sameDay){if(cash.value===null)performance.add(cash.reason??'unknown_cash_flow');if(t.type==='buy')c=plus(c,cash.value);else w=plus(w,cash.value)}
   if(sameDay)event=true
   if(!included(t))continue
   if(!Number.isFinite(t.quantity)||t.quantity<=0||!Number.isSafeInteger(t.effective_order)||(t.effective_order??0)<1||t.date<anchor!.effective_date||q===null){q=null;performance.add('unverified_trade_order')}
   else if(manual && (t.quantity!==1||t.asset_event!==(t.type==='buy'?'acquisition':'disposal')||(t.type==='buy'?q!==0:q!==1))){q=null;performance.add('unsupported_asset_event')}
   else {try {q=addExact(q,t.type==='buy'?t.quantity:-t.quantity);if(q<0)q=null}catch{q=null}if(q===null)performance.add('quantity_mismatch')}
   heldDuringDay ||= q!==0
   if(sameDay)event=true
  }
  if(usesMarketPricing(a)&&history&&date<history.from&&q!==0)unsupportedUnits=true
  for(const action of history?.events??[])if(action.date===date&&heldDuringDay&&(!anchor||action.date>anchor.effective_date)){
   event=true;unsupportedCash=true;invested=null;performance.add('unsupported_event')
   if(action.type==='split')unsupportedUnits=true
  }
  while(valueIndex<values.length&&values[valueIndex].effective_date<=date){valuation=values[valueIndex++];if(valuation.effective_date===date)event=true}
  if(!emit)return undefined
  let quantity=unsupportedUnits?null:q,native:number|null=null,nativeCurrency=manual?a.currency:a.quote_currency??history?.currency??'',priceDate:string|null=null
  if(quantity===0)native=0
  else if(quantity===null)reasons.add(anchor?'quantity_mismatch':'unknown_opening')
  else if(!usesMarketPricing(a)) {
   if(!valuation || valuation.kind!==(manual?'total':'per_unit')||valuation.currency!==nativeCurrency)reasons.add('missing_valuation')
   else {native=manual?valuation.amount:quantity*valuation.amount;priceDate=valuation.effective_date}
  } else {
   const price=sourcePrice(input,a,cutoff);priceDate=price.as_of;nativeCurrency=price.currency
   if(price.value===null)reasons.add(price.reason??'missing_price');else native=quantity*price.value
  }
  native=finite(native)
  if(native===null&&!reasons.size)reasons.add('nonfinite_value')
  const provisional=date===input.today
  let converted=native===null?{value:null,as_of:null,reason:null}:fxConvert(input,native,nativeCurrency,date,cutoff)
  if(provisional) {
   const currentUnits=positionUnits(a)
   const live=input.quotes[symbol]
   if(a.archived_at!=null&&currentUnits!==0){native=null;converted={value:null,as_of:null,reason:'archived_nonzero_position'}}
   else {
    if(quantity!==currentUnits)performance.add('current_quantity_mismatch')
    quantity=currentUnits
    if(currentUnits===0)native=0
    else if(manual)native=a.balance
    else if(!usesMarketPricing(a))native=currentUnits===null||!valuation?null:currentUnits*valuation.amount
    else native=currentUnits===null||live?.price==null||!live.currency||a.quote_currency&&a.quote_currency!==live.currency?null:currentUnits*live.price
    nativeCurrency=manual?a.currency:usesMarketPricing(a)?live?.currency??nativeCurrency:nativeCurrency
    native=finite(native)
    if(currentUnits!==0&&usesMarketPricing(a)&&live?.as_of&&Date.parse(live.as_of)>input.as_of)native=null
    if(currentUnits!==null&&currentUnits<0)native=null
    converted={value:native===null?null:zeroOrConvert(native,nativeCurrency,input.currency,input.current_rates),as_of:native===0||nativeCurrency===input.currency?null:input.current_fx_as_of??null,reason:null}
    reasons.clear();if(native===null)reasons.add('missing_current_value')
    if(live?.status==='stale'&&usesMarketPricing(a))performance.add('stale_price')
    priceDate=usesMarketPricing(a)?live?.as_of??null:valuation?.effective_date??null
   }
  }
  if(converted.value===null&&native!==null)reasons.add(converted.reason??'missing_fx')
  if(unsupportedCash)invested=null
  if(unsupportedUnits)performance.add('unsupported_event')
  if(reasons.size)for(const r of reasons)performance.add(r)
  return {date,quantity,value:converted.value,native_value:native,native_currency:nativeCurrency,net_invested:investedAvailable>cutoff?null:invested,contribution:c,withdrawal:w,
   price_as_of:priceDate,fx_as_of:converted.as_of,reasons:[...reasons],performance_reasons:[...performance],event,provisional}
 }
 // Replay from the earliest supported anchor, including excluded/included old
 // rows in durable order, before emitting the requested prior-day boundary.
 const earlierDates=[...new Set([...anchors.map(a=>a.effective_date),...trades.map(t=>t.date),...values.map(v=>v.effective_date),...(history?.events.map(e=>e.date)??[])])].filter(d=>d<start).sort()
 for(const day of earlierDates)process(day,input.as_of,false)
 for(const day of dates){input.signal?.throwIfAborted();points.push(process(day,cutoffs.get(day)!,true)!)}
 return points
}
export function summarizeHistory(points:Pick<HistoryPoint,'date'|'value'|'contribution'|'withdrawal'|'performance_issues'>[]):HistoryRangeSummary {
 const opening=points[0],days=points.slice(1),blocked=days.some(p=>p.performance_issues.length>0)
 const contributions=sum(days.map(p=>p.contribution)),withdrawals=sum(days.map(p=>p.withdrawal))
 const result=estimatedReturn(opening?.value??null,days.map(p=>({value:p.value,contribution:p.contribution,withdrawal:p.withdrawal})))
 const reasons=[...new Set(days.flatMap(p=>p.performance_issues.flatMap(i=>i.reasons)))]
 const firstMissing=points.find(p=>p.value===null)
 if(result.percent===null&&!blocked&&!firstMissing&&contributions===0&&withdrawals===0)reasons.push('inactive_range')
 if(firstMissing)reasons.push('incomplete_daily_values')
 return {gain:blocked&&days.some(p=>p.performance_issues.some(i=>i.reasons.some(r=>['noncash_position_boundary','unsupported_event','unknown_cash_flow','unverified_trade_order','quantity_mismatch','current_quantity_mismatch'].includes(r))))?null:result.gain,
  estimated_return_percent:blocked?null:result.percent,start_value:opening?.value??null,end_value:points.at(-1)?.value??null,
  contribution:contributions,withdrawal:withdrawals,coverage_start:points.find(p=>p.value!==null)?.date??null,
  status:!blocked&&!firstMissing&&contributions!==null&&withdrawals!==null?'complete':'partial',reasons:[...new Set(reasons)]}
}
/** Retain event days, their neighbors, extrema and gap transitions. Downsampling
 * never connects a missing interval or hides a cash/valuation/position event. */
export function downsampleHistory(points:HistoryPoint[],maxPoints:number) {
 if(points.length<=maxPoints)return points
 const keep=new Set<number>([0,points.length-1])
 for(let i=0;i<points.length;i++) {
  const p=points[i],previous=points[i-1]
  if(p.event||previous&&(p.value===null)!==(previous.value===null)||previous&&(p.net_invested===null)!==(previous.net_invested===null))for(const n of [i-1,i,i+1])if(n>=0&&n<points.length)keep.add(n)
 }
 if(keep.size>maxPoints)throw new Error('Material history events exceed the response limit; choose a shorter range')
 const buckets=Math.max(1,Math.floor((maxPoints-keep.size)/4)),width=points.length/buckets
 for(let b=0;b<buckets;b++) {
  const begin=Math.floor(b*width),end=Math.min(points.length,Math.ceil((b+1)*width)),indices=Array.from({length:end-begin},(_,i)=>begin+i)
  for(const field of ['value','net_invested'] as const) {
   const known=indices.filter(i=>points[i][field]!==null)
   if(known.length){keep.add(known.reduce((a,b)=>points[a][field]!<points[b][field]!?a:b));keep.add(known.reduce((a,b)=>points[a][field]!>points[b][field]!?a:b))}
  }
 }
 if(keep.size>maxPoints)throw new Error('History detail exceeds the response limit; choose a shorter range')
 return [...keep].sort((a,b)=>a-b).map(i=>points[i])
}
export function calculatePortfolioHistory(source:HistoryInputs) {
 const input:Context={...source,fxLookup:new Map(),publication:new Map(),sourceDays:new Map()}
 input.signal?.throwIfAborted()
 const dates:string[]=[]
 for(let day=addDays(input.from,-1);day<=input.to;day=addDays(day,1))dates.push(day)
 const cutoffs=new Map(dates.map(day=>[day,day===input.today?input.as_of:dayCutoff(day,input.timezone)]))
 const holdings=input.accounts.map(a=>({account_id:a.id,name:a.name,archived:a.archived_at!=null,points:holdingSeries(input,a,dates,cutoffs)}))
 const points:HistoryPoint[]=dates.map((date,index)=>({date,value:sum(holdings.map(h=>h.points[index].value)),net_invested:sum(holdings.map(h=>h.points[index].net_invested)),
  contribution:sum(holdings.map(h=>h.points[index].contribution)),withdrawal:sum(holdings.map(h=>h.points[index].withdrawal)),provisional:date===input.today,
  issues:holdings.filter(h=>h.points[index].reasons.length).map(h=>({account_id:h.account_id,reasons:h.points[index].reasons})),
  performance_issues:holdings.filter(h=>h.points[index].performance_reasons.length).map(h=>({account_id:h.account_id,reasons:h.points[index].performance_reasons})),event:holdings.some(h=>h.points[index].event)}))
 const summary=summarizeHistory(points)
 return {points,summary,holdings:holdings.map(h=>({...h,summary:summarizeHistory(h.points.map(p=>({...p,performance_issues:p.performance_reasons.length?[{account_id:h.account_id,reasons:p.performance_reasons}]:[]})))}))}
}
