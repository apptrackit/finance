import {holdingMetrics,portfolioMetrics} from '../../../shared/investment-metrics'
import type {MetricAccount,MetricTrade,InvestmentMetricsSnapshot} from '../../../shared/investment-metrics'
import {missingQuote} from '../../../shared/market-data'
import {convertCurrency} from '../../../shared/currency'
export const syntheticHolding:MetricAccount={id:'holding',name:'Synthetic holding',type:'investment',balance:0.1,currency:'SHARE',quote_currency:'USD',asset_type:'stock',symbol:'TEST'}
export const syntheticBuy:MetricTrade={id:'buy',account_id:'holding',type:'buy',quantity:0.1234567,price:100,total_amount:12.34567,date:'2026-10-01'}
export const syntheticSell:MetricTrade={...syntheticBuy,id:'sell',type:'sell',quantity:0.0234567,total_amount:2.34567}
export function investmentFixture(accounts=[syntheticHolding],trades=[syntheticBuy,syntheticSell],missing=false):InvestmentMetricsSnapshot {
 const quote={...missingQuote('TEST',Date.now()),regularMarketPrice:missing?null:150,price:missing?null:150,currency:'USD'}
 const rates=missing?{}:{USD:1,HUF:400}
 const currencies=['HUF','USD']
 const today={gain:null,estimated_return_percent:null,currency:'HUF',date:'2026-10-17',prior_date:'2026-10-16',covered_holdings:0,total_holdings:accounts.length,excluded:[],method:'daily estimate',boundary:'prior close'}
 return {as_of:'2026-10-17T12:00:00Z',date:'2026-10-17',source_revision:1,scope:'investments',accounts,trades,quotes:{TEST:quote},current_fx:{base:'USD',as_of:null,rates},by_currency:Object.fromEntries(currencies.map(c=>{
  const holdings=accounts.map(a=>holdingMetrics(a,trades.filter(t=>t.account_id===a.id),c,quote,(n,s,t)=>convertCurrency(n,s,t,rates,'USD').value,(n,s,t)=>s===t?n:null,'2026-10-17'))
  return [c,{...portfolioMetrics(holdings),holdings,currency:c,market_today:{...today,currency:c}}]
 }))}
}
