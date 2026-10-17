import { useUnsavedChanges } from '../../navigation/UnsavedChanges'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ManualValuation } from '../../../../shared/manual-valuation'
import { validHoldingNumber, validLocalDate } from '../../../../shared/holding'
import { API_BASE_URL, apiFetch } from '../../config'
import { useAlert } from '../../context/AlertContext'
import { AmountInput } from '../common/amount-input'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { formatAmount, parseAmount } from '../../lib/amount'
import { localAccountDate } from '../dashboard-module/account-form'
import type { Account } from './types'

type History = { observations: ManualValuation[]; valuation_at: ManualValuation | null; next_cursor: string | null; at?: string }
type Editor = { date: string; amount: string; target: ManualValuation | null; ready: boolean }
const amountText = (v: number) => formatAmount(v,{maximumFractionDigits:12})

export function ManualValuations({ account, hidden, onSaved }: { account: Account; hidden: boolean; onSaved: () => void }) {
  const { showAlert } = useAlert()
  const [history,setHistory] = useState<History | null>(null)
  const [error,setError] = useState<string | null>(null)
  const [loading,setLoading] = useState(false)
  const [saving,setSaving] = useState(false)
  const [editor,setEditor] = useState<Editor | null>(null)
  const selection = useRef(0)
  useUnsavedChanges(Boolean(editor)||saving)
  const protectedAccount = account.is_locked || account.archived_at != null
  const total = account.asset_type === 'manual'
  const currency = total ? account.currency : account.quote_currency
  const read = useCallback(async (query = '', signal?: AbortSignal): Promise<History> => {
    const response = await apiFetch(`${API_BASE_URL}/accounts/${encodeURIComponent(account.id)}/valuations${query}`,{throwOnError:true,signal})
    const value = await response.json() as History
    const valid = (v: ManualValuation) => v && typeof v.id === 'string' && v.account_id === account.id
      && validLocalDate(v.effective_date) && validHoldingNumber(v.amount) && typeof v.currency === 'string'
      && (v.kind==='total'||v.kind==='per_unit') && Number.isInteger(v.version) && v.version>0
    if (!value || !Array.isArray(value.observations) || !value.observations.every(valid)
      || (value.valuation_at!==null && !valid(value.valuation_at))
      || (value.next_cursor!==null && !validLocalDate(value.next_cursor))) throw new Error('Invalid valuation history response')
    return value
  },[account.id])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void read('',controller.signal).then(value => { setHistory(value); setError(null) }).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error?e.message:'Could not load valuation history')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
    // A saved appraisal reloads explicitly; account refresh must not overwrite an editor draft.
  },[read])
  const chooseDate = async (date: string) => {
    const request = ++selection.current
    setEditor(prev => ({ date,amount:prev?.amount??'',target:null,ready:false }))
    if (!validLocalDate(date) || date > localAccountDate()) return
    try {
      const value = await read(`?at=${encodeURIComponent(date)}&limit=1`)
      if (request !== selection.current) return
      setEditor(prev => prev && ({...prev,target:value.valuation_at?.effective_date===date?value.valuation_at:null,ready:true}))
      setError(null)
    } catch (e) { if (request===selection.current) setError(e instanceof Error?e.message:'Could not check the saved observation') }
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const amount = editor ? parseAmount(editor.amount) : null
    if (!editor?.ready || amount===null || !validHoldingNumber(amount) || hidden || saving || protectedAccount) return
    setSaving(true)
    try {
      await apiFetch(`${API_BASE_URL}/accounts/${encodeURIComponent(account.id)}/valuations`,{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({effective_date:editor.date,amount,
          expected_version:editor.target?.version??0,expected_id:editor.target?.id??null}) })
      setEditor(null); ++selection.current
      showAlert({type:'success',message:'Valuation saved. No cash or invested capital changed.'})
      onSaved()
      setHistory(await read()); setError(null)
    } catch (e) {
      const message = e instanceof Error?e.message:'Could not save valuation'
      setError(message); showAlert({type:'error',message})
    } finally { setSaving(false) }
  }
  const loadOlder = async () => {
    if (!history?.next_cursor || loading) return
    setLoading(true)
    try {
      const page = await read(`?before=${encodeURIComponent(history.next_cursor)}`)
      setHistory(prev => prev && ({...prev,observations:[...prev.observations,...page.observations],next_cursor:page.next_cursor})); setError(null)
    } catch (e) { setError(e instanceof Error?e.message:'Could not load older appraisals') }
    finally { setLoading(false) }
  }
  const observations = history?.observations??[]
  const points = [...observations].reverse().map(v => ({date:v.effective_date,time:Date.parse(`${v.effective_date}T00:00:00Z`),value:v.amount}))
  const through = history?.at ?? localAccountDate()
  if (points.length && points[points.length-1].date < through) points.push({date:through,time:Date.parse(`${through}T00:00:00Z`),value:points[points.length-1].value})
  const status = account.manual_valuation
  return <section aria-label="Manual valuation history" className="space-y-4 rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-semibold">Valuation history</h3>
        <p className="text-sm text-muted-foreground">{status?.as_of ? `${status.observation?.source === 'baseline' ? 'Last recorded observation' : 'Last valued'} ${status.as_of} · ${status.age_days ?? 'Unknown'} days ago` : 'No dated valuation yet'}{status?.status==='stale'?' · Update suggested (90 days)':''}</p>
        <p className="text-xs text-muted-foreground">{total?'Total asset value':'Price per unit'} in {currency}. Appraisals do not move cash, units or invested capital.</p>
      </div>
      <Button variant="outline" disabled={Boolean(protectedAccount)||saving||hidden} onClick={() => {setEditor(null);void chooseDate(localAccountDate())}}>Update value</Button>
    </div>
    {account.manual_ownership && <p className="text-xs text-muted-foreground">Ownership: {account.manual_ownership}. A zero appraisal does not dispose of an owned asset. Appraisals never acquire assets; record a purchase with a cash transfer.</p>}
    {hidden && <p className="text-sm text-muted-foreground">Values hidden. Reveal amounts to update an appraisal.</p>}
    {editor && <form aria-label="Update valuation" onSubmit={save} className="space-y-3 rounded-lg bg-secondary/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="valuation-date">Value as of</Label><Input id="valuation-date" type="date" max={localAccountDate()} value={editor.date} disabled={saving} onChange={e => {void chooseDate(e.target.value)}} required /></div>
        <div className="space-y-1"><Label htmlFor="valuation-amount">{total?'Total value':'Price per unit'} ({currency})</Label><AmountInput id="valuation-amount" value={hidden?'••••••':editor.amount} readOnly={hidden} disabled={saving} onValueChange={amount => setEditor(prev => prev && ({...prev,amount}))} required /></div>
      </div>
      <p className="text-xs text-muted-foreground">{editor.ready?editor.target?'This corrects the saved observation on this date. Its previous value stays in the audit trail.':'This adds a dated observation. A later current appraisal stays current.':'Checking the saved observation…'} A known zero is allowed.</p>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving||!editor.ready||hidden||parseAmount(editor.amount)===null||!validHoldingNumber(parseAmount(editor.amount)??-1)||Boolean(protectedAccount)}>{saving?'Saving…':'Save valuation'}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => {++selection.current;setEditor(null)}}>Cancel</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => {void chooseDate(editor.date)}}>Reload saved observation</Button></div>
    </form>}
    {error && <div role="alert" className="text-sm text-destructive">{error} <button className="underline" onClick={() => { setLoading(true);void read().then(setHistory).then(() => setError(null)).catch(e => setError(e.message)).finally(() => setLoading(false)) }}>Retry history</button></div>}
    {!hidden && points.length>1 && <div className="h-40" role="img" aria-label={`${total?'Total value':'Unit price'} step chart in ${currency}`}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={points}><XAxis dataKey="time" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={value => new Date(Number(value)).toISOString().slice(0,10)} tick={{fontSize:11,fill:'hsl(var(--muted-foreground))'}} minTickGap={50} /><YAxis width={72} tick={{fontSize:11,fill:'hsl(var(--muted-foreground))'}} />
        <Tooltip labelFormatter={value => new Date(Number(value)).toISOString().slice(0,10)} formatter={value => [`${amountText(Number(value))} ${currency}`,total?'Total value':'Unit price']} contentStyle={{background:'hsl(var(--card))',borderColor:'hsl(var(--border))',color:'hsl(var(--foreground))'}} />
        <Line type="stepAfter" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
    </div>}
    <div className="max-h-64 overflow-y-auto divide-y divide-border">
      {observations.map(v => <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div><span>{v.effective_date}</span><span className="ml-2 text-xs text-muted-foreground">{v.source==='baseline'?'Legacy observation · earlier history unknown':v.source==='initial'?'Starting observation':v.source==='acquisition'?'Initial acquisition value':'Appraisal'}</span></div>
        <div className="flex items-center gap-3"><span className="tabular-nums">{hidden?'••••••':`${amountText(v.amount)} ${v.currency}`}</span>
          <button aria-label={`Correct ${v.effective_date}`} disabled={Boolean(protectedAccount)||saving||hidden} className="text-xs text-primary disabled:opacity-50" onClick={() => {++selection.current;setEditor({date:v.effective_date,amount:amountText(v.amount),target:v,ready:true})}}>Correct<span className="sr-only"> {v.effective_date}</span></button></div>
      </div>)}
    </div>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading valuations…</p>}
    {!loading && !error && history && observations.length===0 && <p className="text-sm text-muted-foreground">No valuations recorded. Earlier values are unknown.</p>}
    {history?.next_cursor && <Button variant="ghost" disabled={loading} onClick={() => {void loadOlder()}}>Load older valuations</Button>}
  </section>
}
