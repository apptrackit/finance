import type {Position,MarketQuote} from './types'
import {sumAvailable} from '../../../../shared/currency'
export type HoldingFilter='all'|'etf'|'stock'|'crypto'|'manual'|'other'
export type OverviewView={filter:HoldingFilter;sort:'name'|'day'|'value'|'return';direction:'asc'|'desc';allocation:'holding'|'type'|'currency'}
export const initialOverview:OverviewView={filter:'all',sort:'value',direction:'desc',allocation:'holding'}
export const categories=[['all','All'],['etf','ETF'],['stock','Stock'],['crypto','Crypto'],['manual','Manual'],['other','Other']] as const
export const category=(p:Position):HoldingFilter=>p.account.asset_type??'other'
export const categoryLabel=(p:Position)=>categories.find(([key])=>key===category(p))![1]
export const mask='••••••'
export const amount=(n:number|null|undefined,currency:string,hidden=false)=>hidden?mask:n==null?'Unavailable':`${n.toLocaleString('hu-HU',{maximumFractionDigits:currency==='HUF'?0:2})} ${currency}`
export const unitPrice=(n:number|null|undefined,currency:string,hidden=false)=>hidden?mask:n==null?'Unavailable':`${n>0&&n<1e-12?'< ':''}${(n>0&&n<1e-12?1e-12:n).toLocaleString('hu-HU',{maximumFractionDigits:12})} ${currency}`
export const signedAmount=(n:number|null|undefined,currency:string,hidden=false)=>hidden?mask:n==null?'Unavailable':`${n>0?'+':''}${amount(n,currency)}`
export const percentage=(n:number|null|undefined,hidden=false)=>hidden?mask:n==null?'Unavailable':`${n>0?'+':''}${n.toLocaleString('hu-HU',{maximumFractionDigits:2})}%`
export const tone=(n:number|null|undefined,hidden=false)=>hidden||n==null||n===0?'text-muted-foreground':n>0?'text-success':'text-destructive'
export const quoteFor=(p:Position,quotes:Record<string,MarketQuote>)=>quotes[p.account.symbol?.trim().toUpperCase()??'']
export const dailyMove=(p:Position,quotes:Record<string,MarketQuote>)=>{
 const q=quoteFor(p,quotes)
 return p.account.pricing_method!=='manual'&&p.account.asset_type!=='manual'&&q?.status==='ok'&&q.change_percent!=null?q.change_percent:null
}
export function sortHoldings(positions:Position[],quotes:Record<string,MarketQuote>,view:OverviewView) {
 const value=(p:Position)=>view.sort==='value'?p.currentValue:view.sort==='return'?p.gainLoss:dailyMove(p,quotes)
 return positions.filter(p=>view.filter==='all'||category(p)===view.filter).sort((a,b)=>{
  let order:number
  if(view.sort==='name')order=(a.account.symbol||a.account.name).localeCompare(b.account.symbol||b.account.name)
  else {const av=value(a),bv=value(b);if(av==null||bv==null)return av==null&&bv==null?a.account.id.localeCompare(b.account.id):av==null?1:-1;order=av-bv}
  return (view.direction==='asc'?order:-order)||a.account.id.localeCompare(b.account.id)
 })
}
export const palette=['hsl(var(--primary))','hsl(var(--forecast))','hsl(var(--success))','hsl(var(--destructive))','hsl(var(--muted-foreground))']
export function allocationRows(positions:Position[],mode:OverviewView['allocation']) {
 const grouped=new Map<string,Position[]>()
 for(const p of positions){const key=mode==='holding'?p.account.id:mode==='type'?category(p):p.metrics.native_currency||'Unknown quote currency';grouped.set(key,[...(grouped.get(key)??[]),p])}
 const total=sumAvailable(positions.map(p=>p.currentValue)),complete=total!==null&&total>0&&positions.every(p=>p.currentValue!==null&&p.currentValue>=0)
 return {complete,total,rows:[...grouped].map(([key,items],i)=>({key,items,label:mode==='holding'?items[0].account.symbol||items[0].account.name:mode==='type'?categoryLabel(items[0]):key,
  value:sumAvailable(items.map(p=>p.currentValue)),weight:complete?items.reduce((sum,p)=>sum+p.currentValue!,0)/total*100:null,color:palette[i%palette.length]}))}
}
