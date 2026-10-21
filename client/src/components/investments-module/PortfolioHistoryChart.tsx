import {amount} from './overview'
import {PortfolioHistoryTooltip} from './PortfolioHistoryTooltip'
import {useState} from 'react'
import {InteractiveAreaChart} from '../common/interactive-area-chart'
import type {usePortfolioHistory} from '../../hooks/usePortfolioHistory'
const ranges=[['1m','1M'],['3m','3M'],['6m','6M'],['1y','1Y'],['ytd','YTD'],['all','All']] as const
export function PortfolioHistoryChart({history,hidden,currency,currentValue}:{history:ReturnType<typeof usePortfolioHistory>;hidden:boolean;currency:string;currentValue?:number|null}) {
 const {data,range,setRange,loading,error,refresh}=history
 const summary=data?.summary
 const money=(n:number|null|undefined)=>amount(n,currency,hidden)
 const percent=(n:number|null|undefined)=>hidden?'••••••':n==null?'Unavailable':`${n.toLocaleString(undefined,{maximumFractionDigits:2})}%`
 const [selection,setSelection]=useState<{key:string;index:number}|null>(null)
 const key=`${range}:${currency}:${data?.as_of}`
 const selected=selection?.key===key?data?.points[selection.index]:undefined
 const displayedValue=selected?selected.value:currentValue!==undefined?currentValue:summary?.end_value
 const readDay=(index:number)=>setSelection({key,index})
 const known=data?.points.some(p=>p.value!==null)
 return <section aria-label="Portfolio history" className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
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
  <div className="w-full min-w-0" aria-label={hidden?'Portfolio chart hidden':'Daily portfolio value and net invested'}>
   {hidden?<div className="flex h-[220px] @min-[640px]:h-[300px] items-center justify-center text-muted-foreground">Chart hidden for privacy</div>:!data?<div className="flex h-[220px] @min-[640px]:h-[300px] items-center justify-center text-sm text-muted-foreground">{loading?'Loading daily values…':'History unavailable'}</div>:!known?<div className="flex h-[220px] @min-[640px]:h-[300px] items-center justify-center text-sm text-muted-foreground">No known portfolio values in this range.</div>:
    <InteractiveAreaChart key={key} data={data.points.map(point=>({date:point.date,value:point.value,reference:point.net_invested}))}
     label="Portfolio value" formatValue={money} className="h-[220px] @min-[640px]:h-[300px]"
     reference={{label:'Net invested',color:'hsl(var(--muted-foreground))',dashed:true,step:true}}
     activeIndex={selected?selection!.index:null} onInspect={index=>index===null?setSelection(null):readDay(index)}
     renderTooltip={index=><PortfolioHistoryTooltip point={data.points[index]} currency={currency}/>}/>}
  </div>
  {data&&<>
   <p className="text-[10px] leading-relaxed text-muted-foreground">{data.from} – {data.to} · {data.timezone} · read {new Date(data.as_of).toLocaleString()}{data.points.at(-1)?.provisional?' · today is provisional':''}</p>
  </>}
 </section>
}
