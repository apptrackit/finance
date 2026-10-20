import {act,renderHook,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {usePortfolioHistory} from '../hooks/usePortfolioHistory'
import type {InvestmentSnapshot} from '../components/investments-module/data'
import {historyFixture} from './investment-fixture'
const snapshot={sourceRevision:1,asOf:'2026-10-17T12:00:00Z',date:'2026-10-17'} as InvestmentSnapshot
const fetcher=vi.fn<typeof fetch>()
beforeEach(()=>{
 fetcher.mockReset().mockImplementation(async input=>Response.json(historyFixture(new URL(String(input),'http://localhost').searchParams)))
 vi.stubGlobal('fetch',fetcher)
})
afterEach(()=>vi.unstubAllGlobals())
it('loads on demand, keeps range in memory, and retains matching history on failed revalidation',async()=>{
 const {result,rerender}=renderHook(({active})=>usePortfolioHistory(active,snapshot,'HUF',1),{initialProps:{active:false}})
 expect(fetcher).not.toHaveBeenCalled();rerender({active:true});await waitFor(()=>expect(result.current.data).not.toBeNull())
 const previous=result.current.data
 rerender({active:false});fetcher.mockResolvedValue(Response.json({}, {status:503}));rerender({active:true})
 await waitFor(()=>expect(result.current.error).toBe(true));expect(result.current.data).toBe(previous)
 act(()=>result.current.setRange('ytd'));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.data).toBeNull()
})
it('does not relabel old currency/range values while a new request is loading',async()=>{
 const {result,rerender}=renderHook(({currency})=>usePortfolioHistory(true,snapshot,currency,1),{initialProps:{currency:'HUF'}})
 await waitFor(()=>expect(result.current.data?.currency).toBe('HUF'))
 let release:(r:Response)=>void=()=>{}
 fetcher.mockImplementation(()=>new Promise(resolve=>{release=resolve}));rerender({currency:'USD'})
 expect(result.current.data).toBeNull()
 await act(async()=>release(Response.json(historyFixture(new URLSearchParams({currency:'USD',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,to:snapshot.date,expected_revision:'1'})))))
 await waitFor(()=>expect(result.current.data?.currency).toBe('USD'))
})
it('aborts hidden/superseded reads and invalidates every range after a financial refresh',async()=>{
 const {result,rerender}=renderHook(({active,key,revision})=>usePortfolioHistory(active,{...snapshot,sourceRevision:revision},'HUF',key),{initialProps:{active:true,key:1,revision:1}})
 await waitFor(()=>expect(result.current.data).not.toBeNull());act(()=>result.current.setRange('all'));await waitFor(()=>expect(result.current.data?.range).toBe('all'))
 let release:(r:Response)=>void=()=>{},signal:AbortSignal|undefined
 fetcher.mockImplementation((_input,options)=>{signal=options?.signal as AbortSignal;return new Promise(resolve=>{release=resolve})})
 act(()=>result.current.refresh());rerender({active:false,key:2,revision:2});expect(signal?.aborted).toBe(true);expect(result.current.data).toBeNull()
 await act(async()=>release(Response.json(historyFixture())))
 expect(result.current.data).toBeNull()
 fetcher.mockImplementation(async input=>Response.json(historyFixture(new URL(String(input),'http://localhost').searchParams)))
 rerender({active:true,key:2,revision:2});await waitFor(()=>expect(result.current.data?.source_revision).toBe(2));expect(result.current.range).toBe('all')
})

it('explains a work limit instead of suggesting endless retries of an oversized range',async()=>{
 fetcher.mockResolvedValue(Response.json({error:'Choose a shorter range.',code:'INVESTMENT_HISTORY_LIMIT'},{status:422}))
 const {result}=renderHook(()=>usePortfolioHistory(true,snapshot,'HUF',1))
 await waitFor(()=>expect(result.current.error).toBe(true));expect(result.current.errorMessage).toBe('Choose a shorter range.')
})

it('keeps failed EUR history separate from a successful USD snapshot',async()=>{
 const {result,rerender}=renderHook(({currency})=>usePortfolioHistory(true,snapshot,currency,1),{initialProps:{currency:'USD'}})
 await waitFor(()=>expect(result.current.data?.currency).toBe('USD'))
 fetcher.mockResolvedValue(Response.json({}, {status:503}));rerender({currency:'EUR'})
 await waitFor(()=>expect(result.current.error).toBe(true));expect(result.current.data).toBeNull()
 rerender({currency:'USD'});await waitFor(()=>expect(result.current.data?.currency).toBe('USD'))
})
