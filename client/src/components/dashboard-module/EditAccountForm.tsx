import type { FormEvent, ReactNode } from 'react'
import { Archive, Lock, LockOpen, Trash2 } from 'lucide-react'
import { AmountInput } from '../common/amount-input'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { formatAmount, parseAmount } from '../../lib/amount'
import { cn } from '../../lib/utils'

export type AccountFormData = {
  name: string
  type: 'cash' | 'investment'
  balance: string
  currency: string
  quote_currency: string
  symbol: string
  asset_type: 'stock' | 'crypto' | 'manual'
  adjustWithTransaction: boolean
  exclude_from_net_worth: boolean
  exclude_from_cash_balance: boolean
}

type Props = {
  value: AccountFormData
  savedBalance: number
  savedCurrency: string
  savedName: string
  onChange: (value: AccountFormData) => void
  onSubmit: (event: FormEvent) => void
  onRevert: () => void
  onCancel: () => void
  dirty: boolean
  locked: boolean
  archived: boolean
  busy: boolean
  saving: boolean
  hidden: boolean
  onLock: () => void
  onArchive: () => void
  onAskDelete: () => void
  confirmingDelete: boolean
  deleteName: string
  onDeleteName: (name: string) => void
  onCancelDelete: () => void
  onDelete: () => void
  deleting: boolean
}

const currencies = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'MXN']
const controlClass = 'h-9 rounded-[10px] bg-background'

function ManageAction({ icon, title, description, disabled, destructive, onClick }: {
  icon: ReactNode; title: string; description?: string; disabled?: boolean; destructive?: boolean; onClick: () => void
}) {
  return <button type="button" aria-label={title} disabled={disabled} onClick={onClick}
    className={cn('flex w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50', destructive && 'text-destructive hover:bg-destructive/10')}>
    {icon}
    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span>
      {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
    </span>
  </button>
}

export function EditAccountForm(props: Props) {
  const { value, onChange, locked, archived, busy, hidden } = props
  const readOnly = locked || archived
  const balance = value.balance.trim() === '' ? 0 : parseAmount(value.balance)
  const difference = balance === null ? null : balance - props.savedBalance
  const changed = difference !== null && difference !== 0
  const quantity = value.type === 'investment'
  const amountOptions = { maximumFractionDigits: 8, minimumFractionDigits: quantity ? 0 : 2 }
  const differenceText = hidden ? '••••••' : `${difference !== null && difference > 0 ? '+' : ''}${formatAmount(difference ?? 0, amountOptions)}`
  const update = <K extends keyof AccountFormData>(key: K, next: AccountFormData[K]) => onChange({ ...value, [key]: next })

  return <form onSubmit={props.onSubmit} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-3 sm:px-6">
      {readOnly && <div role="status" className="flex items-center gap-2.5 rounded-[10px] bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-700 dark:text-amber-300">
        {archived ? <Archive className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
        <span className="flex-1">{archived ? 'This account is archived. Restore it to edit.' : 'This account is locked. Unlock it to edit.'}</span>
        <button type="button" disabled={busy} onClick={archived ? props.onArchive : props.onLock} className="font-semibold disabled:opacity-50">{archived ? 'Restore' : 'Unlock'}</button>
      </div>}
      <fieldset disabled={readOnly || busy} className="min-w-0 space-y-2.5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Label htmlFor="edit-balance" className="text-[13px]">{quantity ? 'Quantity' : 'Balance'}</Label>
            <span className="text-xs tabular-nums text-muted-foreground">Saved: {hidden ? '••••••' : formatAmount(props.savedBalance, amountOptions)} {props.savedCurrency}</span>
          </div>
          <div className="flex h-[52px] items-center gap-2.5 rounded-xl border border-border bg-background px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            {readOnly && hidden ? <Input id="edit-balance" value="••••••" readOnly className="border-0 bg-transparent p-0 text-[26px]" /> : <AmountInput id="edit-balance" value={value.balance} onValueChange={next => update('balance', next)} allowNegative placeholder="0"
              className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-[26px] font-semibold tracking-tight tabular-nums hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0" />}
            <span className="text-[15px] font-medium text-muted-foreground">{value.currency}</span>
          </div>
          {balance === null && <p role="status" className="text-xs text-destructive">Enter a complete balance to save.</p>}
          {changed && <div className="space-y-2.5 rounded-xl bg-secondary p-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="text-muted-foreground">Difference</span>
              <span className={cn('rounded-full px-2 py-0.5 font-semibold tabular-nums', hidden ? 'bg-background text-muted-foreground' : difference! > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{differenceText} {value.currency}</span>
            </div>
            <div role="group" aria-label="Balance adjustment method" className="grid grid-cols-2 gap-1 rounded-[9px] border border-border/50 bg-background p-[3px]">
              {[{ transaction: true, label: 'Record as transaction' }, { transaction: false, label: 'Overwrite balance' }].map(mode => <button key={mode.label} type="button" aria-pressed={value.adjustWithTransaction === mode.transaction} onClick={() => update('adjustWithTransaction', mode.transaction)}
                className={cn('min-h-[30px] rounded-md px-1 py-1 text-[13px] font-medium', value.adjustWithTransaction === mode.transaction ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{mode.label}</button>)}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{value.adjustWithTransaction
              ? `An adjustment transaction for ${differenceText} ${value.currency} will be added, so history stays consistent. Choose its details after saving.`
              : 'The balance is replaced directly. No transaction is created and past totals won’t reflect the difference.'}</p>
          </div>}
        </div>
        <div className="space-y-2">
          <div className="space-y-1"><Label htmlFor="edit-name" className="text-[13px]">Name</Label><Input id="edit-name" value={value.name} onChange={event => update('name', event.target.value)} required className={controlClass} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="edit-type" className="text-[13px]">Type</Label><Select id="edit-type" value={value.type} onChange={event => update('type', event.target.value as AccountFormData['type'])} className={controlClass}><option value="cash">💵 Cash / Bank</option><option value="investment">📈 Investment</option></Select></div>
            {(!quantity || value.asset_type === 'manual') && <div className="space-y-1"><Label htmlFor="edit-currency" className="text-[13px]">Currency</Label><Select id="edit-currency" value={value.currency} onChange={event => update('currency', event.target.value)} className={controlClass}>
              {[...new Set([...currencies, value.currency])].map(currency => <option key={currency} value={currency}>{currency}</option>)}
            </Select></div>}
            {quantity && value.asset_type !== 'manual' && <div className="space-y-1"><Label htmlFor="edit-quote-currency" className="text-[13px]">Trading currency</Label><Select id="edit-quote-currency" value={value.quote_currency} onChange={event => update('quote_currency', event.target.value)} className={controlClass}>
              {[...new Set([...currencies, value.quote_currency])].map(currency => <option key={currency} value={currency}>{currency}</option>)}
            </Select></div>}
          </div>
          {quantity && value.asset_type === 'manual' && <div className="space-y-1"><Label htmlFor="edit-symbol" className="text-[13px]">Symbol (optional)</Label><Input id="edit-symbol" value={value.symbol} onChange={event => update('symbol', event.target.value.slice(0, 5))} maxLength={5} className={controlClass} /></div>}
          {quantity && value.asset_type !== 'manual' && value.symbol && <div className="rounded-xl bg-secondary/50 p-3 text-sm"><span className="font-semibold">{value.symbol}</span><span className="ml-2 text-muted-foreground">Holding unit: {value.currency}</span></div>}
        </div>
        <section aria-label="Include in totals" className="space-y-1.5">
          <h3 className="text-[13px] font-medium">Include in totals</h3>
          <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
            {[{ key: 'exclude_from_net_worth' as const, label: 'Net worth', description: 'Include this account in your total net worth.' }, ...(!quantity ? [{ key: 'exclude_from_cash_balance' as const, label: 'Cash balance', description: 'Include this account in available cash totals.' }] : [])].map(toggle => <button key={toggle.key} type="button" role="switch" aria-checked={!value[toggle.key]} aria-label={toggle.label} onClick={() => update(toggle.key, !value[toggle.key])} className="flex w-full items-center gap-3.5 px-3.5 py-2 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50">
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{toggle.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{toggle.description}</span></span>
              <span aria-hidden="true" className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', value[toggle.key] ? 'bg-border' : 'bg-primary')}><span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]', value[toggle.key] ? 'left-0.5' : 'left-[18px]')} /></span>
            </button>)}
          </div>
        </section>
      </fieldset>
      <section aria-label="Account actions" className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3"><h3 className="text-[13px] font-medium">Manage</h3><span className="text-xs text-muted-foreground">Applies immediately</span></div>
        <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
          {!archived && <ManageAction icon={locked ? <LockOpen className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />} title={locked ? 'Unlock account' : 'Lock account'} description={locked ? 'Allow edits and new transactions again.' : 'Prevent edits and new transactions.'} disabled={busy || props.confirmingDelete} onClick={props.onLock} />}
          <ManageAction icon={<Archive className="h-4 w-4 shrink-0" />} title={archived ? 'Restore account' : 'Archive account'} description={archived ? 'Return to active choices. Schedules stay paused.' : 'Needs zero balance, an unlocked account, and no pending items.'} disabled={busy || props.confirmingDelete || (!archived && (locked || props.savedBalance !== 0))} onClick={props.onArchive} />
          {props.confirmingDelete ? <div className="space-y-2.5 bg-destructive/10 px-3.5 py-3">
            <p className="text-[13px] leading-relaxed">Delete <b>{props.savedName}</b> and all its transactions, investment history, and recurring schedules? This can’t be undone. Linked transfers block deletion to protect the other account.</p>
            <Label htmlFor="edit-delete-name" className="text-xs">Type {props.savedName} to confirm</Label><Input id="edit-delete-name" value={props.deleteName} onChange={event => props.onDeleteName(event.target.value)} disabled={busy} autoComplete="off" />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={props.onCancelDelete}>Cancel deletion</Button><Button type="button" variant="destructive" size="sm" disabled={busy || props.deleteName !== props.savedName} onClick={props.onDelete}>{props.deleting ? 'Deleting…' : 'Delete permanently'}</Button></div>
          </div> : <ManageAction icon={<Trash2 className="h-4 w-4 shrink-0" />} title="Delete permanently" destructive disabled={busy || readOnly} onClick={props.onAskDelete} />}
        </div>
      </section>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-border/50 bg-card px-5 py-2.5 sm:px-6">
      <div className="mr-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground max-[420px]:w-full">
        {props.dirty && <><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /><span>Unsaved changes</span><button type="button" disabled={busy || props.confirmingDelete} onClick={props.onRevert} className="text-foreground underline underline-offset-2 disabled:opacity-50">Revert</button></>}
      </div>
      <Button type="button" variant="outline" className="h-9 px-3.5" disabled={busy} onClick={props.onCancel}>Cancel</Button>
      <Button type="submit" className="h-9 px-4 shadow-none" disabled={!props.dirty || readOnly || busy || balance === null || props.confirmingDelete}>{props.saving ? 'Saving…' : 'Save changes'}</Button>
    </div>
  </form>
}
