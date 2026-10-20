import {amount,signedAmount,tone} from './overview'

export function GainBreakdown({realized,unrealized,basis,currency,hidden}:{realized:number|null;unrealized:number|null;basis:number|null;currency:string;hidden:boolean}) {
 const complete=realized!=null&&Number.isFinite(realized)&&unrealized!=null&&Number.isFinite(unrealized)
 const scale=complete?Math.max(Math.abs(realized),Math.abs(unrealized)):0
 const rows=[{label:'Realized gain',note:'From sold units',value:realized},{label:'Unrealized gain',note:'From current holdings',value:unrealized}]
 return <section aria-label="Gain breakdown" className="rounded-xl border border-border p-4">
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
   <h3 className="text-sm font-semibold">Gain breakdown</h3>
   <p className="text-xs text-muted-foreground">Cost of current holdings <span className="ml-2 font-medium tabular-nums text-foreground">{amount(basis,currency,hidden)}</span></p>
  </div>
  <div className="mt-4 grid grid-cols-1 gap-4 @min-[480px]:grid-cols-2">
   {rows.map(row=>{
    const width=complete&&scale>0?Math.abs(row.value!)/scale*50:0
    return <div key={row.label} className="min-w-0 rounded-lg bg-secondary/40 p-3">
     <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="text-xs font-medium text-muted-foreground">{row.label}</p>
      <p className={`break-words text-lg font-semibold tabular-nums ${tone(row.value,hidden)}`}>{signedAmount(row.value,currency,hidden)}</p>
     </div>
     <div aria-hidden="true" title="Gain amounts on a shared scale, centered at zero. These bars are not return percentages." className="relative my-3 h-2 overflow-hidden rounded-full bg-secondary">
      <span className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/40"/>
      {!hidden&&complete&&(row.value===0?<span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-muted-foreground/60"/>:
       <span className={`absolute inset-y-0 rounded-full ${row.value!>0?'bg-success':'bg-destructive'}`} style={{left:`${row.value!>=0?50:50-width}%`,width:`${width}%`}}/>)}
     </div>
     <p className="text-[10px] text-muted-foreground">{row.note}</p>
    </div>
   })}
  </div>
 </section>
}
