import {useCallback,useEffect,useRef,useState} from 'react'
import {API_BASE_URL,apiFetch,ApiRequestError} from '../config'
import type {PortfolioHistoryResponse} from '../../../shared/investment-history-contract'
import type {PortfolioRange} from '../../../shared/investment-history-dates'
import type {InvestmentSnapshot} from '../components/investments-module/data'

// App-owned, bounded session memory only. A new financial revision never reuses
// history from an older revision, even when the view was hidden during a write.
export function usePortfolioHistory(active:boolean,snapshot:InvestmentSnapshot|null,currency:string,refreshKey:number) {
 const [range,setRange]=useState<PortfolioRange>('1m')
 const [retry,setRetry]=useState(0)
 const cache=useRef(new Map<string,PortfolioHistoryResponse>())
 const [state,setState]=useState<{key:string;data:PortfolioHistoryResponse|null;loading:boolean;error:string|null}|null>(null)
 const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'
 const key=snapshot?`${refreshKey}:${snapshot.sourceRevision}:${snapshot.date}:${currency}:${timezone}:${range}`:''
 const revision=snapshot?.sourceRevision,date=snapshot?.date,asOf=snapshot?.asOf
 const refresh=useCallback(()=>setRetry(n=>n+1),[])
 useEffect(()=>{
  cache.current.clear()
 },[refreshKey])
 useEffect(()=>{
  if(!active||!key||revision===undefined||!date)return
  const controller=new AbortController(),saved=cache.current.get(key)??null
  setState({key,data:saved,loading:true,error:null})
  void (async()=>{
   try {
    const query=new URLSearchParams({range,currency,timezone,to:date,expected_revision:String(revision),max_points:'600'})
    const response=await apiFetch(`${API_BASE_URL}/investment-history?${query}`,{throwOnError:true,signal:controller.signal})
    const data=await response.json() as PortfolioHistoryResponse
    if(data.source_revision!==revision||data.currency!==currency||data.range!==range||data.timezone!==timezone||data.to!==date
      ||!Array.isArray(data.points)||!data.summary||!Array.isArray(data.coverage_ranges)
      ||data.points.some(p=>!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||[p.value,p.net_invested,p.contribution,p.withdrawal].some(n=>n!==null&&!Number.isFinite(n))))throw new Error('Invalid portfolio history response')
    if(controller.signal.aborted)return
    cache.current.delete(key);cache.current.set(key,data)
    while(cache.current.size>12)cache.current.delete(cache.current.keys().next().value!)
    setState({key,data,loading:false,error:null})
   } catch (cause) {
    const error=cause instanceof ApiRequestError&&cause.status===422?cause.message:cause instanceof ApiRequestError&&cause.status===409?'Investment records changed. Use Refresh prices below to reload the portfolio.':'Try again or choose another range.'
    if(!controller.signal.aborted)setState({key,data:saved,loading:false,error})
   }
  })()
  return ()=>controller.abort()
 },[active,key,revision,date,asOf,range,currency,timezone,retry])
 const current=state?.key===key?state:null
 return {range,setRange,data:current?.data??cache.current.get(key)??null,
  loading:active&&(current?.loading??!!key),error:!!current?.error,errorMessage:current?.error??null,refresh}
}
