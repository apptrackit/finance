import {useState} from 'react'
import {Link} from 'react-router'
import {TriangleAlert} from 'lucide-react'
import {usesMarketPricing} from '../../../../shared/holding'
import type {Position,MarketQuote,Account} from './types'
import {quoteFor} from './overview'
export function InvestmentAttention({positions,quotes,refreshing,onRefresh,onOpen,className=''}:{className?:string;positions:Position[];quotes:Record<string,MarketQuote>;refreshing:boolean;onRefresh:()=>void;onOpen:(a:Account)=>void}) {
 const [expanded,setExpanded]=useState(false)
 const items=positions.flatMap(p=>{
  const a=p.account,q=quoteFor(p,quotes),result:{id:string;account:Account;text:string;action:'retry'|'value'|'opening'|'trades'}[]=[]
  const add=(id:string,text:string,action:'retry'|'value'|'opening'|'trades')=>result.push({id:`${a.id}:${id}`,account:a,text,action})
  if(p.currentValue===null)add('value',p.missingCurrencies.length?`Missing ${p.missingCurrencies.join(', ')} FX conversion`:usesMarketPricing(a)?'Current market value unavailable':'Manual value unavailable',p.missingCurrencies.length||usesMarketPricing(a)?'retry':'value')
  if(usesMarketPricing(a)&&a.balance!==0&&q?.status==='stale')add('stale','Market price is stale','retry')
  if(!usesMarketPricing(a)&&a.manual_valuation?.status==='stale')add('appraisal','Manual appraisal needs an update','value')
  const incomplete=p.metrics.coverage.cost?.some(r=>/unknown|mismatch|ambiguous|unsupported|missing_dated|unverified|future/.test(r))
  if(a.holding_position?.history_status!=='reconciled') add('history','Recorded units need review or an imported starting position','opening')
  else if(incomplete) add('history',p.metrics.coverage.cost?.includes('unknown_cash_flow')?'Purchase cash details are missing':'Purchase cost or historical market coverage is incomplete','trades')
  return result
 })
 if(!items.length)return null
 const shown=expanded?items:items.slice(0,3)
 return <section aria-label="Investment needs attention" className={`rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 ${className}`}>
  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300"><TriangleAlert className="h-4 w-4"/><h2>Needs attention</h2><span className="text-xs font-normal">{items.length}</span></div>
  <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">{shown.map(item=><li key={item.id} className="flex min-h-10 items-center justify-between gap-3 text-xs"><span className="min-w-0"><span className="font-medium">{item.account.symbol||item.account.name}</span><span className="text-muted-foreground"> · {item.text}</span></span>{item.action==='opening'?<Link to="/accounts" state={{editAccountId:item.account.id}} className="shrink-0 py-3 font-medium text-primary">Review position</Link>:<button type="button" disabled={item.action==='retry'&&refreshing} onClick={()=>item.action==='value'||item.action==='trades'?onOpen(item.account):onRefresh()} className="shrink-0 py-3 font-medium text-primary disabled:opacity-50">{item.action==='value'?'Update value':item.action==='trades'?'Review trades':'Retry prices'}</button>}</li>)}</ul>
  {items.length>3&&<button type="button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} className="min-h-10 text-xs font-medium text-primary">{expanded?'Show fewer':`Show ${items.length-3} more`}</button>}
 </section>
}
