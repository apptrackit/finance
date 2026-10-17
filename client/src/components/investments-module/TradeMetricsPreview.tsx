import {useEffect,useState} from 'react'
import {API_BASE_URL,apiFetch} from '../../config'
import type {TradeInput} from '../../../../shared/investment-trade'
import type {InvestmentMetricsSnapshot} from '../../../../shared/investment-metrics'
import {formatValue} from './utils'
export function TradeMetricsPreview({input,tradeId,hidden}:{input:Omit<TradeInput,'idempotency_key'>|null;tradeId?:string;hidden:boolean}) {
  const key=JSON.stringify([input,tradeId])
  const [state,setState]=useState<{key:string;data?:InvestmentMetricsSnapshot & {preview_trade_id:string};error?:boolean}|null>(null)
  useEffect(()=>{
    const [draft,target]=JSON.parse(key) as [Omit<TradeInput,'idempotency_key'>|null,string|undefined]
    if(!draft) return
    const controller=new AbortController()
    const timer=setTimeout(()=>{
      void apiFetch(`${API_BASE_URL}/investment-trades/preview${target?`?trade_id=${encodeURIComponent(target)}`:''}`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({...draft,idempotency_key:crypto.randomUUID()}),throwOnError:true,
      }).then(response=>response.json()).then(data=>{if(!controller.signal.aborted)setState({key,data})})
        .catch(()=>{if(!controller.signal.aborted)setState({key,error:true})})
    },400)
    return ()=>{clearTimeout(timer);controller.abort()}
  },[key])
  if(!input) return null
  const result=state?.key===key?state:null
  const metric=result?.data?.by_currency.HUF?.holdings[0]
  const show=(value:number|null|undefined,currency:string)=>hidden?'••••••':formatValue(value??null,undefined,currency)
  return <section aria-label="Trade accounting preview" className="rounded-xl border border-border p-3 text-sm space-y-1" role="status">
    <h4 className="font-medium">After this trade · estimate</h4>
    {!metric?<p className="text-muted-foreground">{result?.error?'Preview unavailable. Check trade details or retry; your draft is preserved.':'Calculating position and cost…'}</p>:<>
      <p>Position: {hidden?'••••••':metric.quantity?.toLocaleString(undefined,{maximumFractionDigits:12})??'Unavailable'} units</p>
      <p>Average remaining cost: {show(metric.native.average_cost,metric.native_currency)}</p>
      <p>Remaining basis: {show(metric.remaining_basis,'HUF')}</p>
      {input.type==='sell' && <p>Estimated gain on this sale: {show(metric.trade_realized[result!.data!.preview_trade_id],'HUF')}</p>}
      <p className="text-xs text-muted-foreground">Uses the saved accounting rules and dated FX. Unknown opening cost stays unavailable. Saving revalidates both accounts and the complete trade timeline.</p>
    </>}
  </section>
}
