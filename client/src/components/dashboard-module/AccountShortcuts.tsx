import { useId, useState } from 'react'
import { NavLink } from 'react-router'
import { ChevronDown, Plus } from 'lucide-react'
import { usePrivacy } from '../../context/PrivacyContext'
import { sortAccountsByValue } from '../../lib/account-order'
import type { AccountSortValues, ValuedAccount } from '../../lib/account-order'
import { readSidebarAccountPreferences, saveSidebarAccountPreferences } from './sidebar-accounts.storage'
import type { SidebarAccountGroup, SidebarAccountPreferences } from './sidebar-accounts.storage'

type ShortcutAccount = ValuedAccount & { archived_at?: number | null }

const compactAmount = (amount: number, currency: string) =>
  `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(amount)} ${currency}`
const fullAmount = (amount: number, currency: string, quantity = false) =>
  `${amount.toLocaleString('hu-HU', { maximumFractionDigits: quantity ? 8 : 2 })} ${currency}`

export function AccountShortcuts({ accounts, values, reportingCurrency, status, valuationLoading }: {
  accounts: ShortcutAccount[]
  values: AccountSortValues
  reportingCurrency: string
  status: { loaded: boolean; error: boolean }
  valuationLoading: boolean
}) {
  const { privacyMode } = usePrivacy()
  const [preferences, setPreferences] = useState(readSidebarAccountPreferences)
  const contentId = useId()
  const activeAccounts = accounts.filter(account => account.archived_at == null)
  const updateGroup = (group: SidebarAccountGroup, changes: Partial<SidebarAccountPreferences[SidebarAccountGroup]>) => {
    const next = { ...preferences, [group]: { ...preferences[group], ...changes } }
    setPreferences(next)
    saveSidebarAccountPreferences(next)
  }

  const displayBalance = (account: ShortcutAccount) => {
    if (privacyMode === 'hidden') return '••••••'
    if (account.type !== 'investment') return compactAmount(account.balance, account.currency)
    const value = values[account.id]
    return typeof value === 'number' && Number.isFinite(value) ? compactAmount(value, reportingCurrency) : 'Unavailable'
  }
  const description = (account: ShortcutAccount) => {
    if (privacyMode === 'hidden') return account.name
    if (account.type !== 'investment') return `${account.name}\n${fullAmount(account.balance, account.currency)}`
    const value = values[account.id]
    const money = typeof value === 'number' && Number.isFinite(value) ? fullAmount(value, reportingCurrency) : 'Unavailable'
    return `${account.name}\nValue: ${money}\n${account.asset_type === 'manual' ? 'Saved value' : 'Holding'}: ${fullAmount(account.balance, account.currency, account.asset_type !== 'manual')}`
  }

  return <section className="mt-4 flex min-h-0 flex-1 flex-col py-1" aria-label="Account shortcuts">
    <div className="mb-1.5 flex shrink-0 items-center justify-between px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <NavLink to="/accounts" className="hover:text-foreground">Accounts</NavLink><NavLink to="/accounts" state={{ addAccount: true }} aria-label="Add account" className="flex items-center"><Plus className="h-3.5 w-3.5" /></NavLink>
    </div>
    <div className="finance-account-list min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Account list">
      {!status.loaded && <p className="px-2.5 py-2 text-xs text-muted-foreground">{status.error ? 'Accounts unavailable' : 'Loading accounts…'}</p>}
      {(['cash', 'investment'] as const).map(type => {
        const group = sortAccountsByValue(activeAccounts.filter(account => account.type === type), values)
        if (!group.length) return null
        const { collapsed } = preferences[type]
        const id = `${contentId}-${type}`
        return <section key={type} aria-label={type === 'cash' ? 'Cash account shortcuts' : 'Investment account shortcuts'} className="mb-2">
          <h2><button type="button" aria-label={`${type === 'cash' ? 'Cash accounts' : 'Investments'} (${group.length})`} aria-expanded={!collapsed} aria-controls={id} onClick={() => updateGroup(type, { collapsed: !collapsed })}
            className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ChevronDown aria-hidden="true" className={`h-3 w-3 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            <span className="flex-1">{type === 'cash' ? 'Cash accounts' : 'Investments'}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums">{group.length}</span>
          </button></h2>
          <div id={id} hidden={collapsed}>
            {group.map(account => <NavLink key={account.id} to="/accounts" state={{ editAccountId: account.id }} aria-label={`${account.name}, ${displayBalance(account)}`} title={description(account)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-secondary">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-sm ${type === 'investment' ? 'bg-violet-400' : 'bg-primary'}`} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{account.name}</span>
              <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{displayBalance(account)}</span>
            </NavLink>)}

          </div>
        </section>
      })}
      {activeAccounts.some(account => values[account.id] == null) && !valuationLoading && <p className="px-2.5 pt-2 text-[10px] text-muted-foreground">Unavailable values sort last.</p>}
      {status.loaded && activeAccounts.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">No active accounts yet</p>}
    </div>
    <NavLink to="/accounts" className="mt-1 block shrink-0 px-2.5 py-2 text-xs font-medium text-primary">Manage accounts →</NavLink>
  </section>
}
