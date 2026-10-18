import {afterEach,expect,it,vi} from 'vitest'
import {InvestmentMetricsReader,InvestmentMetricsRepository} from '../../../shared/investment-metrics-reader'
import {MarketReader} from '../../../shared/market-reader'
import type {MarketCache} from '../../../shared/market-cache'
import type {MetricAccount,MetricTrade} from '../../../shared/investment-metrics'
import type {PriceHistory,FxHistory} from '../../../shared/market-data'
import {missingQuote} from '../../../shared/market-data'
const now=Date.parse('2026-10-16T12:00:00Z')
const account=(id='holding'):MetricAccount=>({id,name:id,type:'investment',balance:2,currency:'SHARE',quote_currency:'USD',asset_type:'etf',symbol:'TEST',pricing_method:'market',holding_position:{quantity:2,activity_quantity:0,residual:0,history_status:'reconciled',coverage_reasons:[],anchor:{id:'opening',kind:'opening',balance:2,cost_amount:null,cost_currency:null,effective_date:'2026-10-15',trade_rowid_boundary:0,created_at:1}}})
const history:PriceHistory={symbol:'TEST',provider:'yahoo',category:'stock',currency:'USD',exchange:'TEST',timezone:'UTC',from:'2026-10-15',to:'2026-10-16',retrieved_at:new Date(now).toISOString(),status:'ok',reason:null,price_kind:'unadjusted',points:[{date:'2026-10-15',close:10,provider_close:10,period_start:'2026-10-15T00:00:00Z',provisional:false}],events:[],requires_event_review:false}
function reader(accounts:MetricAccount[],trades:MetricTrade[]=[]) {
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({result:'success',rates:{USD:1,HUF:370},time_last_update_utc:'Fri, 16 Oct 2026 12:00:00 GMT'})))
 const repo=new InvestmentMetricsRepository({} as D1Database)
 repo.read=vi.fn(async()=>({accounts,trades,revision:5}));repo.revision=vi.fn(async()=>5)
 const market=new MarketReader({scope:{}} as MarketCache)
 market.quotes=vi.fn(async()=>({TEST:{...missingQuote('TEST',now),currency:'USD',price:11,regularMarketPrice:11,status:'ok' as const,as_of:new Date(now).toISOString(),change:1,change_percent:10}}))
 market.history=vi.fn(async()=>history)
 market.fx=vi.fn(async(from,to,currencies)=>({provider:'frankfurter_ecb',source:'ECB statistics',base:'EUR',from,to,currencies,retrieved_at:new Date(now).toISOString(),status:'ok',reason:null,points:[{date:'2026-10-15',rates:{USD:2,HUF:720}},{date:'2026-10-16',rates:{USD:2,HUF:740}}]} as FxHistory))
 return {reader:new InvestmentMetricsReader(repo,market,()=>now),market,repo}
}
afterEach(()=>vi.unstubAllGlobals())
it('Market Today includes reporting FX movement and exposes omitted manual/stale holdings',async()=>{
 const a=account(),manual={...account('manual'),asset_type:'manual',pricing_method:'manual' as const,currency:'HUF',balance:900,manual_ownership:'owned' as const}
 const r=reader([a,manual]),result=await r.reader.read({currencies:['HUF'],date:'2026-10-16'})
 expect(result.by_currency.HUF.market_today).toMatchObject({gain:940,covered_holdings:1,total_holdings:2,excluded:[{account_id:'manual',reasons:expect.arrayContaining(['manual_pricing'])}]})
 expect(result.by_currency.HUF.holdings[0].price_change_percent).toBe(10)
 r.market.quotes=vi.fn(async()=>({TEST:{...missingQuote('TEST',now),currency:'USD',price:11,regularMarketPrice:11,status:'stale' as const,as_of:new Date(now).toISOString()}}))
 const stale=await r.reader.read({currencies:['HUF'],date:'2026-10-16'})
 expect(stale.by_currency.HUF.market_today).toMatchObject({gain:null,covered_holdings:0})
 expect(stale.by_currency.HUF.holdings[0].value).toBe(8140)
})
it('Market Today subtracts exact funding instead of calling a purchase profit',async()=>{
 const a=account();a.balance=3
 const t:MetricTrade={id:'today',account_id:a.id,type:'buy',quantity:1,price:11,total_amount:11,execution_currency:'USD',cash_amount:11,cash_currency:'USD',fee_amount:0,fee_status:'known',fee_currency:'USD',effective_order:1,date:'2026-10-16'}
 const r=reader([a],[t]),result=await r.reader.read({currencies:['HUF'],date:'2026-10-16'})
 expect(result.by_currency.HUF.market_today.gain).toBe(940)
})
it('does not reuse current FX for historic basis when dated FX is missing',async()=>{
 const a=account();a.holding_position!.anchor!.balance=0
 const t:MetricTrade={id:'buy',account_id:a.id,type:'buy',quantity:2,price:10,total_amount:20,execution_currency:'USD',cash_amount:20,cash_currency:'USD',fee_amount:0,fee_status:'known',fee_currency:'USD',effective_order:1,date:'2026-10-16'}
 const r=reader([a],[t]);r.market.fx=vi.fn(async()=>{throw new Error('Unavailable')})
 const result=await r.reader.read({currencies:['HUF','USD'],date:'2026-10-16'})
 expect(result.by_currency.HUF.holdings[0]).toMatchObject({value:8140,remaining_basis:null,net_invested:null,total_gain:null,native:{remaining_basis:20}})
 expect(result.by_currency.USD.holdings[0]).toMatchObject({value:22,remaining_basis:20,net_invested:20,total_gain:2})
})
it('rejects financial revision conflicts instead of publishing a mixed snapshot',async()=>{
 const r=reader([account()]);r.repo.revision=vi.fn(async()=>6)
 await expect(r.reader.read({currencies:['HUF']})).rejects.toThrow('records changed')
})
it('keeps API complete totals distinct from MCP partial totals, including all-missing coverage',async()=>{
 const a=account(),bad={...account('bad'),symbol:undefined,quote_currency:'XXX'}
 const r=reader([a,bad])
 const full=await r.reader.read({currencies:['HUF']});expect(full.by_currency.HUF.total_value).toBeNull()
 const partial=await r.reader.read({currencies:['HUF'],partial:true});expect(partial.by_currency.HUF.total_value).toBe(8140)
 expect(partial.by_currency.HUF.coverage).toMatchObject({holdings_total:2,value_covered:1,gain_covered:0})
 expect(partial.by_currency.HUF.total_gain).toBeNull()
})
