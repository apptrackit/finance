import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, Plus, ArrowRight, ArrowLeft, Wallet, Tag, RefreshCw, FileText } from 'lucide-react'
import type { FinancePageContext } from '../../App'
import type { Transaction } from '../../hooks/useFinanceData'
import { useLoadableData } from '../../hooks/useLoadableData'
import { usePrivacy } from '../../context/PrivacyContext'
import { API_BASE_URL, apiFetch } from '../../config'
import { matchesText, matchesTransaction, transactionCurrency } from '../../lib/global-search'
import { Modal } from '../common/modal'
import { Button } from '../common/button'

type Schedule = { id: string; description?: string; account_id: string; to_account_id?: string; category_id?: string; amount: number; frequency: string; is_active: boolean }
type Result = { id: string; group: string; title: string; detail?: string; value?: string; icon: React.ReactNode; run: () => void; disabled?: boolean }
type Props = {
  isOpen: boolean; onClose: () => void; finance: Pick<FinancePageContext['finance'], 'accounts' | 'categories' | 'allTransactions' | 'upcomingTransactions' | 'dataStatus' | 'handleDataChange'>; canCompose: boolean; hasUnfinishedChanges: boolean;
  destinations: { key: string; label: string; icon: React.ReactNode }[]; onNewTransaction: () => void;
}

export function SearchPalette({ isOpen, onClose, finance, canCompose, hasUnfinishedChanges, destinations, onNewTransaction }: Props) {
  const navigate = useNavigate()
  const { privacyMode } = usePrivacy()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const showRecurring = destinations.some(item => item.key === 'recurring')
  const { data: schedules, status: scheduleStatus, load: loadSchedules } = useLoadableData<Schedule[]>([], false)
  const fetchSchedules = useCallback(() => loadSchedules(async () => {
    const response = await apiFetch(`${API_BASE_URL}/recurring-schedules`, { throwOnError: true })
    const data: unknown = await response.json()
    if (!Array.isArray(data) || !data.every(item => item && typeof item.id === 'string' && typeof item.account_id === 'string' && typeof item.amount === 'number' && Number.isFinite(item.amount) && typeof item.frequency === 'string')) throw new Error('Invalid recurring schedules')
    return data as Schedule[]
  }), [loadSchedules])
  useEffect(() => {
    if (!isOpen) return
    setQuery(''); setSelected(null); setActive(0); input.current?.focus()
    if (showRecurring) void fetchSchedules()
  }, [isOpen, fetchSchedules, showRecurring])
  const go = (path: string, state?: unknown) => { onClose(); void navigate(path, { state }) }
  const ready = (key: keyof typeof finance.dataStatus) => finance.dataStatus[key].loaded && !finance.dataStatus[key].error
  const accounts = ready('accounts') ? finance.accounts : []
  const categories = ready('categories') ? finance.categories : []
  const historyReady = ready('history') && ready('accounts') && ready('categories')
  const history = historyReady ? finance.allTransactions : []
  const pending = historyReady && ready('upcoming') ? finance.upcomingTransactions : []
  const matches = isOpen && query.trim() ? [...new Map([...history, ...pending].map(tx => [tx.id, tx])).values()]
    .filter(tx => matchesTransaction(query, tx, accounts, categories)).sort((a, b) => b.date.localeCompare(a.date)) : []
  const amount = (tx: Pick<Transaction, 'amount' | 'account_id'>) => privacyMode === 'hidden' ? '••••••' :
    `${tx.amount.toLocaleString('hu-HU', { maximumFractionDigits: 8 })} ${transactionCurrency(accounts.find(account => account.id === tx.account_id))}`
  const viewAll = () => go('/dashboard?range=allTime', { transactionSearch: query.trim() })
  const results: Result[] = [
    { id: 'new-transaction', group: 'Quick actions', title: 'New transaction', detail: hasUnfinishedChanges ? 'Finish your current edit first' : 'N', icon: <Plus />, disabled: !canCompose || hasUnfinishedChanges, run: () => { onClose(); onNewTransaction() } },
    ...(destinations.some(item => item.key === 'accounts') ? [{ id: 'new-account', group: 'Quick actions', title: 'Add account', icon: <Wallet />, disabled: !ready('accounts') || hasUnfinishedChanges, run: () => go('/accounts', { addAccount: true }) }] : []),
    ...(destinations.some(item => item.key === 'recurring') ? [{ id: 'new-recurring', group: 'Quick actions', title: 'Add recurring transaction', icon: <RefreshCw />, disabled: !canCompose || hasUnfinishedChanges, run: () => go('/recurring', { addSchedule: true }) }] : []),
    ...destinations.map(item => ({ id: `page-${item.key}`, group: 'Go to', title: item.label, icon: item.icon, run: () => go(`/${item.key}`) })),
  ].filter(result => matchesText(query, result.title))
  if (query.trim()) {
    results.push(...accounts.filter(account => matchesText(query, account.name, account.currency, account.symbol)).map(account => ({
      id: `account-${account.id}`, group: 'Accounts', title: account.name, detail: `${account.currency}${account.archived_at != null ? ' · Archived' : account.is_locked ? ' · Locked' : ''}`,
      icon: <Wallet />, disabled: hasUnfinishedChanges, run: () => go('/accounts', { editAccountId: account.id }),
    })).filter(() => destinations.some(item => item.key === 'accounts')))
    results.push(...categories.filter(category => matchesText(query, category.name)).map(category => ({
      id: `category-${category.id}`, group: 'Categories', title: category.name, detail: 'View matching transactions', icon: <Tag />,
      run: () => go(`/dashboard?range=allTime&category=${encodeURIComponent(category.id)}`, { transactionSearch: '' }),
    })))
    results.push(...matches.slice(0, 6).map(tx => ({ id: `tx-${tx.id}`, group: 'Transactions', title: tx.description || 'Transaction',
      detail: `${tx.date} · ${accounts.find(account => account.id === tx.account_id)?.name || 'Unknown account'} · ${categories.find(category => category.id === tx.category_id)?.name || 'Uncategorized'}${tx.status === 'pending' ? ' · Pending' : ''}`, value: amount(tx),
      icon: <FileText />, run: () => setSelected(tx),
    })))
    if (historyReady && matches.length) results.push({ id: 'all-transactions', group: 'Transactions', title: `View all matching transactions (${matches.length})`, icon: <ArrowRight />, run: viewAll })
    if (scheduleStatus.loaded && !scheduleStatus.error && showRecurring && ready('accounts') && ready('categories')) results.push(...schedules.filter(schedule => matchesTransaction(query, { ...schedule, date: '' }, accounts, categories)).map(schedule => ({
      id: `schedule-${schedule.id}`, group: 'Recurring', title: schedule.description || 'Recurring transaction', detail: `${schedule.frequency}${schedule.is_active ? '' : ' · Paused'}`, value: amount(schedule),
      icon: <RefreshCw />, disabled: hasUnfinishedChanges, run: () => go('/recurring', { editScheduleId: schedule.id }),
    })))
  }
  const selectable = results.filter(result => !result.disabled)
  const selectedResult = selectable[Math.min(active, Math.max(0, selectable.length - 1))]
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    if (isOpen) {
      if (selected) backButton.current?.focus()
      else input.current?.focus()
    }
  }, [isOpen, selected])
  useEffect(() => {
    if (!selectedResult || !isOpen) return
    document.getElementById(`${listId}-${selectedResult.id}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedResult?.id, isOpen, listId])
  const failed = (['accounts', 'categories', 'history', 'upcoming'] as const).filter(key => finance.dataStatus[key].error)
  const loading = (showRecurring && scheduleStatus.loading) || (['accounts', 'categories', 'history', 'upcoming'] as const).some(key => finance.dataStatus[key].loading)
  return <Modal isOpen={isOpen} onClose={onClose} title="Search everything" placement="centered" className="sm:max-w-[700px]">
    {selected ? <div className="space-y-4">
      <Button ref={backButton} variant="ghost" onClick={() => setSelected(null)}><ArrowLeft className="h-4 w-4" />Back to results</Button>
      <h3 className="text-lg font-semibold break-words">{selected.description || 'Transaction'}</h3>
      <p className="text-2xl font-semibold tabular-nums">{amount(selected)}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Date</dt><dd>{selected.date}</dd>
        <dt className="text-muted-foreground">Account</dt><dd>{accounts.find(account => account.id === selected.account_id)?.name || 'Unknown account'}</dd>
        <dt className="text-muted-foreground">Category</dt><dd>{categories.find(category => category.id === selected.category_id)?.name || 'Uncategorized'}</dd>
        <dt className="text-muted-foreground">Status</dt><dd>{selected.status === 'pending' ? selected.pending_kind === 'mcp_review' ? 'Pending review draft' : 'Pending' : 'Posted'}</dd>
      </dl>
      <Button variant="outline" onClick={viewAll}>View matching transactions<ArrowRight className="h-4 w-4" /></Button>
    </div> : <>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input ref={input} aria-label="Search everything" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
          aria-activedescendant={selectedResult ? `${listId}-${selectedResult.id}` : undefined} value={query} maxLength={200}
          placeholder="Transactions, accounts, categories…" className="finance-search-input min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
          onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(previous => selectable.length ? (previous + (event.key === 'ArrowDown' ? 1 : -1) + selectable.length) % selectable.length : 0) }
            if (event.key === 'Enter' && selectedResult) { event.preventDefault(); selectedResult.run() }
          }} />
        <kbd className="hidden rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:block">ESC</kbd>
      </div>
      <div className="my-3 text-xs text-muted-foreground" aria-live="polite">
        {loading ? 'Loading search data…' : 'Search all dates · amounts use their original currency'}
        {hasUnfinishedChanges && <p className="mt-2">Finish your current edit before opening another financial form.</p>}
        {failed.length > 0 && <p role="alert" className="mt-2 text-destructive">Some results are unavailable ({failed.join(', ')}). <button type="button" className="underline" onClick={() => { void finance.handleDataChange() }}>Retry search data</button></p>}
        {showRecurring && scheduleStatus.error && <p role="alert" className="mt-2 text-destructive">Recurring search is unavailable. <button type="button" className="underline" onClick={() => { void fetchSchedules() }}>Retry recurring search</button></p>}
      </div>
      <div id={listId} role="listbox" aria-label="Search results" className="max-h-[48dvh] overflow-y-auto space-y-1">
        {results.map((result, index) => <div key={result.id}>
          {(index === 0 || results[index - 1].group !== result.group) && <p className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{result.group}</p>}
          <button type="button" role="option" aria-label={`${result.title}${result.detail ? ` — ${result.detail}` : ''}${result.value ? ` — ${result.value}` : ''}`} aria-selected={selectedResult?.id === result.id} id={`${listId}-${result.id}`} disabled={result.disabled}
            tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={result.run} onMouseMove={() => setActive(Math.max(0, selectable.findIndex(item => item.id === result.id)))}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left disabled:cursor-not-allowed disabled:opacity-40 ${selectedResult?.id === result.id ? 'bg-primary/10' : 'hover:bg-secondary'}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary [&>svg]:h-4 [&>svg]:w-4">{result.icon}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{result.title}</span>{result.value && <span className="shrink-0 text-xs font-medium tabular-nums">{result.value}</span>}</span>{result.detail && <span className="block truncate text-xs text-muted-foreground">{result.detail}</span>}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </div>)}
        {results.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{loading ? 'Searching…' : failed.length ? 'Retry unavailable data to complete your search.' : 'No matches. Try a description, account, category, amount or date.'}</p>}
      </div>
      <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">↑ ↓ Navigate · Enter Open · Esc Close</p>
    </>}
  </Modal>
}
