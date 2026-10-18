import {useId} from 'react'
import {Area,CartesianGrid,ComposedChart,Line,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import type {usePortfolioHistory} from '../../hooks/usePortfolioHistory'
import type {PortfolioHistoryPoint} from '../../../../shared/investment-history-contract'
const ranges=[['1m','1M'],['3m','3M'],['6m','6M'],['1y','1Y'],['ytd','YTD'],['all','All']] as const
export function PortfolioHistoryChart({history,hidden,currency}:{history:ReturnType<typeof usePortfolioHistory>;hidden:boolean;currency:string}) {
 const {data,range,setRange,loading,error,refresh}=history
 const id=useId().replaceAll(':',''),summary=data?.summary
 const money=(n:number|null|undefined)=>hidden?'••••••':n==null?'Unavailable':`${n.toLocaleString(undefined,{maximumFractionDigits:2})} ${currency}`
 const percent=(n:number|null|undefined)=>hidden?'••••••':n==null?'Unavailable':`${n.toLocaleString(undefined,{maximumFractionDigits:2})}%`
 const known=data?.points.some(p=>p.value!==null)
 return <section aria-label="Portfolio history" className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><h2 className="text-lg font-semibold">Portfolio value</h2><p className="text-xs text-muted-foreground">History includes sold and archived holdings.</p></div>
   <div role="group" aria-label="Portfolio history range" className="flex rounded-lg bg-secondary/50 p-1">
    {ranges.map(([value,label])=><button key={value} aria-pressed={range===value} onClick={()=>setRange(value)} className={`rounded px-2.5 py-1.5 text-xs ${range===value?'bg-background shadow-sm':'text-muted-foreground'}`}>{label}</button>)}
   </div>
  </div>
  <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
   <div><p className="text-muted-foreground">Latest value in range</p><p className="font-semibold">{money(summary?.end_value)}</p></div>
   <div><p className="text-muted-foreground">Range gain</p><p className="font-semibold">{money(summary?.gain)}</p></div>
   <div><p className="text-muted-foreground">Estimated return</p><p className="font-semibold">{percent(summary?.estimated_return_percent)}</p></div>
  </div>
  {error&&<p role="alert" className="text-sm">{data?'Showing saved history. Refresh failed.':'Portfolio history could not be loaded.'} {history.errorMessage} <button onClick={refresh} className="text-primary underline">Retry history</button></p>}
  {loading&&<p role="status" className="text-xs text-muted-foreground">{data?'Refreshing history…':'Loading portfolio history…'}</p>}
  <div className="h-64 sm:h-80 w-full" aria-label={hidden?'Portfolio chart hidden':'Daily portfolio value and net invested'}>
   {hidden?<div className="flex h-full items-center justify-center text-muted-foreground">Chart hidden for privacy</div>:!data?<div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loading?'Loading daily values…':'History unavailable'}</div>:!known?<div className="flex h-full items-center justify-center text-sm text-muted-foreground">No known portfolio values in this range.</div>:
    <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.points} margin={{left:0,right:12,top:8,bottom:0}}>
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
  <p className="text-xs text-muted-foreground">Gain excludes contributions and withdrawals. Estimated return links daily factors, assuming contributions at the start and withdrawals at the end of each day. Missing inputs leave gaps.</p>
  {data&&<>
   <p className="text-xs text-muted-foreground">{data.from} – {data.to} · {data.timezone} · as of {data.as_of}{data.points.at(-1)?.provisional?' · today is provisional':''}</p>
   <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">History method and coverage{summary?.status==='partial'?' · incomplete':''}</summary>
    <div className="mt-2 space-y-2"><p>{data.method.price_timing}</p><p>{data.method.fx_timing}</p><p>{data.method.current_endpoint}</p>
     {summary?.reasons.length!==0&&<p>Range coverage: {summary?.reasons.join(', ').replaceAll('_',' ')}.</p>}
     <p>Unknown legacy history starts at its first supported boundary. Net invested requires known lifetime cash flows; it is not remaining cost basis. All is bounded to the last ten years.</p>
     <ul className="space-y-1">{data.coverage_ranges.slice(0,30).map((c,i)=><li key={i}>{data.holdings.find(h=>h.account_id===c.account_id)?.name??'Holding'} · {c.from} – {c.to} · {c.kind}: {c.reasons.join(', ').replaceAll('_',' ')}</li>)}</ul>
     {data.coverage_ranges.length>30&&<p>{data.coverage_ranges.length-30} more coverage intervals in this response.</p>}
    </div>
   </details>
  </>}
 </section>
}
