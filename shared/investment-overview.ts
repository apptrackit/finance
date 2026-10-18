import type {MetricAccount} from './investment-metrics'
import type {ManualValuation} from './manual-valuation'
import type {PriceHistory} from './market-data'
import {dailyPriceAt} from './market-data'
import {usesMarketPricing} from './holding'
import {addDays} from './investment-history-dates'
export type HoldingTrend={currency:string;kind:'unit_price'|'total_value';method:'linear'|'step';status:'ok'|'stale'|'missing';
 points:{date:string;value:number|null;as_of:string|null;provisional:boolean}[];reasons:string[]}
/** Native observations only: never generated prices, current units × old prices,
 * or appraisals interpreted as contributions. All dates include explicit gaps. */
export function holdingTrends(accounts:MetricAccount[],valuations:ManualValuation[],histories:Record<string,PriceHistory>,to:string):Record<string,HoldingTrend> {
 const from=addDays(to,-29),dates=Array.from({length:30},(_,i)=>addDays(from,i))
 return Object.fromEntries(accounts.map(a=>{
  const market=usesMarketPricing(a),total=a.asset_type==='manual',history=histories[a.symbol?.trim().toUpperCase()??'']
  const currency=(total?a.currency:a.quote_currency??history?.currency)??''
  const observations=valuations.filter(v=>v.account_id===a.id).sort((a,b)=>a.effective_date.localeCompare(b.effective_date))
  let index=0,observation:ManualValuation|undefined
  const mismatch=market&&!!history&&!!a.quote_currency&&a.quote_currency!==history.currency
  const points=dates.map(date=>{
   if(market){const p=history&&!mismatch?dailyPriceAt(history,date):null
    return {date,value:p?.price??null,as_of:p?.as_of??null,provisional:history?.points.some(p=>p.date===date&&p.provisional)??false}}
   while(index<observations.length&&observations[index].effective_date<=date)observation=observations[index++]
   const valid=observation?.currency===currency&&observation.kind===(total?'total':'per_unit')
   return {date,value:valid?observation!.amount:null,as_of:valid?observation!.effective_date:null,provisional:false}
  })
  const missing=points.every(p=>p.value===null),stale=market&&history?.status==='stale'
  return [a.id,{currency,kind:total?'total_value':'unit_price',method:market?'linear':'step',status:missing?'missing':stale?'stale':'ok',points,
   reasons:mismatch?['quote_currency_mismatch']:missing?[market?'missing_price_history':'missing_valuation_history']:points.some(p=>p.value===null)?['incomplete_history']:[]} satisfies HoldingTrend]
 }))
}
