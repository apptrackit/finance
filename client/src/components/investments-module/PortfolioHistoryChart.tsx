import {amount} from './overview'
import {useId,useState} from 'react'
import {Area,CartesianGrid,ComposedChart,Line,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import type {usePortfolioHistory} from '../../hooks/usePortfolioHistory'
import type {PortfolioHistoryPoint} from '../../../../shared/investment-history-contract'
const ranges=[['1m','1M'],['3m','3M'],['6m','6M'],['1y','1Y'],['ytd','YTD'],['all','All']] as const
export function PortfolioHistoryChart({history,hidden,currency,currentValue}:{history:ReturnType<typeof usePortfolioHistory>;hidden:boolean;currency:string;currentValue?:number|null}) {
 const {data,range,setRange,loading,error,refresh}=history
 const id=useId().replaceAll(':',''),summary=data?.summary
 const money=(n:number|null|undefined)=>amount(n,currency,hidden)
 const percent=(n:number|null|undefined)=>hidden?'••••••':n==null?'Unavailable':`${n.toLocaleString(undefined,{maximumFractionDigits:2})}%`
 const [selection,setSelection]=useState<{key:string;index:number}|null>(null)
 const key=`${range}:${currency}:${data?.as_of}`
 const selected=selection?.key===key?data?.points[selection.index]:undefined
 const displayedValue=selected?selected.value:currentValue!==undefined?currentValue:summary?.end_value
 const readDay=(index:number)=>setSelection({key,index})
 const known=data?.points.some(p=>p.value!==null)
 return <section aria-label="Portfolio history" className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0"><h2 className="text-[13px] font-medium text-muted-foreground">Portfolio value{selected?` · ${selected.date}`:''}</h2><p className="mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-[32px]">{money(displayedValue)}</p>
    <p className="mt-2 text-xs text-muted-foreground">Range gain <span className="font-semibold text-foreground">{money(summary?.gain)}</span> · <span>{percent(summary?.estimated_return_percent)} estimated return</span> · Excludes dividends</p>
   </div>
   <div role="group" aria-label="Portfolio history range" className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-background p-0.5">
    {ranges.map(([value,label])=><button type="button" key={value} aria-pressed={range===value} onClick={()=>setRange(value)} className={`min-h-9 shrink-0 rounded-md px-2.5 text-xs ${range===value?'bg-secondary font-semibold':'text-muted-foreground'}`}>{label}</button>)}
   </div>
  </div>
  {error&&<p role="alert" className="text-sm">{data?'Showing saved history. Refresh failed.':'Portfolio history could not be loaded.'} {history.errorMessage} <button onClick={refresh} className="text-primary underline">Retry history</button></p>}
  {loading&&<p role="status" className="text-xs text-muted-foreground">{data?'Refreshing history…':'Loading portfolio history…'}</p>}
  <div className="min-h-48 flex-1 sm:min-h-[280px] w-full" aria-label={hidden?'Portfolio chart hidden':'Daily portfolio value and net invested'}>
   {hidden?<div className="flex h-full items-center justify-center text-muted-foreground">Chart hidden for privacy</div>:!data?<div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loading?'Loading daily values…':'History unavailable'}</div>:!known?<div className="flex h-full items-center justify-center text-sm text-muted-foreground">No known portfolio values in this range.</div>:
    <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.points} onMouseMove={s=>{if(s.activeIndex!=null&&Number.isInteger(Number(s.activeIndex)))readDay(Number(s.activeIndex))}} onClick={s=>{if(s.activeIndex!=null&&Number.isInteger(Number(s.activeIndex)))readDay(Number(s.activeIndex))}} onMouseLeave={()=>setSelection(null)} margin={{left:0,right:12,top:8,bottom:0}}>
     <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01}/></linearGradient></defs>
     <CartesianGrid vertical={false} stroke="hsl(var(--border))"/>
     <XAxis dataKey="date" tick={{fontSize:10}} minTickGap={40} tickFormatter={d=>String(d).slice(5)}/>
     <YAxis width={64} tick={{fontSize:10}} tickFormatter={n=>Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(n)} domain={['auto','auto']}/>
     <Tooltip filterNull={false} content={({active,payload})=>{
      const p=active&&payload?.[0]?.payload as PortfolioHistoryPoint|undefined
      return p?<div className="rounded-lg border border-border bg-card p-3 text-xs shadow-lg space-y-1"><p>{p.date}{p.provisional?' · provisional':''}</p><p>Portfolio value: {money(p.value)}</p><p>Net invested: {money(p.net_invested)}</p><p>Contributions: {money(p.contribution)} · Withdrawals: {money(p.withdrawal)}</p>{p.price_as_of_oldest&&<p className="text-muted-foreground">Price observations: {p.price_as_of_oldest}{p.price_as_of_latest!==p.price_as_of_oldest?` – ${p.price_as_of_latest}`:''}</p>}{p.fx_as_of_oldest&&<p className="text-muted-foreground">FX observation: {p.fx_as_of_oldest}</p>}</div>:null
     }}/>
     <Area type="linear" dataKey="value" name="Portfolio value" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#${id})`} dot={{r:1.5,strokeWidth:0,fill:'hsl(var(--primary))'}} connectNulls={false} isAnimationActive={false}/>
     <Line type="stepAfter" dataKey="net_invested" name="Net invested" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} connectNulls={false} isAnimationActive={false}/>
    </ComposedChart></ResponsiveContainer>}
  </div>
  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span><span className="inline-block h-0.5 w-5 bg-primary align-middle mr-1"/>Portfolio value</span><span><span className="inline-block w-5 border-t border-dashed border-muted-foreground align-middle mr-1"/>Net invested</span></div>
  {!hidden&&data&&data.points.length>1&&<label className="sr-only focus-within:not-sr-only"><span>Read a day: {selected?.date??data.to}</span><input type="range" aria-label="Read portfolio history by date" min={0} max={data.points.length-1} value={selected?selection!.index:data.points.length-1} onChange={e=>readDay(Number(e.target.value))} aria-valuetext={`${selected?.date??data.to} · ${money(displayedValue)}`} className="w-full accent-primary"/></label>}
  {data&&<>
   <p className="text-[10px] leading-relaxed text-muted-foreground">{data.from} – {data.to} · {data.timezone} · read {new Date(data.as_of).toLocaleString()}{data.points.at(-1)?.provisional?' · today is provisional':''}</p>
  </>}
 </section>
}
