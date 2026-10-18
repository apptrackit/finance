import {expect,it} from 'vitest'
import {holdingTrends} from '../../../shared/investment-overview'
import type {MetricAccount} from '../../../shared/investment-metrics'
import type {ManualValuation} from '../../../shared/manual-valuation'
import type {PriceHistory} from '../../../shared/market-data'
const a=(id:string,extra:Partial<MetricAccount>={}):MetricAccount=>({id,name:id,type:'investment',balance:20,currency:'SHARE',quote_currency:'EUR',asset_type:'etf',pricing_method:'manual',...extra})
const v=(id:string,date:string,amount:number,kind:'total'|'per_unit'='per_unit'):ManualValuation=>({id:date,account_id:id,effective_date:date,amount,kind,currency:'EUR',source:'user',version:1,created_at:1,updated_at:1})
it('uses dated per-unit and total manual observations, preserving zero and pre-observation gaps',()=>{
 const out=holdingTrends([a('unit'),a('gold',{asset_type:'manual',currency:'EUR',balance:500})],[v('unit','2026-01-05',100),v('unit','2026-01-08',110),v('gold','2026-01-03',500,'total'),v('gold','2026-01-09',0,'total')],{},'2026-01-10')
 expect(out.unit.points).toHaveLength(30)
 expect(out.unit.points.find(p=>p.date==='2026-01-04')?.value).toBeNull()
 expect(out.unit.points.find(p=>p.date==='2026-01-07')).toMatchObject({value:100,as_of:'2026-01-05'})
 expect(out.unit.points.at(-1)?.value).toBe(110) // Not 20 units × price.
 expect(out.gold).toMatchObject({kind:'total_value',method:'step'})
 expect(out.gold.points.at(-1)?.value).toBe(0)
})
it('uses real raw daily prices, carries known weekends, and leaves unknown weekdays blank',()=>{
 const history:PriceHistory={exchange:null,retrieved_at:'2026-01-10T12:00:00Z',reason:null,price_kind:'unadjusted',requires_event_review:false,symbol:'TEST',currency:'EUR',timezone:'UTC',provider:'yahoo',category:'etf',from:'2025-12-01',to:'2026-01-06',status:'ok',points:[{date:'2026-01-02',close:100,provider_close:100,period_start:'2026-01-02T09:00:00Z',provisional:false}],events:[]}
 const out=holdingTrends([a('etf',{pricing_method:'market',symbol:'test'})],[],{TEST:history},'2026-01-06').etf
 expect(out.points.slice(-5).map(p=>p.value)).toEqual([100,100,100,null,null])
 expect(out.points.at(-3)?.as_of).toBe('2026-01-02')
 const mismatch=holdingTrends([a('other',{pricing_method:'market',symbol:'TEST',quote_currency:'USD'})],[],{TEST:history},'2026-01-06').other
 expect(mismatch.status).toBe('missing');expect(mismatch.points.every(p=>p.value===null)).toBe(true)
})
