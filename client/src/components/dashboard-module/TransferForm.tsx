import {TradeMetricsPreview} from '../investments-module/TradeMetricsPreview'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowDownUp, ChevronsUpDown, Loader2 } from 'lucide-react'
import { AmountInput } from '../common/amount-input'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { formatCalculatedAmount, parseAmount } from '../../lib/amount'
import { cn } from '../../lib/utils'
import { tradeCurrencies } from '../../../../shared/investment-trade'
import { Select } from '../common/select'

export type TransferAccount = {
  id: string
  name: string
  balance: number
  currency: string
  type: 'cash' | 'investment'
  asset_type?: string
  quote_currency?: string
  is_locked?: boolean
  archived_at?: number | null
}

export type TransferFormData = {
  account_id: string
  to_account_id: string
  amount: string
  amount_to: string
  date: string
  description: string
  manual_price: string
  execution_currency?: string
  fee_status?: 'known' | 'unknown'
  fee_amount?: string
}

type TransferFormProps = {
  accounts: TransferAccount[]
  data: TransferFormData
  tradeId?: string
  tradeVersion?: number
  editing: boolean
  reviewDraft: boolean
  dirty: boolean
  submitting: boolean
  hideBalance: (account: TransferAccount) => boolean
  availableBalance: (account: TransferAccount) => number
  exchangeRate: string
  suggestedRate: number | null
  loadingRate: boolean
  error: string | null
  typeSelector?: ReactNode
  onAccountChange: (field: 'account_id' | 'to_account_id', id: string) => void
  onAmountChange: (amount: string) => void
  onReceivedChange: (amount: string) => void
  onRateChange: (rate: string) => void
  onUseMarket: () => void
  onSwap: () => void
  onChange: (patch: Partial<TransferFormData>) => void
  onPriceChange: (price: string) => void
  onRevert: () => void
  onCancel: () => void
}

const compactInput = 'finance-transfer-inline-input border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0'

export function TransferForm(props: TransferFormProps) {
  const { accounts, data, editing, reviewDraft, dirty, submitting } = props
  const from = accounts.find(account => account.id === data.account_id)
  const to = accounts.find(account => account.id === data.to_account_id)
  const holding = from?.type === 'investment' ? from : to?.type === 'investment' ? to : undefined
  const total = holding?.asset_type === 'manual'
  const zeroDisposal = total && from?.type === 'investment' && parseAmount(data.manual_price)===0 && parseAmount(data.amount_to)===0
  const sameCurrency = !holding && !!from && !!to && from.currency === to.currency
  const sameAccount = !!from && from.id === to?.id
  const sent = parseAmount(data.amount)
  const received = sameCurrency ? sent : parseAmount(data.amount_to)
  const rate = parseAmount(props.exchangeRate)
  const selectable = accounts.filter(account => !account.is_locked && account.archived_at == null && (!reviewDraft || account.type === 'cash'))
  const ready = from && to && !sameAccount && selectable.includes(from) && selectable.includes(to)
    && sent !== null && sent > 0 && received !== null && (received > 0 || zeroDisposal) && data.date
    && (!total || (from?.type==='investment'?sent:received)===1)
    && (!editing || dirty)
    && (!holding || ((parseAmount(data.manual_price) ?? -1) > 0 || zeroDisposal) && !!data.execution_currency
      && (data.fee_status === 'unknown' || parseAmount(data.fee_amount || '') !== null))
  const overBalance = from && from.asset_type !== 'manual' && sent !== null && sent > props.availableBalance(from)
  const deviation = props.suggestedRate && rate !== null && rate > 0 ? (rate / props.suggestedRate - 1) * 100 : null
  const displayAmount = (account: TransferAccount, value: number) => props.hideBalance(account)
    ? '••••••'
    : formatCalculatedAmount(value, { maximumFractionDigits: account.type === 'investment' ? 12 : 2 })
  const amountLabel = (account: TransferAccount | undefined, receiving: boolean) => account?.type === 'investment'
    ? account.asset_type === 'manual' ? 'Whole asset (1 ITEM)' : `Units to ${receiving ? 'Buy' : 'Sell'}`
    : `Amount to ${receiving ? 'Receive' : 'Send'}${account ? ` (${account.currency})` : ''}`

  const accountCard = (account: TransferAccount | undefined, receiving: boolean) => {
    const direction = receiving ? 'To' : 'From'
    const delta = receiving ? received : sent
    const field = receiving ? 'to_account_id' : 'account_id'
    const amountId = receiving ? 'transfer_amount_to' : 'transfer_amount'
    const after = account && account.asset_type !== 'manual' && delta !== null && delta > 0
      ? props.availableBalance(account) + (receiving ? delta : -delta)
      : null
    return (
      <div className="min-w-0 space-y-2 rounded-xl border border-border bg-background px-3.5 py-3 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
        <div className="flex min-w-0 items-center gap-2.5">
          <Label htmlFor={field} className="w-8 shrink-0 text-xs font-normal text-muted-foreground">{direction}</Label>
          <div className="relative -ml-2 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 hover:bg-secondary">
            <span className={cn('min-w-0 truncate text-sm font-medium', !account && 'text-muted-foreground')}>{account?.name || 'Choose account'}</span>
            {account && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{displayAmount(account, account.balance)} {account.currency}</span>}
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <select id={field} aria-label={`${direction} account`} value={data[field]} onChange={event => props.onAccountChange(field, event.target.value)} required disabled={submitting}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
              <option value="">Choose account</option>
              {selectable.map(option => <option key={option.id} value={option.id}>{option.name} · {displayAmount(option, option.balance)} {option.currency}</option>)}
            </select>
          </div>
        </div>
        <div className="flex min-w-0 items-baseline gap-2">
          <Label htmlFor={amountId} className="sr-only">{amountLabel(account, receiving)}</Label>
          <AmountInput id={amountId} value={receiving ? (sameCurrency ? data.amount : data.amount_to) : data.amount}
            onValueChange={receiving ? props.onReceivedChange : props.onAmountChange} placeholder="0" required
            disabled={submitting || (receiving && sameCurrency)}
            className={cn(compactInput, 'h-9 min-w-0 flex-1 rounded-none p-0 text-[28px] font-semibold tracking-tight tabular-nums disabled:opacity-100')} />
          <span className="text-[15px] font-medium text-muted-foreground">{account?.asset_type==='manual'?'ITEM':account?.currency}</span>
        </div>
        <p className={cn('min-h-4 text-xs tabular-nums text-muted-foreground', !receiving && after !== null && after < 0 && 'text-amber-600 dark:text-amber-300')}>
          {account && after !== null && <>{reviewDraft ? 'If confirmed' : 'After transfer'} <span className="ml-1">{displayAmount(account, after)} {account.currency}</span></>}
        </p>
      </div>
    )
  }

  return (
    <fieldset disabled={submitting} className="finance-transfer-form contents">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-5 sm:px-6">
        {props.typeSelector}
        <div>
          {accountCard(from, false)}
          <div className="flex min-h-12 items-center gap-3 px-1.5 py-2">
            <Button type="button" variant="outline" aria-label="Swap accounts" title="Swap accounts" onClick={props.onSwap}
              disabled={!from || !to || sameAccount} className="h-8 w-8 shrink-0 rounded-full p-0"><ArrowDownUp className="h-[15px] w-[15px]" /></Button>
            {holding ? <span className="text-xs text-muted-foreground">{total?'Enter exactly 1 ITEM for the complete asset, and actual cash':'Enter exact units and actual cash'} {from?.type === 'investment' ? 'received' : 'paid'}, including any fee.</span> : sameCurrency ? <span className="text-xs text-muted-foreground">Same currency, no conversion</span> : from && to ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {reviewDraft ? <p className="text-xs text-muted-foreground">Enter both amounts explicitly. Effective rate: {sent && received ? `${props.hideBalance(from) || props.hideBalance(to) ? '••••••' : formatCalculatedAmount(received / sent, { maximumFractionDigits: 10 })} ${to.currency} per ${from.currency}` : 'enter both amounts'}.</p> : <>
                  <div className="flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs tabular-nums text-muted-foreground focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
                    <span className="whitespace-nowrap">1 {from.currency} =</span>
                    <AmountInput aria-label="Exchange Rate" value={props.exchangeRate} onValueChange={props.onRateChange} placeholder="Rate"
                      className={cn(compactInput, 'h-7 w-20 min-w-0 rounded-none p-0 text-[13px] font-semibold tabular-nums')} />
                    <span>{to.currency}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" role="status">
                    {props.loadingRate ? <><Loader2 className="h-3 w-3 animate-spin" />Loading rate…</> : deviation !== null ? <>
                      <span className={cn(Math.abs(deviation) > 5 && 'text-amber-600 dark:text-amber-300')}>{Math.abs(deviation) < 0.05 ? 'Market rate' : `${Math.abs(deviation).toFixed(1)}% ${deviation < 0 ? 'below' : 'above'} market`}</span>
                      {Math.abs(deviation) >= 0.05 && <button type="button" onClick={props.onUseMarket} className="font-medium text-primary hover:underline">Use {formatCalculatedAmount(props.suggestedRate!, { maximumFractionDigits: 8 })}</button>}
                    </> : props.suggestedRate ? <button type="button" onClick={props.onUseMarket} className="font-medium text-primary hover:underline">Use market rate</button> : 'Market rate unavailable; enter amounts or a rate.'}
                  </div>
                </>}
              </div>
            ) : null}
          </div>
          {accountCard(to, true)}
        </div>
        {holding && <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5">
            <Label htmlFor="transfer_price">{total?'Executed total asset price':'Executed unit price'}</Label>
            <AmountInput id="transfer_price" value={data.manual_price} onValueChange={props.onPriceChange} placeholder="From your trade confirmation" required />
          </div><div className="space-y-1.5"><Label htmlFor="trade_execution_currency">Execution currency</Label>
            <Select id="trade_execution_currency" value={data.execution_currency || ''} onChange={e => props.onChange({ execution_currency:e.target.value })} required>
              <option value="">Choose currency</option>{tradeCurrencies.map(c => <option key={c}>{c}</option>)}
            </Select></div></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="trade_fee_status">Included fee</Label>
            <Select id="trade_fee_status" value={data.fee_status || 'known'} onChange={e => props.onChange({ fee_status:e.target.value as 'known'|'unknown' })}>
              <option value="known">Known amount</option><option value="unknown">Breakdown unknown</option>
            </Select></div>{data.fee_status !== 'unknown' && <div className="space-y-1.5"><Label htmlFor="trade_fee_amount">Fee ({from?.type === 'investment' ? to?.currency : from?.currency})</Label>
              <AmountInput id="trade_fee_amount" value={data.fee_amount || ''} onValueChange={v => props.onChange({ fee_amount:v })} placeholder="Enter 0 if none" required />
            </div>}</div>
          <p className="text-xs text-muted-foreground">The fee is already included in actual cash. It creates no extra expense. Confirm the execution price; a market quote is not a past fill.</p>
        </div>}
        {holding && <TradeMetricsPreview tradeId={props.tradeId} hidden={props.hideBalance(holding) || (!!from && props.hideBalance(from)) || (!!to && props.hideBalance(to))}
          input={from && to && sent!==null && received!==null && parseAmount(data.manual_price)!==null && data.execution_currency && (data.fee_status==='unknown' || parseAmount(data.fee_amount||'')!==null)?{
            holding_account_id:holding.id,cash_account_id:from.type==='investment'?to.id:from.id,type:from.type==='investment'?'sell':'buy',
            quantity:from.type==='investment'?sent:received,cash_amount:from.type==='investment'?received:sent,
            price:parseAmount(data.manual_price)!,execution_currency:data.execution_currency,fee_status:data.fee_status??'known',
            fee_amount:data.fee_status==='unknown'?null:parseAmount(data.fee_amount||''),date:data.date,notes:data.description,
            ...(props.editing?{expected_version:props.tradeVersion}:{}),
          }:null}/>}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <div className="space-y-1.5"><Label htmlFor="transfer_date">Date</Label><Input id="transfer_date" type="date" value={data.date} onChange={event => props.onChange({ date: event.target.value })} required className="min-w-0 rounded-[10px] bg-background" /></div>
          <div className="space-y-1.5"><Label htmlFor="transfer_description">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="transfer_description" value={data.description} onChange={event => props.onChange({ description: event.target.value })} placeholder="e.g. Monthly savings" className="rounded-[10px] bg-background" /></div>
        </div>
        {(sameAccount || props.error || overBalance) && <div role={sameAccount || props.error ? 'alert' : 'status'} className={cn('flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px]', sameAccount || props.error ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
          <AlertCircle className="h-4 w-4 shrink-0" /><span>{sameAccount ? 'From and To must be different accounts.' : props.error || (from && (props.hideBalance(from) ? 'Amount exceeds the available balance.' : `Amount is ${displayAmount(from, sent! - props.availableBalance(from))} ${from.currency} more than the available balance.`))}</span>
        </div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-border/50 px-5 py-3.5 sm:px-6">
        <div className={cn('mr-auto flex items-center gap-2 text-xs text-muted-foreground', editing && dirty && 'max-[400px]:basis-full')}>
          {editing && dirty && <><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Unsaved changes<button type="button" onClick={props.onRevert} className="text-foreground underline underline-offset-2">Revert</button></>}
        </div>
        <Button type="button" variant="outline" onClick={props.onCancel} className="h-9 px-3.5">Cancel</Button>
        <Button type="submit" disabled={!ready || submitting} className="h-9 max-w-full px-4 font-semibold shadow-none">
          {submitting ? 'Processing…' : editing ? 'Save changes' : holding ? from?.type === 'investment' ? 'Record sale' : 'Record purchase' : from && sent && !props.hideBalance(from) ? `Transfer ${formatCalculatedAmount(sent, { maximumFractionDigits: from.type === 'investment' ? 12 : 2 })} ${from.currency}` : 'Transfer'}
        </Button>
      </div>
    </fieldset>
  )
}
