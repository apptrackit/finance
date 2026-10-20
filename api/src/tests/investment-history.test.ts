import {describe,expect,it} from 'vitest'
import {calculatePortfolioHistory,downsampleHistory} from '../../../shared/investment-history'
import type {HistoryInputs,HistoryAnchor} from '../../../shared/investment-history'
import type {MetricAccount,MetricTrade} from '../../../shared/investment-metrics'
import type {ManualValuation} from '../../../shared/manual-valuation'
import {addDays,dayCutoff,rangeStart,subtractMonths} from '../../../shared/investment-history-dates'
import {missingQuote} from '../../../shared/market-data'
const account=(id:string,balance:number,extra:Partial<MetricAccount>={}):MetricAccount=>({id,name:id,type:'investment',balance,currency:'SHARE',quote_currency:'HUF',pricing_method:'manual',asset_type:'etf',...extra})
const anchor=(id:string,extra:Partial<HistoryAnchor>={}):HistoryAnchor=>({id:`open:${id}`,account_id:id,kind:'opening',effective_date:'2026-01-01',balance:0,cost_amount:null,cost_currency:null,owned:false,trade_rowid_boundary:0,record_order:1,created_at:1,...extra})
const trade=(id:string,day:number,type:'buy'|'sell',q:number,p:number,cash=q*p):MetricTrade=>({id:`${id}:${day}:${type}`,account_id:id,type,quantity:q,price:p,total_amount:q*p,cash_amount:cash,cash_currency:'HUF',execution_currency:'HUF',fee_status:'known',fee_amount:Math.abs(cash-q*p),fee_currency:'HUF',effective_order:day,date:`2026-01-${String(day).padStart(2,'0')}`})
const value=(id:string,day:number,amount:number,kind:'total'|'per_unit'='per_unit'):ManualValuation=>({id:`v:${id}:${day}`,account_id:id,effective_date:`2026-01-${String(day).padStart(2,'0')}`,amount,kind,currency:'HUF',source:'user',version:1,created_at:1,updated_at:1})
const base=(extra:Partial<HistoryInputs>={}):HistoryInputs=>({accounts:[],trades:[],anchors:[],valuations:[],prices:{},quotes:{},fx:[],current_rates:{},from:'2026-01-02',to:'2026-01-06',currency:'HUF',timezone:'UTC',today:'2026-01-10',as_of:Date.parse('2026-01-10T18:00:00Z'),...extra})
describe('historical portfolio reconstruction',()=>{
 it('matches worked multi-asset daily values, sales/reentry, archived history and manual revaluation',()=>{
  const input=base({accounts:[account('etf',1),account('gold',150,{asset_type:'manual',currency:'HUF',manual_ownership:'owned'}),account('archived',0,{archived_at:1})],
   anchors:[anchor('etf'),anchor('gold'),anchor('archived')],
   trades:[trade('etf',2,'buy',10,100,1010),trade('etf',3,'sell',4,120,476),trade('etf',4,'buy',2,90,182),trade('etf',5,'sell',8,110),trade('etf',6,'buy',1,50),
    {...trade('gold',3,'buy',1,100),asset_event:'acquisition'},trade('archived',2,'buy',2,10),trade('archived',4,'sell',2,15)],
   valuations:[value('etf',1,100),value('etf',3,110),value('etf',6,50),value('gold',3,100,'total'),value('gold',4,150,'total'),value('archived',1,10),value('archived',4,15)]})
  const out=calculatePortfolioHistory(input)
  expect(out.points.map(p=>[p.date,p.value,p.net_invested])).toEqual([
   ['2026-01-01',0,0],['2026-01-02',1020,1030],['2026-01-03',780,654],['2026-01-04',1030,806],['2026-01-05',150,-74],['2026-01-06',200,-24],
  ])
  expect(out.summary).toMatchObject({gain:224,contribution:1362,withdrawal:1386,status:'complete'})
  expect(out.summary.estimated_return_percent).toBeCloseTo(((1020/1030)*(1256/1120)*(1060/962)-1)*100,9)
  expect(out.holdings.find(h=>h.account_id==='archived')?.summary.gain).toBe(10)
  expect(out.points[3].contribution).toBe(182) // Gold appraisal adds no cash.
 })
 it('keeps known imported values independent of unknown lifetime cash or cost',()=>{
  const input=base({accounts:[account('import',3)],anchors:[anchor('import',{balance:3,cost_amount:90,cost_currency:'HUF'})],valuations:[value('import',1,40),value('import',6,45)]})
  const out=calculatePortfolioHistory(input)
  expect(out.points.map(p=>p.value)).toEqual([120,120,120,120,120,135])
  expect(out.points.every(p=>p.net_invested===null)).toBe(true)
  expect(out.summary).toMatchObject({gain:15,estimated_return_percent:12.5})
 })
 it('does not project observed units or a later appraisal backward',()=>{
  const input=base({accounts:[account('legacy',5)],anchors:[anchor('legacy',{kind:'observed',effective_date:'2026-01-04',balance:5,trade_order_boundary:10})],valuations:[value('legacy',5,20)]})
  const out=calculatePortfolioHistory(input)
  expect(out.points.map(p=>p.value)).toEqual([null,null,null,null,100,100])
  expect(out.summary.gain).toBeNull();expect(out.summary.estimated_return_percent).toBeNull()
 })
 it('treats a correction as a noncash boundary, not profit or an invented deposit',()=>{
  const input=base({accounts:[account('corrected',4)],anchors:[anchor('corrected'),anchor('corrected',{id:'correction',kind:'correction',effective_date:'2026-01-04',balance:4,record_order:2,trade_order_boundary:2})],
   trades:[trade('corrected',2,'buy',2,10)],valuations:[value('corrected',1,10)]})
  const out=calculatePortfolioHistory(input)
  expect(out.points[3]).toMatchObject({value:40,net_invested:20,contribution:0})
  expect(out.summary.gain).toBeNull();expect(out.summary.estimated_return_percent).toBeNull()
  expect(calculatePortfolioHistory({...input,from:'2026-01-05'}).summary).toMatchObject({gain:0,estimated_return_percent:0})
 })
 it('a newer backdated opening supersedes obsolete observed/opening versions',()=>{
  const input=base({accounts:[account('reconciled',2)],anchors:[anchor('reconciled',{kind:'observed',effective_date:'2026-01-04',balance:99}),anchor('reconciled',{id:'confirmed',record_order:2})],
   trades:[trade('reconciled',2,'buy',2,10)],valuations:[value('reconciled',1,10)]})
  expect(calculatePortfolioHistory(input).points.map(p=>p.value)).toEqual([0,20,20,20,20,20])
 })
 it('preserves same-day gross funding and withdrawals for a complete round trip',()=>{
  const input=base({accounts:[account('round',0)],anchors:[anchor('round')],trades:[trade('round',2,'buy',1,100),{...trade('round',2,'sell',1,110),effective_order:3}],valuations:[]})
  const out=calculatePortfolioHistory(input)
  expect(out.summary).toMatchObject({gain:10,contribution:100,withdrawal:110})
  expect(out.summary.estimated_return_percent).toBeCloseTo(10)
 })
 it('uses owned-date quantities and dated FX, with weekend carry and a visible missing weekday',()=>{
  const t={...trade('stock',2,'buy',1,10),cash_currency:'USD'}
  const input=base({accounts:[account('stock',1,{pricing_method:'market',symbol:'TEST',quote_currency:'USD'})],anchors:[anchor('stock')],trades:[t],
   quotes:{TEST:{...missingQuote('TEST',0),session_end:'2026-01-09T16:00:00Z',currency:'USD'}},
   prices:{TEST:{symbol:'TEST',provider:'yahoo',category:'stock',currency:'USD',exchange:'TEST',timezone:'UTC',from:'2026-01-01',to:'2026-01-06',retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,price_kind:'unadjusted',events:[],requires_event_review:false,
    points:[{date:'2026-01-02',period_start:'2026-01-02T09:00:00Z',close:10,provider_close:10,provisional:false},{date:'2026-01-05',period_start:'2026-01-05T09:00:00Z',close:11,provider_close:11,provisional:false},{date:'2026-01-06',period_start:'2026-01-06T09:00:00Z',close:12,provider_close:12,provisional:false}]}},
   fx:[{provider:'frankfurter_ecb',source:'ECB statistics',base:'EUR',from:'2026-01-01',to:'2026-01-06',currencies:['USD','HUF'],retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,points:[{date:'2026-01-02',rates:{USD:2,HUF:720}},{date:'2026-01-06',rates:{USD:2,HUF:740}}]}]})
  const out=calculatePortfolioHistory(input)
  expect(out.points.map(p=>p.value)).toEqual([0,3600,3600,3600,null,4440])
  expect(out.holdings[0].points[3].price_as_of).toBe('2026-01-02')
  expect(out.points.at(-1)?.net_invested).toBe(3600)
  expect(out.summary).toMatchObject({gain:840,estimated_return_percent:null})
 })
 it('does not use a crypto daily close after the reporting cutoff',()=>{
  const input=base({from:'2026-01-04',to:'2026-01-04',timezone:'Europe/Budapest',currency:'USD',accounts:[account('coin',1,{asset_type:'crypto',pricing_method:'market',symbol:'COIN',quote_currency:'USD'})],anchors:[anchor('coin',{balance:1})],
   prices:{COIN:{symbol:'COIN',provider:'yahoo',category:'crypto',currency:'USD',exchange:null,timezone:'UTC',from:'2026-01-01',to:'2026-01-04',retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,price_kind:'unadjusted',events:[],requires_event_review:false,
    points:[2,3,4].map(day=>({date:`2026-01-0${day}`,period_start:`2026-01-0${day}T00:00:00Z`,close:day*10,provider_close:day*10,provisional:false}))}}})
  const out=calculatePortfolioHistory(input)
  expect(out.points.map(p=>p.value)).toEqual([20,30]) // Jan 4 close occurs Jan 5 01:00 Budapest.
 })
 it('does not convert a future ECB publication at a historical reporting cutoff',()=>{
  const input=base({from:'2026-01-05',to:'2026-01-05',timezone:'Pacific/Auckland',accounts:[account('manual',100,{asset_type:'manual',currency:'EUR'})],anchors:[anchor('manual',{balance:100,owned:true})],valuations:[{...value('manual',1,100,'total'),currency:'EUR'}],
   fx:[{provider:'frankfurter_ecb',source:'ECB statistics',base:'EUR',from:'2026-01-01',to:'2026-01-05',currencies:['HUF'],retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,points:[{date:'2026-01-02',rates:{HUF:400}},{date:'2026-01-05',rates:{HUF:410}}]}]})
  const out=calculatePortfolioHistory(input)
  expect(out.points[0].value).toBe(40000);expect(out.points[1].value).toBeNull()
  expect(out.points[1].issues[0].reasons).toContain('fx_after_cutoff')
 })
 it('uses the observed current mirror/quote/current FX for a provisional endpoint',()=>{
  const input=base({today:'2026-01-06',as_of:Date.parse('2026-01-06T12:00:00Z'),accounts:[account('stock',2,{pricing_method:'market',symbol:'TEST',quote_currency:'USD'})],anchors:[anchor('stock',{kind:'observed',balance:2,effective_date:'2026-01-06'})],
   current_rates:{USD:1,HUF:370},current_fx_as_of:'2026-01-06T00:00:00Z',quotes:{TEST:{...missingQuote('TEST',0),price:11,regularMarketPrice:11,currency:'USD',as_of:'2026-01-06T11:59:00Z',status:'ok'}}})
  const p=calculatePortfolioHistory(input).points.at(-1)!
  expect(p).toMatchObject({value:8140,provisional:true});expect(calculatePortfolioHistory(input).holdings[0].points.at(-1)?.fx_as_of).toBe('2026-01-06T00:00:00Z');expect(calculatePortfolioHistory(input).summary.estimated_return_percent).toBeNull()
 })
 it('never uses a current quote observed after the common cutoff',()=>{
  const input=base({today:'2026-01-06',as_of:Date.parse('2026-01-06T12:00:00Z'),accounts:[account('future',1,{pricing_method:'market',symbol:'TEST',quote_currency:'HUF'})],anchors:[anchor('future',{balance:1})],
   quotes:{TEST:{...missingQuote('TEST',0),price:100,regularMarketPrice:100,currency:'HUF',as_of:'2026-01-06T12:01:00Z',status:'ok'}}})
  expect(calculatePortfolioHistory(input).points.at(-1)?.value).toBeNull()
 })
 it('keeps value independent of unsupported corporate-action performance',()=>{
  // A split makes historical units unknown. The current mirror is still an
  // independently observed position; it cannot repair earlier dates silently.
  const input=base({accounts:[account('stock',2,{pricing_method:'market',symbol:'TEST',quote_currency:'USD'})],anchors:[anchor('stock',{balance:1})],
   prices:{TEST:{symbol:'TEST',provider:'yahoo',category:'stock',currency:'USD',timezone:'UTC',exchange:null,from:'2026-01-01',to:'2026-01-06',retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,price_kind:'unadjusted',events:[{date:'2026-01-05',type:'split',ratio:2}],requires_event_review:true,points:[]}}})
  expect(calculatePortfolioHistory(input).points.at(-1)?.performance_issues[0].reasons).toContain('unsupported_event')
 })
 it('preserves a valid zero return factor after a total loss',()=>{
  const input=base({accounts:[account('loss',1)],anchors:[anchor('loss',{balance:1})],valuations:[value('loss',1,100),value('loss',3,0)]})
  expect(calculatePortfolioHistory(input).summary).toMatchObject({gain:-100,estimated_return_percent:-100,status:'complete'})
 })
 it('does not lose a split when the final units are sold on its date',()=>{
  const input=base({accounts:[account('sold',0,{pricing_method:'market',symbol:'TEST',quote_currency:'HUF'})],anchors:[anchor('sold')],trades:[trade('sold',2,'buy',1,100),trade('sold',5,'sell',1,120)],
   prices:{TEST:{symbol:'TEST',provider:'yahoo',category:'stock',currency:'HUF',timezone:'UTC',exchange:null,from:'2026-01-01',to:'2026-01-06',retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,price_kind:'unadjusted',events:[{date:'2026-01-05',type:'split',ratio:2}],requires_event_review:true,points:[]}}})
  const out=calculatePortfolioHistory(input)
  expect(out.points.find(p=>p.date==='2026-01-05')?.performance_issues[0].reasons).toContain('unsupported_event')
  expect(out.summary.gain).toBeNull()
 })
 it('keeps pre-range splits and uncovered pre-horizon ownership from becoming verified historical units',()=>{
  const input=base({from:'2026-01-05',accounts:[account('split',1,{pricing_method:'market',symbol:'TEST',quote_currency:'HUF'})],anchors:[anchor('split',{balance:1})],
   prices:{TEST:{symbol:'TEST',provider:'yahoo',category:'stock',currency:'HUF',timezone:'UTC',exchange:null,from:'2026-01-01',to:'2026-01-06',retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,price_kind:'unadjusted',events:[{date:'2026-01-02',type:'split',ratio:2}],requires_event_review:true,points:[4,5,6].map(day=>({date:`2026-01-0${day}`,period_start:`2026-01-0${day}T09:00:00Z`,close:100,provider_close:100,provisional:false}))}}})
  expect(calculatePortfolioHistory(input).points.every(p=>p.value===null)).toBe(true)
  input.prices.TEST.events=[];input.prices.TEST.from='2026-01-04'
  expect(calculatePortfolioHistory(input).points.every(p=>p.value===null)).toBe(true)
  // A later independent close-of-day observation can establish new units.
  input.anchors.push(anchor('split',{id:'reconciled',kind:'correction',effective_date:'2026-01-04',balance:1,record_order:2}))
  expect(calculatePortfolioHistory(input).summary).toMatchObject({gain:0,estimated_return_percent:0})
 })
 it('all-empty dates have zero amounts and no fictitious return percentage',()=>{
  expect(calculatePortfolioHistory(base()).summary).toMatchObject({gain:0,estimated_return_percent:null,status:'complete',reasons:['inactive_range']})
 })
})
describe('calendar ranges and bounded sampling',()=>{
 it('uses clamped calendar months, leap years and YTD',()=>{
  expect(subtractMonths('2024-03-31',1)).toBe('2024-02-29');expect(subtractMonths('2025-03-31',1)).toBe('2025-02-28')
  expect(rangeStart('3m','2026-05-31','2020-01-01')).toBe('2026-02-28');expect(rangeStart('ytd','2026-06-01','2020-01-01')).toBe('2026-01-01')
  expect(dayCutoff('2026-03-29','Europe/Budapest')-dayCutoff('2026-03-28','Europe/Budapest')).toBe(23*3600000)
  expect(dayCutoff('2026-10-25','Europe/Budapest')-dayCutoff('2026-10-24','Europe/Budapest')).toBe(25*3600000)
  expect(dayCutoff('2018-11-03','America/Sao_Paulo')).toBe(Date.parse('2018-11-04T03:00:00Z')-1)
  expect(dayCutoff('2018-11-04','America/Sao_Paulo')-dayCutoff('2018-11-03','America/Sao_Paulo')).toBe(23*3600000)
 })
 it('retains cash events, isolated extrema, gap transitions and their neighbors',()=>{
  const points=Array.from({length:500},(_,i)=>({date:addDays('2025-01-01',i),value:i>=190&&i<=200?null:i===120?99999:i,net_invested:i,contribution:0,withdrawal:0,provisional:false,event:i===85,issues:[],performance_issues:[]}))
  const out=downsampleHistory(points,100),dates=out.map(p=>p.date)
  for(const i of [0,84,85,86,120,189,190,191,200,201,202,499])expect(dates).toContain(points[i].date)
  expect(out.length).toBeLessThanOrEqual(100)
  expect(()=>downsampleHistory(points.map(p=>({...p,event:true})),100)).toThrow('Material history events')
 })
})

// Dividend dates are source events, not inferred income or reinvested units.
it.each(['2026-01-03','2026-01-05'])('excludes dividends on %s without losing price returns, even before the selected range',date=>{
 const input=base({accounts:[account('stock',0,{pricing_method:'market',symbol:'TEST',quote_currency:'HUF'})],anchors:[anchor('stock')],trades:[trade('stock',2,'buy',1,100),trade('stock',5,'sell',1,120)],
  prices:{TEST:{symbol:'TEST',provider:'yahoo',category:'stock',currency:'HUF',timezone:'UTC',exchange:null,from:'2026-01-01',to:'2026-01-06',retrieved_at:'2026-01-10T10:00:00Z',status:'ok',reason:null,price_kind:'unadjusted',events:[],requires_event_review:false,points:[1,2,3,4,5,6].map(day=>({date:`2026-01-0${day}`,period_start:`2026-01-0${day}T09:00:00Z`,close:day<5?100:120,provider_close:day<5?100:120,provisional:false}))}}})
 for(const from of ['2026-01-02','2026-01-04']) {
  input.from=from;input.prices.TEST.events=[]
  const before=calculatePortfolioHistory(input)
  input.prices.TEST.events=[{date,type:'dividend'}];input.prices.TEST.requires_event_review=true
  const saved=JSON.stringify(input),after=calculatePortfolioHistory(input)
  expect(after.summary).toEqual(before.summary)
  expect(after.summary).toMatchObject({gain:20,status:'complete'});expect(after.summary.estimated_return_percent).toBeCloseTo(20)
  expect(after.points.map(p=>[p.value,p.net_invested,p.contribution,p.withdrawal])).toEqual(before.points.map(p=>[p.value,p.net_invested,p.contribution,p.withdrawal]))
  expect(after.points.every(p=>!p.performance_issues.length)).toBe(true)
  expect(JSON.stringify(input)).toBe(saved)
 }
})
