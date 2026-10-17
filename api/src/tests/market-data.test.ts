import { describe,expect,it,vi } from 'vitest'
import { dailyPriceAt, datedFxAt, DAY, quoteFreshness, targetClosed } from '../../../shared/market-data'
import type { FxHistory, Quote } from '../../../shared/market-data'
import { MarketProvider, normalizeYahoo, providerJson } from '../../../shared/market-provider'
import { MarketReader } from '../../../shared/market-reader'
import type { CacheRow, MarketCache } from '../../../shared/market-cache'
import { yahooFixture } from '../../../tests/fixtures/market-data'
const now=Date.parse('2026-10-16T12:00:00Z')
class MemoryCache implements MarketCache {
  scope={}; rows=new Map<string,CacheRow<unknown>>()
  async get<T>(key:string){return this.rows.get(key) as CacheRow<T>||null}
  async put<T>(key:string,data:T,fetched:number,ttl:number,retention:number){this.rows.set(key,{data,fetched_at:fetched,expires_at:fetched+ttl,stale_until:fetched+retention})}
}
describe('normalized market observations',()=>{
  it.each([['VWCE.DE','EUR','ETF','etf'],['AAPL','USD','EQUITY','stock'],['BTC-USD','USD','CRYPTOCURRENCY','crypto'],['OTP.BD','HUF','EQUITY','stock']])('classifies %s and derives a real prior session close', (symbol,currency,type,category)=>{
    const {quote}=normalizeYahoo(yahooFixture(now,symbol,currency,type),symbol,'2026-10-01',now)
    expect(quote).toMatchObject({category,currency,price:110,previous_close:100,change:10,change_percent:10,status:'ok',session_date:'2026-10-16'})
    expect(quote.as_of).toBe('2026-10-16T11:59:50.000Z')
  })
  it('withholds weekend/stale moves while keeping the true last observation',()=>{
    const quote=normalizeYahoo(yahooFixture(now),'TEST','2026-10-01',now).quote
    expect(quoteFreshness(quote,now+DAY)).toMatchObject({status:'last_close',price:110,change_percent:null,as_of:quote.as_of})
    expect(quoteFreshness(quote,now+5*DAY)).toMatchObject({status:'stale',price:110,change_percent:null})
    const crypto=normalizeYahoo(yahooFixture(now,'BTC-USD','USD','CRYPTOCURRENCY'),'BTC-USD','2026-10-01',now).quote
    expect(quoteFreshness(crypto,now+21*60_000)).toMatchObject({status:'stale',change_percent:null})
  })
  it('converts minor quote units and reconstructs raw historical prices across splits',()=>{
    const data=yahooFixture(now,'TEST','GBp')
    Object.assign(data.chart.result[0].events,{splits:{s:{date:Math.floor(now/1000)-3600,numerator:2,denominator:1}}})
    const {quote,history}=normalizeYahoo(data,'TEST','2026-10-01',now)
    expect(quote).toMatchObject({currency:'GBP',price:1.1,previous_close:1,change_percent:expect.closeTo(10)})
    expect(history).toMatchObject({price_kind:'unadjusted',requires_event_review:true})
    expect(history.points.map(p=>p.close)).toEqual([1.8,2,1.1])
    expect(history.points[0].provider_close).toBe(0.9)
  })
  it('carries an equity close only across weekends, not missing weekdays or crypto sessions',()=>{
    const h=normalizeYahoo(yahooFixture(now),'TEST','2026-10-01',now).history
    h.to='2026-10-20';h.points=h.points.map(p=>({...p,provisional:false}))
    expect(dailyPriceAt(h,'2026-10-18')).toMatchObject({price:110,as_of:'2026-10-16'})
    expect(dailyPriceAt(h,'2026-10-19')).toMatchObject({price:null,reason:'missing_price'})
    expect(dailyPriceAt({...h,category:'crypto'},'2026-10-18').price).toBeNull()
    expect(dailyPriceAt(h,'2026-10-01').price).toBeNull()
  })
  it('does not turn an absent previous bar into a previous-session move',()=>{
    const data=yahooFixture(now)
    data.chart.result[0].indicators.quote[0].close[1]=null as unknown as number
    expect(normalizeYahoo(data,'TEST','2026-10-01',now).quote).toMatchObject({previous_close:null,change_percent:null})
    expect(normalizeYahoo(data,'TEST','2026-10-01',now).history.points).toHaveLength(2)
  })
  it.each([0,-1,NaN,Infinity])('rejects an invalid historical price %s',price=>{
    const data=yahooFixture(now);data.chart.result[0].indicators.quote[0].close[0]=price
    expect(()=>normalizeYahoo(data,'TEST','2026-10-01',now)).toThrow()
  })
  it('does not use a future/missing quote timestamp or an unsupported category',()=>{
    const data=yahooFixture(now);data.chart.result[0].meta.regularMarketTime=now/1000+3600
    expect(normalizeYahoo(data,'TEST','2026-10-01',now).quote.price).toBeNull()
    data.chart.result[0].meta.instrumentType='MUTUALFUND'
    expect(()=>normalizeYahoo(data,'TEST','2026-10-01',now)).toThrow(/Unsupported/)
    const tiny=yahooFixture(now);tiny.chart.result[0].indicators.quote[0].close[1]=Number.MIN_VALUE
    expect(normalizeYahoo(tiny,'TEST','2026-10-01',now).quote.change_percent).toBeNull()
    const minor=yahooFixture(now,'TEST','GBp');minor.chart.result[0].meta.regularMarketPrice=Number.MIN_VALUE
    expect(normalizeYahoo(minor,'TEST','2026-10-01',now).quote.price).toBeNull()
  })
})
describe('dated reference FX',()=>{
  const history:FxHistory={provider:'frankfurter_ecb',source:'ECB statistics',base:'EUR',from:'2026-10-09',to:'2026-10-13',currencies:['EUR','USD','HUF'],retrieved_at:new Date(now).toISOString(),status:'ok',reason:null,points:[{date:'2026-10-09',rates:{EUR:1,USD:2,HUF:400}}]}
  it('preserves direction and Friday source dates on weekends without bridging missing Monday',()=>{
    expect(datedFxAt(history,'2026-10-11','HUF')).toEqual({rate:400,as_of:'2026-10-09',reason:null})
    expect(datedFxAt(history,'2026-10-12','HUF')).toMatchObject({rate:null,reason:'missing_fx'})
    expect(datedFxAt(history,'2026-10-08','HUF').rate).toBeNull()
    expect(datedFxAt(history,'2026-10-11','JPY').rate).toBeNull()
    expect(datedFxAt(history,'2026-10-11','EUR').rate).toBe(1)
    expect(10/datedFxAt(history,'2026-10-11','USD').rate!*datedFxAt(history,'2026-10-11','HUF').rate!).toBe(2000)
  })
  it('knows TARGET Easter closures without skipping ordinary weekdays',()=>{
    expect(targetClosed('2026-04-03')).toBe(true);expect(targetClosed('2026-04-06')).toBe(true)
    expect(targetClosed('2026-04-07')).toBe(false)
  })
  it('rejects invalid/different-base FX observations',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json([{date:'2026-10-09',base:'USD',quote:'HUF',rate:400}]))
    await expect(new MarketProvider(fetcher).fx('2026-10-09','2026-10-11',['HUF'],now,new AbortController().signal)).rejects.toThrow(/Invalid dated/)
  })
})
describe('bounded provider reads and cache',()=>{
  it('deduplicates concurrent quotes and reuses their series for a detail/sparkline/history read',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json(yahooFixture(now)))
    const reader=new MarketReader(new MemoryCache(),new MarketProvider(fetcher),()=>now)
    const quotes=await Promise.all([reader.quote('TEST'),reader.quote('test')])
    expect(quotes[0]).toEqual(quotes[1]);expect(fetcher).toHaveBeenCalledTimes(1)
    expect((await reader.history('TEST','2026-10-01','2026-10-15')).points).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains a last valid quote with its timestamp and no Today move after transient failure',async()=>{
    let clock=now
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json(yahooFixture(now)))
    const reader=new MarketReader(new MemoryCache(),new MarketProvider(fetcher),()=>clock)
    const first=await reader.quote('TEST');clock+=6*60_000
    fetcher.mockRejectedValue(new Error('offline'))
    expect(await reader.quote('TEST')).toMatchObject({price:110,status:'stale',as_of:first.as_of,change_percent:null})
  })
  it('keeps valid current metadata independently of malformed historical bars',async()=>{
    const data=yahooFixture(now);data.chart.result[0].indicators.quote[0].close[0]=-1
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(data))
    const bundle=await new MarketProvider(fetcher).series('TEST','2026-10-01',now,new AbortController().signal)
    expect(bundle.quote).toMatchObject({price:110,previous_close:null,change_percent:null})
    expect(bundle.history).toMatchObject({status:'missing',reason:'invalid_history',points:[]})
  })
  it('limits symbol counts, ranges and intervals before requests',async()=>{
    const fetcher=vi.fn<typeof fetch>(),reader=new MarketReader(new MemoryCache(),new MarketProvider(fetcher),()=>now)
    await expect(reader.quotes(Array(51).fill('TEST'))).rejects.toThrow(/50/)
    await expect(reader.quote('../bad')).rejects.toThrow(/Invalid/)
    await expect(reader.history('TEST','1900-01-01','2026-10-01')).rejects.toThrow()
    await expect(reader.fx('2026-02-30','2026-10-01',['EUR'])).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('bounds retries and refuses oversized bodies',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('',{status:429}))
    await expect(providerJson('https://provider.test',new AbortController().signal,fetcher)).rejects.toMatchObject({kind:'rate_limited'})
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockClear().mockImplementation(async()=>new Response('',{status:429,headers:{'Retry-After':'60'}}))
    await expect(providerJson('https://provider.test',new AbortController().signal,fetcher)).rejects.toMatchObject({kind:'rate_limited'})
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockImplementation(async()=>new Response('x'.repeat(1_048_577)))
    await expect(providerJson('https://provider.test',new AbortController().signal,fetcher)).rejects.toThrow(/limit/)
  })
  it('cancels only the caller, and stops a shared provider read when its last subscriber cancels',async()=>{
    let providerSignal:AbortSignal|undefined
    let finish:(r:Response)=>void=()=>{}
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async(_url,options)=>{
      providerSignal=options!.signal as AbortSignal
      return new Promise(resolve=>{finish=resolve})
    })
    const reader=new MarketReader(new MemoryCache(),new MarketProvider(fetcher),()=>now)
    const one=new AbortController(),two=new AbortController()
    const a=reader.quote('TEST',one.signal),b=reader.quote('TEST',two.signal)
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
    one.abort();await expect(a).rejects.toThrow();expect(providerSignal!.aborted).toBe(false)
    two.abort();await expect(b).rejects.toThrow();expect(providerSignal!.aborted).toBe(true)
    finish(Response.json(yahooFixture(now)))
  })
})
