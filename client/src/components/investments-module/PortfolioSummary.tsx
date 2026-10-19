import type {CurrencyMetrics} from '../../../../shared/investment-metrics'
import {amount,signedAmount,percentage,tone} from './overview'

export function PortfolioSummary({metrics,hidden,currency}:{metrics?:CurrencyMetrics;hidden:boolean;currency:string}) {
 const today=metrics?.market_today
 const gain=metrics?.total_gain,invested=metrics?.total_invested
 const ratio=gain!=null&&Number.isFinite(gain)&&invested!=null&&Number.isFinite(invested)&&invested>0?gain/invested*100:null
 const gainPercent=ratio!=null&&Number.isFinite(ratio)?ratio:null
 const rows=[{label:'Net invested',value:invested,percent:null,signed:false},
  {label:'Total gain',value:gain,percent:gainPercent,signed:true},
  {label:'Today',value:today?.gain,percent:today?.estimated_return_percent,signed:true}]
 return <section aria-label="Portfolio summaries" className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
  {rows.map(r=><div key={r.label} className="px-5 py-4"><h2 className="text-xs font-medium text-muted-foreground">{r.label}</h2><div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1"><p className={`max-w-full break-words text-xl font-semibold tracking-tight tabular-nums ${r.signed?tone(r.value,hidden):''}`}>{r.signed?signedAmount(r.value,currency,hidden):amount(r.value,currency,hidden)}</p>{r.label==='Total gain'?(gainPercent!=null&&<span title="Total gain divided by net invested. This simple ratio does not account for when money was invested; withdrawals can make it less useful." className={`text-xs tabular-nums ${tone(gainPercent,hidden)}`}>{hidden?'••••':`${percentage(gainPercent)} · Gain on net invested`}</span>):r.label==='Today'&&<span className={`text-xs tabular-nums ${tone(r.percent,hidden)}`}>{hidden?'••••':r.percent==null?'Estimated return unavailable':`${percentage(r.percent)} estimated`}</span>}</div></div>)}
 </section>
}
