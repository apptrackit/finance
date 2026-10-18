import {amount,allocationRows,percentage} from './overview'
import type {OverviewView,HoldingFilter} from './overview'
import type {Account,Position} from './types'
export function PortfolioAllocation({positions,view,onChange,onOpen,hidden,currency}:{positions:Position[];view:OverviewView;onChange:(patch:Partial<OverviewView>)=>void;onOpen:(a:Account)=>void;hidden:boolean;currency:string}) {
 const {rows,complete}=allocationRows(positions,view.allocation)
 return <section aria-label="Portfolio allocation" className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">Allocation</h2><div role="group" aria-label="Allocation mode" className="flex rounded-lg border border-border bg-background p-0.5">{(['holding','type','currency'] as const).map(mode=><button type="button" key={mode} aria-pressed={view.allocation===mode} onClick={()=>onChange({allocation:mode})} className={`min-h-9 rounded-md px-2 text-[11px] capitalize ${view.allocation===mode?'bg-secondary font-semibold':'text-muted-foreground'}`}>{mode}</button>)}</div></div>
  <div className="my-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">{!hidden&&complete&&rows.map(r=><span key={r.key} style={{width:`${r.weight}%`,background:r.color}}/>)}</div>
  {!rows.length?<p className="text-xs text-muted-foreground">Allocation appears when you add holdings with known values.</p>:<ul className="max-h-56 space-y-1 overflow-y-auto pr-1">{rows.map(r=>{
   const clickable=view.allocation!=='currency'
   const content=<><span className="h-2 w-2 shrink-0 rounded-sm" style={{background:r.color}}/><span className="min-w-0 flex-1 truncate text-left">{r.label}</span><span className="min-w-0 break-words text-right text-[11px] tabular-nums text-muted-foreground">{amount(r.value,currency,hidden)}</span><span className="w-12 text-right text-xs font-medium tabular-nums">{hidden?'••••':r.weight==null?'—':percentage(r.weight).replace('+','')}</span></>
   return <li key={r.key}>{clickable?<button type="button" onClick={()=>view.allocation==='type'?onChange({filter:r.key as HoldingFilter}):onOpen(r.items[0].account)} aria-pressed={view.allocation==='type'?view.filter===r.key:undefined} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-1.5 text-xs hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">{content}</button>:<div className="flex min-h-10 items-center gap-2 px-1.5 text-xs">{content}</div>}</li>
  })}</ul>}
  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{!complete?'Complete weights unavailable until every holding has a known value. ':''}{view.allocation==='type'?'Select a type to filter holdings.':view.allocation==='currency'?'Quote / valuation currency, not geographic exposure.':'Full portfolio · select a holding for details.'}</p>
 </section>
}
