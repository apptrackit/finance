import {act,renderHook,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {useInvestmentData} from '../hooks/useInvestmentData'
import {investmentFixture,syntheticBuy,syntheticSell} from './investment-fixture'
let snapshot=investmentFixture(),failure=false
const fetcher=vi.fn<typeof fetch>()
beforeEach(()=>{
 snapshot=investmentFixture();failure=false;fetcher.mockClear()
 fetcher.mockImplementation(async input=>String(input).includes('/categories')?Response.json([]):failure?Response.json({}, {status:503}):Response.json(snapshot))
 vi.stubGlobal('fetch',fetcher)
})
afterEach(()=>vi.unstubAllGlobals())
it('loads one coherent facts/metrics snapshot on demand and preserves fractional signed trades and links',async()=>{
 snapshot=investmentFixture(undefined,[{...syntheticBuy,linked_transaction_id:'cash-pair'} as typeof syntheticBuy,syntheticSell])
 const {result,rerender}=renderHook(({active})=>useInvestmentData(active,1),{initialProps:{active:false}})
 expect(fetcher).not.toHaveBeenCalled();rerender({active:true})
 await waitFor(()=>expect(result.current.status.loaded).toBe(true))
 expect(result.current.data?.transactions).toMatchObject([{quantity:0.1234567,linked_transaction_id:'cash-pair'},{quantity:-0.0234567,amount:-2.34567}])
 expect(result.current.data?.metrics.USD.holdings[0]).toMatchObject({quantity:0.1,value:15,net_invested:null})
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('/investment-metrics'))).toHaveLength(1)
})
it('retains currency and the complete snapshot after a failed refresh and recovers',async()=>{
 const {result}=renderHook(()=>useInvestmentData(true,1));await waitFor(()=>expect(result.current.status.loaded).toBe(true))
 const previous=result.current.data;act(()=>result.current.setCurrencyDisplay('USD'));failure=true
 await act(async()=>{await result.current.refresh()})
 expect(result.current.data).toBe(previous);expect(result.current.currencyDisplay).toBe('USD')
 expect(result.current.status).toEqual({loaded:true,loading:false,error:true,stale:true})
 failure=false;await act(async()=>{await result.current.refresh()});expect(result.current.status.stale).toBe(false)
})
it('keeps an empty portfolio after failed refresh instead of publishing failed partial facts',async()=>{
 snapshot=investmentFixture([],[])
 const {result}=renderHook(()=>useInvestmentData(true,1));await waitFor(()=>expect(result.current.status.loaded).toBe(true))
 const previous=result.current.data;failure=true;await act(async()=>{await result.current.refresh()})
 expect(result.current.data).toBe(previous);expect(result.current.data?.accounts).toEqual([])
})
it.each(['/investment-metrics','/categories'])('does not publish an initial failed %s read',async path=>{
 const base=fetcher.getMockImplementation()!
 fetcher.mockImplementation(async(input,options)=>String(input).includes(path)?Response.json({}, {status:503}):base(input,options))
 const {result}=renderHook(()=>useInvestmentData(true,1));await waitFor(()=>expect(result.current.status.error).toBe(true));expect(result.current.data).toBeNull()
})
it('retains native facts and explicit null metrics when market inputs are missing',async()=>{
 snapshot=investmentFixture(undefined,undefined,true)
 const {result}=renderHook(()=>useInvestmentData(true,1));await waitFor(()=>expect(result.current.status.loaded).toBe(true))
 expect(result.current.data?.metrics.USD.holdings[0]).toMatchObject({quantity:0.1,value:null,total_gain:null})
})
it('invalidates hidden snapshots and discards aborted late responses',async()=>{
 const {result,rerender}=renderHook(({active,key})=>useInvestmentData(active,key),{initialProps:{active:true,key:1}})
 await waitFor(()=>expect(result.current.status.loaded).toBe(true));const previous=result.current.data
 let release:(response:Response)=>void=()=>{}
 const base=fetcher.getMockImplementation()!
 fetcher.mockImplementation(async(input,options)=>String(input).includes('/investment-metrics')?new Promise(resolve=>{release=resolve}):base(input,options))
 let refreshing:Promise<void>;act(()=>{refreshing=result.current.refresh()});rerender({active:false,key:2})
 await act(async()=>{release(Response.json(investmentFixture([],[])));await refreshing!})
 expect(result.current.data).toBe(previous);expect(result.current.status.stale).toBe(true)
 fetcher.mockImplementation(base);rerender({active:true,key:2});await waitFor(()=>expect(result.current.status.stale).toBe(false))
})
