import {afterEach,expect,it,vi} from 'vitest'
import {InvestmentHistoryService} from '../services/investment-history.service'
import type {InvestmentHistoryRepository} from '../repositories/investment-history.repository'
import type {MarketReader} from '../../../shared/market-reader'
import {missingQuote} from '../../../shared/market-data'
import type {HistoryAnchor} from '../../../shared/investment-history'
import type {MetricAccount} from '../../../shared/investment-metrics'
const now=Date.parse('2026-01-10T18:00:00Z')
const account=(id:string):MetricAccount=>({id,name:id,type:'investment',currency:'SHARE',quote_currency:'HUF',balance:0,asset_type:'stock',symbol:id,pricing_method:'market'})
function setup(count=12) {
 const accounts=Array.from({length:count},(_,i)=>account(`TEST${i}`))
 const facts={revision:10,accounts,anchors:accounts.map(a=>({id:a.id,account_id:a.id,kind:'opening',balance:0,effective_date:'2026-01-01',trade_rowid_boundary:0,record_order:1,created_at:1,cost_amount:null,cost_currency:null} satisfies HistoryAnchor)),trades:[],valuations:[]}
 const repo={read:vi.fn(async()=>facts),revision:vi.fn(async()=>10)}
 let active=0,maximum=0
 const market={history:vi.fn(async(symbol:string,from:string,to:string)=>{
  active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));active--
  return {symbol,from,to,timezone:'UTC',category:'stock',currency:'HUF',provider:'yahoo',retrieved_at:'2026-01-10T18:00:00Z',status:'ok',points:[],events:[]}
 }),quotes:vi.fn(async(symbols:string[])=>Object.fromEntries(symbols.map(s=>[s,missingQuote(s,now)]))),fx:vi.fn()}
 const service=new InvestmentHistoryService(repo as unknown as InvestmentHistoryRepository,market as unknown as MarketReader,()=>now)
 const request={from:'2026-01-02',to:'2026-01-06',currency:'HUF',timezone:'UTC',maxPoints:600,signal:new AbortController().signal}
 return {service,repo,market,request,facts,maximum:()=>maximum}
}
afterEach(()=>vi.unstubAllGlobals())
it('fetches one whole window per unique symbol, four at once, not per holding per date',async()=>{
 const {service,market,request,maximum,facts}=setup()
 facts.accounts.push({...facts.accounts[0],id:'duplicate'})
 const result=await service.read(request)
 expect(market.history).toHaveBeenCalledTimes(12);expect(market.quotes).toHaveBeenCalledTimes(1);expect(market.fx).not.toHaveBeenCalled()
 expect(maximum()).toBe(4);expect(result.source_revision).toBe(10)
})
it('checks the expected and final financial revision instead of publishing mixed facts',async()=>{
 const {service,repo,market,request}=setup(0)
 await expect(service.read({...request,expectedRevision:9})).rejects.toMatchObject({code:'INVESTMENT_HISTORY_CONFLICT',statusCode:409})
 expect(market.history).not.toHaveBeenCalled()
 repo.revision.mockResolvedValue(11)
 await expect(service.read(request)).rejects.toMatchObject({code:'INVESTMENT_HISTORY_CONFLICT'})
})
it('stops a cancelled request before any database or source reads',async()=>{
 const {service,repo,market,request}=setup()
 const c=new AbortController();c.abort()
 await expect(service.read({...request,signal:c.signal})).rejects.toMatchObject({name:'AbortError'})
 expect(repo.read).not.toHaveBeenCalled();expect(market.history).not.toHaveBeenCalled()
})
it('bounds FX reads to annual windows and never substitutes current FX into past history',async()=>{
 const {service,market,request,facts}=setup(1)
 facts.accounts[0].quote_currency='USD'
 market.fx.mockImplementation(async(from:string,to:string,currencies:string[])=>({from,to,currencies,base:'EUR',provider:'frankfurter_ecb',status:'missing',points:[]}))
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 const result=await service.read({...request,from:'2025-12-30'})
 expect(market.fx).toHaveBeenCalledTimes(2);expect(fetcher).not.toHaveBeenCalled()
 expect(result.points.at(-1)?.value).toBe(0)
})

it('bounds aggregate daily work before fetching sources',async()=>{
 const {service,market,request}=setup(100)
 await expect(service.read({...request,from:'2020-01-01'})).rejects.toMatchObject({code:'INVESTMENT_HISTORY_LIMIT'})
 expect(market.history).not.toHaveBeenCalled()
})

it('requests the provider quote currency for a legacy holding with missing quote metadata',async()=>{
 const {service,market,request,facts}=setup(1)
 facts.accounts[0].quote_currency=null;facts.accounts[0].symbol='test0'
 market.fx.mockImplementation(async(from:string,to:string,currencies:string[])=>({from,to,currencies,base:'EUR',provider:'frankfurter_ecb',status:'missing',points:[]}))
 await service.read({...request,currency:'USD'})
 expect(market.fx.mock.calls[0][2]).toEqual(expect.arrayContaining(['HUF','USD']))
})

it('reads corporate-action coverage back to the supported anchor, not just the selected price range',async()=>{
 const {service,market,request,facts}=setup(1)
 facts.anchors[0].effective_date='2025-02-01'
 await service.read(request)
 expect(market.history.mock.calls[0][1]).toBe('2025-02-01')
})
