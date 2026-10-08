import type { AccountFormData } from './account-form'
import { cn } from '../../lib/utils'

export function AccountTotalsSwitches({ value, onChange }: {
  value: AccountFormData
  onChange: (value: AccountFormData) => void
}) {
  const toggles = [
    { key: 'exclude_from_net_worth' as const, label: 'Net worth', description: 'Include this account in your total net worth.' },
    ...(value.type === 'cash' ? [
      { key: 'exclude_from_cash_balance' as const, label: 'Cash balance', description: 'Include this account in available cash totals.' },
    ] : []),
  ]

  return <section aria-label="Include in totals" className="space-y-1.5">
    <h3 className="text-[13px] font-medium">Include in totals</h3>
    <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
      {toggles.map(toggle => <button key={toggle.key} type="button" role="switch"
        aria-checked={!value[toggle.key]} aria-label={toggle.label}
        onClick={() => onChange({ ...value, [toggle.key]: !value[toggle.key] })}
        className="flex w-full items-center gap-3.5 px-3.5 py-2 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{toggle.label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{toggle.description}</span>
        </span>
        <span aria-hidden="true" className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', value[toggle.key] ? 'bg-border' : 'bg-primary')}>
          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]', value[toggle.key] ? 'left-0.5' : 'left-[18px]')} />
        </span>
      </button>)}
    </div>
  </section>
}
