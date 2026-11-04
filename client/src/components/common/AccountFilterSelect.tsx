import { Select } from './select'

type AccountOption = {
  id: string
  name: string
  currency: string
  type: string
  archived_at?: number | null
}

export function AccountFilterSelect({ accounts, value, onChange, label, className, selectClassName }: {
  accounts: AccountOption[]
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
  selectClassName?: string
}) {
  const cashAccounts = accounts.filter(account => account.type === 'cash')
    .sort((a, b) => Number(a.archived_at != null) - Number(b.archived_at != null) || a.name.localeCompare(b.name))

  return <div className={className}>
    <Select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className={`truncate ${selectClassName ?? ''}`}>
      <option value="all">All accounts</option>
      {value !== 'all' && !cashAccounts.some(account => account.id === value) && (
        <option value={value}>Selected account (unavailable)</option>
      )}
      {cashAccounts.map(account => <option key={account.id} value={account.id}>
        {account.name} ({account.currency}){account.archived_at != null ? ' · Archived' : ''}
      </option>)}
    </Select>
  </div>
}
