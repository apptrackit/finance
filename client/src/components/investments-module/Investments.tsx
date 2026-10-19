import { investmentReportingCurrencies } from './reporting-currencies'
import { LegacyTradeDetails } from './LegacyTradeDetails'
import {useEffect,useRef,useState} from 'react'
import {Link,useOutletContext} from 'react-router'
import {Plus,RefreshCw} from 'lucide-react'
import type {FinancePageContext} from '../../App'
import {FinanceDataBoundary} from '../common/FinanceDataStatus'
import {Button} from '../common/button'
import {usePrivacy} from '../../context/PrivacyContext'
import {calculatePosition} from './utils'
import {PortfolioHistoryChart} from './PortfolioHistoryChart'
import {PortfolioSummary} from './PortfolioSummary'
import {PortfolioAllocation} from './PortfolioAllocation'
import {InvestmentAttention} from './InvestmentAttention'
import {HoldingsList} from './HoldingsList'
import {API_BASE_URL,apiFetch} from '../../config'
import {TradeEditor} from './TradeEditor'
import type {TradeEdit} from './trade-editor'
import type {Transaction} from './types'
import {InvestmentDetailModal} from './InvestmentDetailModal'
export function Investments() {
 const {investments,finance}=useOutletContext<FinancePageContext>()
 const {data,status,refresh,currencyDisplay,setCurrencyDisplay,overviewView,updateOverview}=investments
 const {privacyMode}=usePrivacy(),hidden=privacyMode==='hidden'
 const [legacyTradeId,setLegacyTradeId]=useState<string|null>(null)
 const [selected,setSelected]=useState<string|null>(null)
 const [editor,setEditor]=useState<{holdingId?:string;type?:'buy'|'sell';edit?:TradeEdit}|null>(null)
 const [editing,setEditing]=useState(false),[editError,setEditError]=useState<string|null>(null)
 const editController=useRef<AbortController|null>(null)
 useEffect(()=>()=>editController.current?.abort(),[])
 const editTrade=async(t:Transaction)=>{
  if(!t.linked_transaction_id){setLegacyTradeId(t.id);return}
  editController.current?.abort();const controller=new AbortController();editController.current=controller;setEditing(true);setEditError(null)
  try {
   const response=await apiFetch(`${API_BASE_URL}/investment-trades/${encodeURIComponent(t.id)}`,{throwOnError:true,signal:controller.signal})
   const value=await response.json() as TradeEdit
   if(value.trade?.id!==t.id||value.trade.trade_version!==t.trade_version||value.source_revision!==data?.sourceRevision||typeof value.cash_account_id!=='string')throw new Error('Investment records changed. Refresh prices, then open the trade again.')
   if(!controller.signal.aborted)setEditor({edit:value})
  } catch(e){if(!controller.signal.aborted)setEditError(e instanceof Error?e.message:'Could not read the linked trade')}
  finally{if(!controller.signal.aborted)setEditing(false)}
 }
 const saved=async()=>{investments.detailCache.clear();await finance.handleDataChange()}
 const closeDetail=()=>{editController.current?.abort();setEditing(false);setEditError(null);setSelected(null)}
 const accounts=data?.accounts??[],trades=data?.transactions??[],quotes=data?.quotes??{},metrics=data?.metrics[currencyDisplay]
 const positions=accounts.map(a=>calculatePosition(a,trades.filter(t=>t.account_id===a.id),quotes,data?.exchangeRates??{},metrics?.holdings.find(h=>h.account_id===a.id),currencyDisplay))
 const eligible=finance.accounts.filter(a=>!a.is_locked&&a.archived_at==null)
 const canTrade=eligible.some(a=>a.type==='investment')&&eligible.some(a=>a.type==='cash')
  &&finance.dataStatus.accounts.loaded&&!finance.dataStatus.accounts.error&&finance.dataStatus.categories.loaded&&!finance.dataStatus.categories.error
 const opening=accounts.find(a=>a.id===selected)??null
 const refreshing=status.loading||investments.history.loading
 return <FinanceDataBoundary label="Investments" datasets={[{label:'Investment portfolio',status}]}>
  <div className="@container space-y-4">
   <header className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 lg:justify-start">
    <h1 className="mr-auto hidden text-2xl font-semibold tracking-tight lg:block">Investments</h1>
    <p className="order-last w-full text-right text-[10px] text-muted-foreground lg:order-none lg:w-auto">{status.stale?'Saved snapshot':'As of'} {data?.asOf?new Date(data.asOf).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'unavailable'}</p>
    <Button type="button" variant="outline" size="icon" disabled={status.loading} onClick={()=>{void refresh()}} aria-label="Refresh prices" className="h-10 w-10"><RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin motion-reduce:animate-none':''}`}/></Button>
    <div role="group" aria-label="Investment reporting currency" className="flex rounded-lg border border-border p-0.5">{investmentReportingCurrencies.map(c=><button key={c} type="button" aria-pressed={currencyDisplay===c} onClick={()=>setCurrencyDisplay(c)} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${c===currencyDisplay?'bg-secondary text-foreground':'text-muted-foreground'}`}>{c}</button>)}</div>
    {canTrade?<Button type="button" onClick={()=>setEditor({})} className="h-10"><Plus className="h-4 w-4"/>Record trade</Button>:<Link to="/accounts" state={{addAccount:true,investment:accounts.length===0}} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">{accounts.length===0?'Add first holding':'Set up trade accounts'}</Link>}
   </header>
   <InvestmentAttention positions={positions} quotes={quotes} refreshing={status.loading} onRefresh={()=>{void refresh()}} onOpen={a=>setSelected(a.id)}/>
   <PortfolioSummary metrics={metrics} hidden={hidden} currency={currencyDisplay}/>
   <PortfolioHistoryChart history={investments.history} hidden={hidden} currency={currencyDisplay} currentValue={metrics?.total_value}/>
   <PortfolioAllocation positions={positions} view={overviewView} onChange={updateOverview} onOpen={a=>setSelected(a.id)} hidden={hidden} currency={currencyDisplay}/>
   <HoldingsList positions={positions} quotes={quotes} trends={data?.trends} privacyMode={privacyMode} view={overviewView} onViewChange={updateOverview} refreshing={status.loading} onOpenDetail={a=>setSelected(a.id)}/>
   {!editor&&!legacyTradeId&&<InvestmentDetailModal key={selected} account={opening} allTransactions={trades} quotes={quotes} exchangeRates={data?.exchangeRates??{}} privacyMode={privacyMode}
    onClose={closeDetail} metrics={metrics?.holdings.find(h=>h.account_id===selected)} reportingCurrency={currencyDisplay} onValuationSaved={()=>{void saved()}}
    canTrade={canTrade} onTrade={type=>setEditor({holdingId:selected??undefined,type})} onEdit={t=>{void editTrade(t)}} chartCache={investments.detailCache} revisionKey={`${data?.sourceRevision}:${data?.asOf}`} editing={editing} editError={editError}/>}
   {legacyTradeId&&<LegacyTradeDetails key={legacyTradeId} tradeId={legacyTradeId} hidden={hidden} onClose={()=>setLegacyTradeId(null)} onSaved={saved}/>}
   {editor&&<TradeEditor accounts={[...finance.accounts.filter(a=>a.type==='cash'),...accounts]} holdingId={editor.holdingId} type={editor.type} edit={editor.edit} quotes={quotes} rates={data?.exchangeRates??{}} hidden={hidden} currency={currencyDisplay} sourceRevision={data?.sourceRevision} onClose={()=>setEditor(null)} onSaved={saved}/>}
  </div>
 </FinanceDataBoundary>
}
