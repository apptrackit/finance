import { parseAmount } from '../../lib/amount'
import { AmountInput } from '../common/amount-input'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import type { AccountFormData } from './account-form'
import { accountControlClass, accountCurrencies } from './account-form'

export function HoldingAccountFields({ value, onChange, editing = false, metadataLocked = false, hideAmounts = false, section = 'all' }: {
  value: AccountFormData; onChange: (value: AccountFormData) => void; editing?: boolean; metadataLocked?: boolean; hideAmounts?: boolean; section?: 'all' | 'identity' | 'opening'
}) {
  const total = value.asset_type === 'manual'
  const method = total ? 'manual' : value.pricing_method || 'market'
  const update = <K extends keyof AccountFormData>(key: K, next: AccountFormData[K]) => onChange({ ...value, [key]: next })
  const prefix = editing ? 'edit-holding' : 'create-holding'
  const categories = [['etf', 'ETF'], ['stock', 'Stock'], ['crypto', 'Crypto'], ['manual', 'Manual asset']] as const
  return <section aria-label={section === 'opening' ? 'Opening position' : 'Holding setup'} className="space-y-2.5">
    {section !== 'opening' && <>
    <div className="grid grid-cols-2 items-end gap-3">
      <div className="space-y-1"><Label htmlFor={`${prefix}-category`}>Asset category</Label>
        <Select id={`${prefix}-category`} value={value.asset_type} onChange={event => {
          const category = event.target.value as AccountFormData['asset_type']
          const currency = category === 'manual' ? (accountCurrencies.includes(value.currency) ? value.currency : 'HUF') : category === 'crypto' ? (value.asset_type === 'crypto' ? value.currency : 'BTC') : 'SHARE'
          onChange({ ...value, asset_type: category, currency,
            quote_currency: category === 'manual' ? currency : value.quote_currency,
            pricing_method: category === 'manual' ? 'manual' : method })
        }} className={accountControlClass}>
          {categories.map(([key, label]) => <option key={key} value={key} disabled={metadataLocked && key !== value.asset_type && !(['stock', 'etf'].includes(key) && ['stock', 'etf'].includes(value.asset_type))}>{label}</option>)}
        </Select>
      </div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-pricing`}>Pricing</Label>
        <Select id={`${prefix}-pricing`} value={method} disabled={total || metadataLocked} onChange={event => update('pricing_method', event.target.value as 'market' | 'manual')} className={accountControlClass}>
          <option value="market">Market price</option><option value="manual">Enter price manually</option>
        </Select>
      </div>
    </div>
    {!total && <div className="grid grid-cols-2 items-end gap-3">
      <div className="space-y-1"><Label htmlFor={`${prefix}-quote`}>Trading currency</Label>
        <Select id={`${prefix}-quote`} value={value.quote_currency} disabled={metadataLocked} onChange={event => update('quote_currency', event.target.value)} className={accountControlClass}>
          {!value.quote_currency && <option value="">Unknown — needs reconciliation</option>}
          {[...new Set([...accountCurrencies, value.quote_currency])].filter(Boolean).map(currency => <option key={currency} value={currency}>{currency}</option>)}
        </Select>
      </div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-unit`}>Holding unit</Label><Input id={`${prefix}-unit`} value={value.currency} readOnly={value.asset_type !== 'crypto' || metadataLocked} onChange={event => update('currency', event.target.value.toUpperCase())} className={accountControlClass} /></div>
    </div>}
    {editing && !total && <div className="space-y-1"><Label htmlFor={`${prefix}-symbol`}>Instrument symbol</Label><Input id={`${prefix}-symbol`} value={value.symbol} readOnly={metadataLocked} onChange={event => update('symbol', event.target.value.toUpperCase())} placeholder={method === 'manual' ? 'Optional' : 'e.g. SAMPLE.DE'} className={accountControlClass} /></div>}
    {method === 'manual' && !total && !editing && <div className="grid grid-cols-2 items-end gap-3">
      <div className="space-y-1"><Label htmlFor={`${prefix}-price`}>Manual price per unit</Label>{hideAmounts ? <Input id={`${prefix}-price`} value="••••••" readOnly className={accountControlClass} /> : <AmountInput id={`${prefix}-price`} value={value.manual_price || ''} onValueChange={next => update('manual_price', next)} placeholder="Unknown" className={accountControlClass} />}</div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-price-date`}>Price as of</Label><Input type="date" id={`${prefix}-price-date`} value={value.manual_price_date || ''} onChange={event => update('manual_price_date', event.target.value)} className={accountControlClass} /></div>
    </div>}
    {editing && method === 'manual' && <p className="text-xs text-muted-foreground">Use Update value in Investments → holding details for dated appraisals. Buying or selling uses a cash transfer.</p>}
    {method === 'market' && <div className="space-y-1"><Label htmlFor={`${prefix}-exchange`}>Exchange (optional)</Label><Input id={`${prefix}-exchange`} value={value.exchange || ''} disabled={metadataLocked} onChange={event => update('exchange', event.target.value)} className={accountControlClass} /></div>}
    {metadataLocked && <p className="text-xs text-muted-foreground">Instrument, units, currency and pricing are protected by existing history. Stock/ETF classification can be corrected without changing that history.</p>}
    </>}
    {section !== 'identity' && <>
    {total && (!editing || value.confirm_opening) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.manual_owned ?? (parseAmount(value.balance) ?? 0) > 0} onChange={e => update('manual_owned',e.target.checked)} />This asset is already owned (including a known zero appraisal)</label>}
    {!editing && !total && (parseAmount(value.balance) ?? 0) === 0 && <p className="text-xs text-muted-foreground">Start at zero and record each purchase or sale in Investments. Dates come from your trades.</p>}
    {editing && !total && <p className="text-xs text-muted-foreground">Recorded purchases and sales supply history when they explain your current units. Add a dated starting position only for units missing from that history.</p>}
    {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value.confirm_opening)} onChange={event => update('confirm_opening', event.target.checked)} />Set a starting position not recorded as trades</label>}
    {((!editing && (total || (parseAmount(value.balance) ?? 0) !== 0)) || value.confirm_opening) && <div className="space-y-2 rounded-xl border border-border p-3">
      {editing && <div className="space-y-1"><Label htmlFor={`${prefix}-opening-balance`}>{total ? 'Opening value' : 'Opening quantity'}</Label>{hideAmounts ? <Input id={`${prefix}-opening-balance`} value="••••••" readOnly className={accountControlClass} /> : <AmountInput id={`${prefix}-opening-balance`} value={value.opening_balance || ''} onValueChange={next => update('opening_balance', next)} className={accountControlClass} />}</div>}
      <div className="space-y-1"><Label htmlFor={`${prefix}-opening-date`}>Starting position as of (end of day)</Label><Input type="date" id={`${prefix}-opening-date`} value={value.opening_date || ''} onChange={event => update('opening_date', event.target.value)} className={accountControlClass} /></div>
      <p className="text-xs text-muted-foreground">{editing ? 'The opening plus later trades must match the current quantity. This records no cash movement.' : 'Use the date you already held this starting position. Record later purchases and sales separately.'}</p>
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="space-y-1"><Label htmlFor={`${prefix}-cost`}>Known remaining cost (optional)</Label>{hideAmounts ? <Input id={`${prefix}-cost`} value="••••••" readOnly className={accountControlClass} /> : <AmountInput id={`${prefix}-cost`} value={value.opening_cost || ''} onValueChange={next => update('opening_cost', next)} placeholder="Unknown" className={accountControlClass} />}</div>
        <div className="space-y-1"><Label htmlFor={`${prefix}-cost-currency`}>Cost currency</Label><Select id={`${prefix}-cost-currency`} value={value.opening_cost_currency || value.quote_currency || value.currency} onChange={event => update('opening_cost_currency', event.target.value)} className={accountControlClass}>{accountCurrencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}</Select></div>
      </div>
      <p className="text-xs text-muted-foreground">Leave cost blank if unknown. Opening cost does not establish earlier deposits or lifetime profit.</p>
    </div>}
    </>}
  </section>
}
