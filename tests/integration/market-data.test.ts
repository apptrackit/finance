import { beforeEach,expect,it,vi } from 'vitest'
import { D1MarketCache } from '../../shared/market-cache'
import { datedFxAt } from '../../shared/market-data'
import type { FxHistory,Quote } from '../../shared/market-data'
import { EXPORT_TABLES,isDataExport } from '../../shared/data-export'
import { yahooFixture } from '../fixtures/market-data'
import { migrate,useFinanceWorkers } from './harness'
const f=useFinanceWorkers({migrateBeforeEach:false})
let calls:string[]=[]
let failure=false
beforeEach(async()=>{
  calls=[];failure=false
  const base=vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation(async(input,options)=>{
    const url=String(input)
    if(url.startsWith('https://query1.finance.yahoo.com/')){
      calls.push(url)
      if(failure) return new Response('',{status:503})
      const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1)!)
      return Response.json(yahooFixture(Date.now(),symbol))
    }
    if(url.startsWith('https://query2.finance.yahoo.com/')){
      calls.push(url)
      return Response.json({quotes:[{symbol:'TEST.DE',quoteType:'ETF',shortname:'Synthetic ETF',exchange:'GER'},{symbol:'FUND',quoteType:'MUTUALFUND'}]})
    }
    if(url.startsWith('https://api.frankfurter.dev/')){
      calls.push(url)
      return Response.json([{date:'2026-01-09',base:'EUR',quote:'USD',rate:2},{date:'2026-01-09',base:'EUR',quote:'HUF',rate:400}])
    }
    return base(input,options)
  })
})
it('upgrades 020 additively; cache writes/pruning change no financial rows or revision and are explicitly excluded from export',async()=>{
  await migrate(f.db,20);await f.seed()
  const before=[]
  for(const table of EXPORT_TABLES) before.push({table,rows:(await f.db.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all()).results})
  await migrate(f.db)
  for(const item of before) expect((await f.db.prepare(`SELECT rowid,* FROM ${item.table} ORDER BY rowid`).all()).results,item.table).toEqual(item.rows)
  const cache=new D1MarketCache(f.db)
  for(let i=0;i<260;i++) await cache.put(`synthetic:${i}`,{i},Date.now()+i,86400000,2*86400000)
  expect(await f.db.prepare('SELECT count(*) AS n FROM market_data_cache').first('n')).toBe(256)
  for(const item of before) expect((await f.db.prepare(`SELECT rowid,* FROM ${item.table} ORDER BY rowid`).all()).results,item.table).toEqual(item.rows)
  const dump=await (await f.request('/export')).json()
  expect(isDataExport(dump)).toBe(true)
  expect(dump).toMatchObject({schemaVersion:'021-market-data-cache',manifest:{excluded:{market_data_cache:expect.any(String)}}})
  expect(dump).not.toHaveProperty('data.market_data_cache')
  expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({results:[]})
  expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe('ok')
})
it('shares normalized cached reads between API, daily chart/history and independent MCP without creating financial changes',async()=>{
  await migrate(f.db);await f.seed()
  await f.db.prepare("INSERT INTO accounts(id,name,type,balance,currency,quote_currency,symbol,asset_type) VALUES ('holding','Synthetic','investment',2,'SHARE','EUR','TEST','stock')").run()
  const revision=await f.db.prepare('SELECT revision FROM financial_data_revision').first('revision')
  const quote=await (await f.request('/market/quote?symbol=TEST')).json() as Quote
  expect(quote).toMatchObject({price:110,currency:'EUR',previous_close:100,provider:'yahoo',status:'ok'})
  await new D1MarketCache(f.db).put('quote:v1:TEST',{...quote,as_of:'2000-01-01T00:00:00Z',price:1,regularMarketPrice:1},Date.now()+1,300000,86400000)
  const saved=JSON.parse((await f.db.prepare("SELECT payload FROM market_data_cache WHERE cache_key='quote:v1:TEST'").first<string>('payload'))!)
  expect(saved.as_of).toBe(quote.as_of)
  const chart=await (await f.request('/market/chart?symbol=TEST&range=1mo&interval=1d')).json()
  expect(chart).toMatchObject({price_kind:'unadjusted',currency:'EUR',points:expect.any(Array)})
  const history=await (await f.request(`/market/history?symbol=TEST&from=${new Date(Date.now()-7*86400000).toISOString().slice(0,10)}&to=${new Date().toISOString().slice(0,10)}`)).json()
  expect(history).toMatchObject({price_kind:'unadjusted'})
  const portfolio=await f.tool('get_portfolio',{currency:'HUF'})
  expect(portfolio).toMatchObject({holdings:[expect.objectContaining({native_value:220,native_currency:'EUR',quote:expect.objectContaining({as_of:quote.as_of,price:110})})]})
  expect(calls.filter(u=>u.includes('query1'))).toHaveLength(1)
  expect(await f.db.prepare('SELECT revision FROM financial_data_revision').first('revision')).toBe(revision)
  expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='holding'").first('balance')).toBe(2)
})
it('keeps true timestamps and cached values after provider failure, withholding daily moves',async()=>{
  await migrate(f.db)
  const initial=await (await f.request('/market/quote?symbol=TEST')).json() as Quote
  await f.db.prepare('UPDATE market_data_cache SET fetched_at=0,expires_at=0').run();failure=true
  const fallback=await (await f.request('/market/quote?symbol=TEST')).json()
  expect(fallback).toMatchObject({price:110,as_of:initial.as_of,status:'stale',regularMarketChangePercent:null})
  expect(calls).toHaveLength(3) // initial call + two bounded attempts
})
it('normalizes ETF search and validates limits without issuing provider requests for bad input',async()=>{
  await migrate(f.db)
  const search=await (await f.request('/market/search?q=synthetic')).json()
  expect(search).toMatchObject({quotes:[{symbol:'TEST.DE',category:'etf',quoteType:'ETF'}]})
  expect((await f.request('/market/chart?symbol=TEST&range=max&interval=1m')).status).toBe(400)
  expect((await f.request('/market/chart?symbol=TEST&range=toString')).status).toBe(400)
  expect((await f.request('/market/history?symbol=TEST&from=2026-02-30&to=2026-03-01')).status).toBe(400)
  expect((await f.request('/market/quotes?symbols='+Array(51).fill('TEST').join(','))).status).toBe(400)
  expect((await f.request('/market/quote?symbol=..%2Fbad')).status).toBe(400)
  expect(calls).toHaveLength(1)
})
it('serves dated ECB rates with original weekend dates and explicit missing weekdays, never current FX',async()=>{
  await migrate(f.db)
  const response=await f.request('/market/fx-history?from=2026-01-09&to=2026-01-12&currencies=EUR,USD,HUF')
  expect(response.status).toBe(200)
  const history=await response.json() as FxHistory
  expect(history).toMatchObject({provider:'frankfurter_ecb',source:'ECB statistics',base:'EUR',coverage:'partial',missing:[{date:'2026-01-12',currencies:['HUF','USD']}]})
  expect(datedFxAt(history,'2026-01-11','HUF')).toEqual({rate:400,as_of:'2026-01-09',reason:null})
  expect(datedFxAt(history,'2026-01-12','HUF').rate).toBeNull()
  expect(calls.every(u=>u.includes('frankfurter'))).toBe(true)
})
