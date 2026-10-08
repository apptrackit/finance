import type { FormEvent } from 'react'
import { Search, TrendingUp, Wallet } from 'lucide-react'
import { AmountInput } from '../common/amount-input'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { parseAmount } from '../../lib/amount'
import { cn } from '../../lib/utils'
import type { AccountFormData } from './account-form'
import { accountControlClass, accountCurrencies } from './account-form'
import { AccountTotalsSwitches } from './AccountTotalsSwitches'

const currencyFlags: Record<string, string> = { HUF: '🇭🇺', EUR: '🇪🇺', USD: '🇺🇸', GBP: '🇬🇧', CHF: '🇨🇭', MXN: '🇲🇽' }

type Props = {
  value: AccountFormData
  onChange: (value: AccountFormData) => void
  onTypeChange: (type: AccountFormData['type']) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
  onSearchAsset: () => void
  onManualAsset: () => void
  busy: boolean
}

export function AddAccountForm({ value, onChange, onTypeChange, onSubmit, onCancel, onSearchAsset, onManualAsset, busy }: Props) {
  const investment = value.type === 'investment'
  const manual = investment && value.asset_type === 'manual'
  const marketAsset = investment && !manual
  const assetMissing = marketAsset && !value.symbol
  const invalidBalance = value.balance.trim() !== '' && parseAmount(value.balance) === null
  const invalid = !value.name.trim() || invalidBalance || assetMissing
  const update = <K extends keyof AccountFormData>(key: K, next: AccountFormData[K]) => onChange({ ...value, [key]: next })

  return <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 overflow-y-auto px-5 py-3 sm:px-6">
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="create-account-name" className="text-[13px]">Name</Label>
          <Input id="create-account-name" value={value.name} onChange={event => update('name', event.target.value)}
            placeholder="e.g. OTP Bank" required maxLength={100} className={accountControlClass} />
        </div>
        <fieldset role="radiogroup" aria-label="Type" className="min-w-0 space-y-1.5">
          <legend className="text-[13px] font-medium text-foreground/80">Type</legend>
          <div className="grid grid-cols-2 gap-2">
            {([{ type: 'cash', label: 'Cash / Bank', icon: Wallet }, { type: 'investment', label: 'Investment', icon: TrendingUp }] as const).map(option => {
              const selected = value.type === option.type
              const Icon = option.icon
              return <label key={option.type} className="relative min-w-0 cursor-pointer">
                <input type="radio" name="account-type" value={option.type} checked={selected}
                  onChange={() => onTypeChange(option.type)} className="peer sr-only" />
                <span className={cn('flex h-11 items-center gap-2.5 rounded-[10px] border px-3 text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
                  selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-background hover:bg-secondary')}>
                  <Icon className={cn('h-4 w-4 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                  <span>{option.label}</span>
                </span>
              </label>
            })}
          </div>
        </fieldset>
        {investment && <section aria-label="Investment asset" className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-medium">Asset</h3>
            {manual && <button type="button" onClick={onSearchAsset} className="text-xs text-primary hover:underline disabled:opacity-50">Search instead</button>}
          </div>
          {manual ? <div className="space-y-1">
            <Label htmlFor="create-account-symbol" className="text-xs">Symbol (optional)</Label>
            <Input id="create-account-symbol" value={value.symbol} onChange={event => update('symbol', event.target.value.slice(0, 5))}
              placeholder="e.g. MÁP+" maxLength={5} className={accountControlClass} />
          </div> : value.symbol ? <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2">
            <div className="min-w-0"><p className="text-sm font-semibold">{value.symbol}</p><p className="text-xs text-muted-foreground">{value.asset_type === 'crypto' ? 'Cryptocurrency' : 'Stock'} · {value.currency}</p></div>
            <button type="button" onClick={onSearchAsset} className="text-xs text-primary hover:underline disabled:opacity-50">Change</button>
          </div> : <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-9 flex-1 justify-start text-muted-foreground" onClick={onSearchAsset}><Search className="h-4 w-4" />Search for asset…</Button>
            <button type="button" onClick={onManualAsset} className="text-xs text-primary hover:underline disabled:opacity-50">Enter manually</button>
          </div>}
          {marketAsset && value.symbol && <div className="space-y-1">
            <Label htmlFor="create-quote-currency" className="text-[13px]">Trading currency</Label>
            <Select id="create-quote-currency" value={value.quote_currency} onChange={event => update('quote_currency', event.target.value)} className={accountControlClass}>
              {[...new Set([...accountCurrencies, value.quote_currency])].map(currency => <option key={currency} value={currency}>{currency}</option>)}
            </Select>
          </div>}
        </section>}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Label htmlFor="create-account-balance" className="text-[13px]">{marketAsset ? 'Starting quantity' : 'Starting balance'}</Label>
            <span className="text-xs text-muted-foreground">{marketAsset ? '0 if tracking from transactions' : 'You can change it later'}</span>
          </div>
          <div className="flex h-[52px] items-center gap-1.5 rounded-xl border border-border bg-background pl-4 pr-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <AmountInput id="create-account-balance" value={value.balance} onValueChange={next => update('balance', next)}
              allowNegative placeholder={marketAsset ? '0' : '0.00'}
              className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-[26px] font-semibold tracking-tight tabular-nums hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0" />
            {marketAsset ? <span className="shrink-0 px-2 text-sm font-medium text-muted-foreground">{assetMissing ? 'Units' : value.currency}</span> : <div className="shrink-0">
              <Select aria-label="Currency" value={value.currency} onChange={event => update('currency', event.target.value)} className="h-9 w-auto rounded-lg border-border/50 bg-secondary pl-2.5 pr-8 text-sm font-medium">
                {accountCurrencies.map(currency => <option key={currency} value={currency}>{currencyFlags[currency]} {currency}</option>)}
              </Select>
            </div>}
          </div>
          {invalidBalance && <p role="status" className="text-xs text-destructive">Enter a complete balance to create the account.</p>}
        </div>
        <AccountTotalsSwitches value={value} onChange={onChange} />
      </fieldset>
    </div>
    <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border/50 bg-card px-5 py-2.5 sm:px-6">
      <Button type="button" variant="outline" className="h-9 px-3.5" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button type="submit" className="h-9 px-4 shadow-none" disabled={busy || invalid}>{busy ? 'Creating…' : 'Create account'}</Button>
    </div>
  </form>
}
