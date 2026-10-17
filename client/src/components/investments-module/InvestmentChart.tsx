import { useEffect, useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { Loader2 } from 'lucide-react'
import type { PriceHistory } from '../../../../shared/market-data'
import { API_BASE_URL, apiFetch } from '../../config'

type Trade = { id: string; date: string; amount: number; quantity?: number; execution_currency?: string | null }
const RANGES = [
  {label:'1D',value:'1d'}, {label:'5D',value:'5d'}, {label:'1M',value:'1mo'},
  {label:'6M',value:'6mo'}, {label:'1Y',value:'1y'}, {label:'5Y',value:'5y'}, {label:'10Y',value:'max'},
]
export function InvestmentChart({symbol,transactions=[]}: {symbol:string;transactions?:Trade[]}) {
  const [range,setRange]=useState('1mo')
  const [retry,setRetry]=useState(0)
  const [snapshot,setSnapshot]=useState<{key:string;value:PriceHistory}|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)
  const key=`${symbol}:${range}`
  useEffect(()=>{
    const controller=new AbortController()
    setLoading(true);setError(null)
    void (async()=>{
      try {
        const response=await apiFetch(`${API_BASE_URL}/market/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`,{throwOnError:true,signal:controller.signal})
        const value=await response.json() as PriceHistory
        if (!value || value.symbol!==symbol.toUpperCase() || !Array.isArray(value.points) || !value.currency
          || value.points.some(p=> !Number.isFinite(p.close) || p.close<=0 || !/^\d{4}-\d{2}-\d{2}$/.test(p.date))) throw new Error('Invalid price history')
        if(!controller.signal.aborted) setSnapshot({key,value})
      } catch {if(!controller.signal.aborted) setError('Price history could not be refreshed.')} finally {if(!controller.signal.aborted) setLoading(false)}
    })()
    return ()=>controller.abort()
  },[key,symbol,range,retry])
  const history=snapshot?.key===key?snapshot.value:null
  const points=useMemo(()=>history?.points.map(point=>{
    const trades=transactions.filter(t=>t.date===point.date)
    return {...point,trades,buyPoint:trades.some(t=>(t.quantity??t.amount)>0)?point.close:undefined,
      sellPoint:trades.some(t=>(t.quantity??t.amount)<0)?point.close:undefined}
  })??[],[history,transactions])
  const first=points.at(0),last=points.at(-1)
  const splitInRange=history?.events.some(event=>event.type==='split')??false
  const change=first&&last&&!splitInRange?last.close-first.close:null
  const rawPercent=change!==null&&first?change/first.close*100:null
  const percent=rawPercent!==null&&Number.isFinite(rawPercent)?rawPercent:null
  const money=(n:number)=>`${n.toLocaleString(undefined,{maximumFractionDigits:history?.category==='crypto'?6:2})} ${history?.currency||''}`
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xl font-semibold">{last?money(last.close):'Price unavailable'}</p>
        {change!==null && percent!==null && <p className="text-xs text-muted-foreground">{change>=0?'+':''}{money(change)} ({percent.toFixed(2)}%) · selected range</p>}
        {splitInRange && <p className="text-xs text-muted-foreground">Range change unavailable across split events.</p>}
      </div>
      <div className="flex max-w-full overflow-x-auto rounded-lg bg-secondary/50 p-1">
        {RANGES.map(r=><button key={r.value} onClick={()=>setRange(r.value)} className={`rounded px-2 py-1 text-xs ${range===r.value?'bg-background shadow-sm':'text-muted-foreground'}`}>{r.label}</button>)}
      </div>
    </div>
    {history && <p className="text-xs text-muted-foreground">Yahoo Finance · daily unadjusted close · {history.currency} · {history.status==='stale'||error?'Saved history; refresh unavailable':'Retrieved'} {history.retrieved_at}{last?.provisional?' · current session provisional':''}</p>}
    {history?.requires_event_review && <p className="text-xs text-muted-foreground">Corporate events occur in this range. Price history alone does not establish complete portfolio returns.</p>}
    {error && <div className="flex gap-2 text-sm" role="alert">{error}<button className="text-primary underline" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
    <div className="h-[300px] w-full" aria-label="Daily instrument price history">
      {loading?<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading price history"/></div>:points.length===0?<p className="p-6 text-sm text-muted-foreground">No known daily closes in this range.</p>:
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))"/>
            <XAxis dataKey="date" tick={{fontSize:10}} minTickGap={35}/>
            <YAxis hide domain={['auto','auto']}/>
            <Tooltip content={({active,payload})=>{
              const point=active&&payload?.[0]?.payload as typeof points[number]|undefined
              return point?<div className="rounded border border-border bg-card p-3 text-xs shadow-lg"><p>{point.date}</p><p>{money(point.close)}</p>{point.trades.map(t=><p key={t.id}>{(t.quantity??t.amount)>0?'Buy':'Sell'}{t.execution_currency?` · execution in ${t.execution_currency}`:''}</p>)}</div>:null
            }}/>
            <Area type="linear" dataKey="close" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" connectNulls={false}/>
            <Scatter dataKey="buyPoint" fill="hsl(var(--primary))"/>
            <Scatter dataKey="sellPoint" fill="hsl(var(--destructive))"/>
          </ComposedChart>
        </ResponsiveContainer>}
    </div>
  </div>
}
