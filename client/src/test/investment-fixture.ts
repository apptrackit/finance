import {holdingMetrics,portfolioMetrics} from '../../../shared/investment-metrics'
import type {MetricAccount,MetricTrade,InvestmentMetricsSnapshot} from '../../../shared/investment-metrics'
import {missingQuote} from '../../../shared/market-data'
import {convertCurrency} from '../../../shared/currency'
export const syntheticHolding:MetricAccount={id:'holding',name:'Synthetic holding',type:'investment',balance:0.1,currency:'SHARE',quote_currency:'USD',asset_type:'stock',symbol:'TEST'}
export const syntheticBuy:MetricTrade={id:'buy',account_id:'holding',type:'buy',quantity:0.1234567,price:100,total_amount:12.34567,date:'2026-10-01'}
export const syntheticSell:MetricTrade={...syntheticBuy,id:'sell',type:'sell',quantity:0.0234567,total_amount:2.34567}
export function investmentFixture(accounts=[syntheticHolding],trades=[syntheticBuy,syntheticSell],missing=false):InvestmentMetricsSnapshot {
 const quote={...missingQuote('TEST',Date.now()),regularMarketPrice:missing?null:150,price:missing?null:150,currency:'USD'}
 const rates=missing?{}:{USD:1,HUF:400,EUR:0.8}
 const currencies=['HUF','USD','EUR']
 const today={gain:null,estimated_return_percent:null,currency:'HUF',date:'2026-10-17',prior_date:'2026-10-16',covered_holdings:0,total_holdings:accounts.length,excluded:[],method:'daily estimate',boundary:'prior close'}
 return {as_of:'2026-10-17T12:00:00Z',date:'2026-10-17',source_revision:1,scope:'investments',accounts,trades,quotes:{TEST:quote},current_fx:{base:'USD',as_of:null,rates},by_currency:Object.fromEntries(currencies.map(c=>{
  const holdings=accounts.map(a=>holdingMetrics(a,trades.filter(t=>t.account_id===a.id),c,quote,(n,s,t)=>convertCurrency(n,s,t,rates,'USD').value,(n,s,t)=>s===t?n:null,'2026-10-17'))
  return [c,{...portfolioMetrics(holdings),holdings,currency:c,market_today:{...today,currency:c}}]
 }))}
}

export function historyFixture(query=new URLSearchParams()) {
 const currency=query.get('currency')??'HUF',range=query.get('range')??'1m',to=query.get('to')??'2026-10-17'
 const p={date:to,value:currency==='HUF'?6000:15,net_invested:currency==='HUF'?4000:10,contribution:0,withdrawal:0,provisional:true,event:false,coverage:'complete',price_as_of_oldest:to,price_as_of_latest:to,fx_as_of_oldest:to,fx_as_of_latest:to}
 return {as_of:'2026-10-17T12:00:00Z',source_revision:Number(query.get('expected_revision')??1),currency,timezone:query.get('timezone')??'UTC',range,from:'2026-10-01',to,prior_date:'2026-09-30',scope:'all_investment_holdings_including_archived',points:[{...p,date:'2026-10-01',value:4000},p],opening:{...p,date:'2026-09-30',value:0},summary:{gain:2000,estimated_return_percent:50,start_value:0,end_value:p.value,contribution:4000,withdrawal:0,coverage_start:'2026-09-30',status:'complete',reasons:[]},coverage_ranges:[],holdings:[],sampling:{daily_points:17,returned_points:2,max_points:600,method:'events and extrema'},sources:[],method:{return_label:'Estimated return',flow_timing:'Daily gross flows',price_timing:'Conservative source day close',fx_timing:'Dated ECB',current_endpoint:'Provisional current quotes'}}
}
