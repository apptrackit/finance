import type {PortfolioHistoryPoint} from '../../../../shared/investment-history-contract'
import {amount,percentage,signedAmount,tone} from './overview'

export function PortfolioHistoryTooltip({point,currency,hidden=false}:{point:PortfolioHistoryPoint;currency:string;hidden?:boolean}) {
 const {value,net_invested:invested}=point
 const difference=value!=null&&Number.isFinite(value)&&invested!=null&&Number.isFinite(invested)?value-invested:null
 const gain=difference!=null&&Number.isFinite(difference)?difference:null
 const ratio=gain!=null&&invested!=null&&invested>0?gain/invested*100:null
 const gainPercent=ratio!=null&&Number.isFinite(ratio)?ratio:null
 const date=new Date(`${point.date}T00:00:00Z`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
 return <div className="w-max max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-card p-4 shadow-lg">
  <p className="text-xs text-muted-foreground"><time dateTime={point.date}>{date}</time>{point.provisional?' · provisional':''}</p>
  <p className="mt-3 text-xs text-muted-foreground">Total gain</p>
  <div className={`mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums ${tone(gain,hidden)}`}>
   <p className="text-2xl font-semibold tracking-tight">{signedAmount(gain,currency,hidden)}</p>
   {gainPercent!=null&&<p className="text-lg font-semibold" title="Gain on net invested">{percentage(gainPercent,hidden)}</p>}
  </div>
  <div className="mt-3 border-t border-border pt-3"><p className="text-xs text-muted-foreground">Portfolio value</p><p className="mt-1 text-base font-medium tabular-nums">{amount(value,currency,hidden)}</p></div>
 </div>
}
