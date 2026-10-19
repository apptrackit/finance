import {useState} from 'react'
import {Link} from 'react-router'
import {ArrowDown,ArrowUp,ChevronsUpDown,ChevronRight,Plus} from 'lucide-react'
import {usesMarketPricing} from '../../../../shared/holding'
import type {HoldingTrend} from '../../../../shared/investment-overview'
import type {Account,Position,MarketQuote} from './types'
import {Select} from '../common/select'
import {HoldingSparkline} from './HoldingSparkline'
import {amount,unitPrice,signedAmount,percentage,tone,categories,category,categoryLabel,dailyMove,quoteFor,sortHoldings,initialOverview} from './overview'
import type {OverviewView} from './overview'
type Props={positions:Position[];quotes:Record<string,MarketQuote>;privacyMode:string;onOpenDetail:(account:Account)=>void;
 trends?:Record<string,HoldingTrend>;view?:OverviewView;onViewChange?:(patch:Partial<OverviewView>)=>void;
 loading?:boolean;refreshing?:boolean;onRefresh?:()=>void}
export function HoldingsList(props:Props) {
 const {positions,quotes,trends={},privacyMode,onOpenDetail}=props
 const [local,setLocal]=useState(initialOverview),view=props.view??local,hidden=privacyMode==='hidden'
 const update=(patch:Partial<OverviewView>)=>props.onViewChange?props.onViewChange(patch):setLocal(v=>({...v,...patch}))
 const rows=sortHoldings(positions,quotes,view)
 const sort=(field:OverviewView['sort'])=>update({sort:field,direction:view.sort===field?(view.direction==='desc'?'asc':'desc'):field==='name'?'asc':'desc'})
 const sortButton=(field:OverviewView['sort'],label:string)=><button type="button" onClick={()=>sort(field)} className="inline-flex min-h-10 items-center gap-1 rounded px-1 focus-visible:outline-2 focus-visible:outline-primary">{label}{view.sort===field?(view.direction==='desc'?<ArrowDown className="h-3 w-3"/>:<ArrowUp className="h-3 w-3"/>):<ChevronsUpDown className="h-3 w-3 opacity-50"/>}</button>
 const sorted=(field:OverviewView['sort'])=>view.sort===field?view.direction==='desc'?'descending' as const:'ascending' as const:undefined
 return <section aria-labelledby="holdings-title" className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card" aria-busy={props.refreshing}>
  <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
   <h2 id="holdings-title" className="text-[15px] font-semibold">Holdings</h2><p className="flex-1 text-xs text-muted-foreground">{rows.length} of {positions.length} holdings · Returns exclude dividends</p>
   <Link to="/accounts" state={{addAccount:true,investment:true}} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary"><Plus className="h-3.5 w-3.5"/>Add holding</Link>
   <div role="group" aria-label="Holding categories" className="flex w-full gap-1.5 overflow-x-auto pb-1 @min-[900px]:w-auto @min-[900px]:pb-0">
    {categories.filter(([key])=>key!=='other'||positions.some(p=>category(p)==='other')).map(([key,label])=><button key={key} type="button" aria-pressed={view.filter===key} onClick={()=>update({filter:key})} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs ${view.filter===key?'border-primary/40 bg-primary/10 font-medium text-foreground':'border-border text-muted-foreground hover:bg-secondary'}`}>{label}{' '}<span className="tabular-nums text-muted-foreground">{key==='all'?positions.length:positions.filter(p=>category(p)===key).length}</span></button>)}
   </div>
  </div>
  <p className="px-4 pt-3 text-xs text-muted-foreground sm:px-5">Filters affect holdings only. Chart, summaries and allocation include the full portfolio.</p>
  <div className="px-4 py-3 @min-[900px]:hidden"><Select aria-label="Sort holdings" value={`${view.sort}:${view.direction}`} onChange={e=>{const [sort,direction]=e.target.value.split(':');update({sort:sort as OverviewView['sort'],direction:direction as OverviewView['direction']})}} className="h-10 text-xs">
   <option value="value:desc">Value · largest first</option><option value="value:asc">Value · smallest first</option><option value="name:asc">Holding · A to Z</option><option value="name:desc">Holding · Z to A</option><option value="return:desc">Total gain · highest first</option><option value="return:asc">Total gain · lowest first</option><option value="day:desc">Today move · highest first</option><option value="day:asc">Today move · lowest first</option>
  </Select></div>
  {props.loading?<p role="status" className="p-8 text-sm text-muted-foreground">Loading holdings…</p>:positions.length===0?<div className="px-5 py-12 text-center"><h3 className="font-semibold">No investment accounts yet</h3><p className="mt-2 text-sm text-muted-foreground">Add your first holding in Accounts, then record a purchase from a cash account.</p><Link to="/accounts" state={{addAccount:true,investment:true}} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary">Add an investment holding</Link></div>:rows.length===0?<div className="p-8 text-sm text-muted-foreground">No {view.filter} holdings. <button type="button" onClick={()=>update({filter:'all'})} className="text-primary underline">Show all holdings</button></div>:
  <table className="block w-full table-fixed @min-[900px]:table" aria-label="Investment holdings"><colgroup className="hidden @min-[900px]:table-column-group"><col style={{width:'28%'}}/><col style={{width:'13%'}}/><col style={{width:'20%'}}/><col style={{width:'20%'}}/><col style={{width:'19%'}}/></colgroup>
   <thead className="hidden text-xs text-muted-foreground @min-[900px]:table-header-group"><tr><th scope="col" aria-sort={sorted('name')} className="px-4 text-left font-normal">{sortButton('name','Holding')}</th><th scope="col" className="px-2 text-left font-normal">30 days</th><th scope="col" aria-sort={sorted('day')} className="px-3 text-right font-normal">{sortButton('day','Price · today')}</th><th scope="col" aria-sort={sorted('value')} className="px-3 text-right font-normal">{sortButton('value','Value')}</th><th scope="col" aria-sort={sorted('return')} className="px-4 text-right font-normal">{sortButton('return','Return')}</th></tr></thead>
   <tbody className="block divide-y divide-border @min-[900px]:table-row-group">{rows.map(p=>{
    const a=p.account,q=quoteFor(p,quotes),market=usesMarketPricing(a),total=a.asset_type==='manual',move=dailyMove(p,quotes)
    const price=market?q?.price??q?.regularMarketPrice??null:a.manual_price??null
    const priceCurrency=market?q?.currency||p.quoteCurrency:p.quoteCurrency
    const timestamp=market?q?.as_of:a.manual_valuation?.as_of??a.manual_price_date
    const priceLabel=market?q?.status==='stale'?'Stale price':q?.status==='last_close'?'Last close':'Price as of':'Valued'
    return <tr key={a.id} data-holding-id={a.id} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-4 transition-colors hover:bg-secondary/20 sm:px-5 @min-[900px]:table-row @min-[900px]:p-0">
     <th scope="row" className="min-w-0 text-left font-normal @min-[900px]:px-4 @min-[900px]:py-4"><button type="button" onClick={()=>onOpenDetail(a)} className="group flex min-h-11 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Open ${a.symbol||a.name} details`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${a.asset_type==='crypto'?'bg-forecast/15 text-forecast':total?'bg-amber-500/10 text-amber-700 dark:text-amber-300':'bg-primary/15 text-primary'}`}>{(a.symbol||a.name).slice(0,2).toUpperCase()}</span>
      <span className="min-w-0"><span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{a.symbol||a.name}<span className="rounded border border-border px-1.5 text-[10px] font-medium text-muted-foreground">{categoryLabel(p)}</span></span><span className="mt-1 block truncate text-xs text-muted-foreground">{a.name}</span></span><ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary @min-[900px]:block"/>
     </button></th>
     <td className="order-5 col-span-2 flex min-w-0 items-center gap-2 pt-1 @min-[900px]:table-cell @min-[900px]:pt-0 @min-[900px]:px-2"><span className="text-[10px] text-muted-foreground @min-[900px]:hidden">30 days</span><HoldingSparkline trend={trends[a.id]} hidden={hidden}/></td>
     <td className="order-3 min-w-0 text-xs @min-[900px]:px-3 @min-[900px]:py-4 @min-[900px]:text-right"><span className="sr-only">Native price: </span><p className="break-words tabular-nums">{total?'Manual value':unitPrice(price,priceCurrency,hidden)}</p><p className={`${tone(move,hidden)} mt-1 tabular-nums`}>{move===null?'Today move unavailable':`${percentage(move,hidden)} today`}</p>{timestamp&&<p className={`mt-1 break-words text-[10px] ${q?.status==='stale'?'text-amber-700 dark:text-amber-300':'text-muted-foreground'}`}>{priceLabel} {timestamp}</p>}</td>
     <td className="order-2 min-w-0 text-right @min-[900px]:px-3 @min-[900px]:py-4"><span className="sr-only">Value: </span><p className="break-words text-sm font-semibold tabular-nums">{amount(p.currentValue,p.reportingCurrency,hidden)}</p><p className="mt-1 text-xs tabular-nums text-muted-foreground">{hidden?'••••••':p.metrics.allocation_percent==null?'Weight unavailable':`${p.metrics.allocation_percent.toLocaleString('hu-HU',{maximumFractionDigits:1})}% of portfolio`}</p></td>
     <td className="order-4 min-w-0 text-right text-xs @min-[900px]:px-4 @min-[900px]:py-4"><span className="sr-only">Total gain: </span><p className={`break-words font-semibold tabular-nums ${tone(p.gainLoss,hidden)}`}>{signedAmount(p.gainLoss,p.reportingCurrency,hidden)}</p><p className={`mt-1 tabular-nums ${tone(p.gainLossPercent,hidden)}`}>{hidden?'••••••':p.gainLossPercent==null?'Estimated return unavailable':`${percentage(p.gainLossPercent)} estimated`}</p></td>
    </tr>
   })}</tbody>
  </table>}
 </section>
}
