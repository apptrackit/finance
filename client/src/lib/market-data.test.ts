import {afterEach,expect,it,vi} from 'vitest'
import {clearMarketReadCache,readMarketQuotes} from './market-data'
afterEach(()=>{vi.unstubAllGlobals();clearMarketReadCache()})
it('shares concurrent quote reads and retains the real as-of timestamp after a failed refresh',async()=>{
  const asOf=new Date().toISOString()
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({regularMarketPrice:10,currency:'EUR',as_of:asOf,regularMarketChangePercent:5,status:'ok'}))
  vi.stubGlobal('fetch',fetcher)
  const [a,b]=await Promise.all([readMarketQuotes(['TEST']),readMarketQuotes(['TEST','TEST'])])
  expect(a).toEqual(b);expect(fetcher).toHaveBeenCalledTimes(1)
  fetcher.mockRejectedValue(new Error('private financial details'))
  expect((await readMarketQuotes(['TEST'])).TEST).toMatchObject({regularMarketPrice:10,as_of:asOf,status:'stale',regularMarketChangePercent:null})
})
it('limits client fan-out to four and never returns missing prices as zero',async()=>{
  let active=0,max=0
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async input=>{
    active++;max=Math.max(max,active)
    await new Promise(r=>setTimeout(r,3));active--
    return Response.json({symbol:new URL(String(input),'http://localhost').searchParams.get('symbol'),regularMarketPrice:null,currency:null,status:'missing'})
  })
  vi.stubGlobal('fetch',fetcher)
  const quotes=await readMarketQuotes(Array.from({length:20},(_,i)=>`TEST${i}`))
  expect(max).toBeLessThanOrEqual(4);expect(Object.values(quotes).every(q=>q.regularMarketPrice===null)).toBe(true)
  await expect(readMarketQuotes(Array.from({length:201},(_,i)=>`T${i}`))).rejects.toThrow(/200/)
})
it('cancels one reader without cancelling another view of the same quote',async()=>{
  let release:(r:Response)=>void=()=>{},sourceSignal:AbortSignal|undefined
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async(_input,options)=>{
    sourceSignal=options?.signal as AbortSignal
    return new Promise(resolve=>{release=resolve})
  })
  vi.stubGlobal('fetch',fetcher)
  const one=new AbortController(),two=new AbortController()
  const a=readMarketQuotes(['TEST'],one.signal),b=readMarketQuotes(['TEST'],two.signal)
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
  one.abort();await expect(a).rejects.toThrow();expect(sourceSignal?.aborted).toBe(false)
  release(Response.json({regularMarketPrice:10,currency:'EUR'}))
  expect((await b).TEST.regularMarketPrice).toBe(10)
})
