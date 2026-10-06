import { useUnsavedChanges } from '../../navigation/UnsavedChanges'
import { convertCurrency, sumAvailable, validRates } from '../../../../shared/currency'
import { accountValueForOrdering, sortAccountsByValue } from '../../lib/account-order'
import type { AccountSortValues } from '../../lib/account-order'
import { MissingExchangeRates } from '../common/MissingExchangeRates'
import { useState, useEffect, useRef } from 'react'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { ActionMenu } from '../common/action-menu'
import { Modal } from '../common/modal'
import { Archive, RotateCcw, Plus, X, Wallet, CreditCard, Pencil, Trash2, Check, Search, Lock, LockOpen, CircleCheck, CircleX, ChevronDown, Loader2 } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../../config'
import { usePrivacy } from '../../context/PrivacyContext'
import { useAlert } from '../../context/AlertContext'
import { SplitTransactionModal } from './SplitTransactionModal'
import type { SplitTransaction } from './SplitTransactionModal'
import { AdjustmentChoiceModal } from './AdjustmentChoiceModal'
import { AmountInput } from '../common/amount-input'
import { formatAmount, parseAmount } from '../../lib/amount'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  quote_currency?: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  archived_at?: number | null
  is_locked?: boolean
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

const currencySymbols: Record<string, string> = {
  HUF: 'Ft',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF',
  MXN: 'MX$',
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

export function AccountList({ accounts, onAccountAdded, loading, manage = false, editAccountId, addRequest = false, requestKey = '', sortValues }: {
  accounts: Account[]; onAccountAdded: () => void; loading?: boolean; manage?: boolean; editAccountId?: string; addRequest?: boolean; requestKey?: string; sortValues?: AccountSortValues
}) {
  const { confirm, showAlert } = useAlert()
  const isLocked = (id: string) => accounts.find(a => a.id === id)?.is_locked ?? false
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'cash',
    balance: '',
    currency: 'HUF',
    quote_currency: 'USD',
    symbol: '',
    asset_type: 'stock' as 'stock' | 'crypto' | 'manual',
    adjustWithTransaction: false,
    exclude_from_net_worth: false,
    exclude_from_cash_balance: false
  })

  // For investment account creation
  const [showSymbolSearch, setShowSymbolSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [ratesRefreshKey, setRatesRefreshKey] = useState(0)
  const [ratesLoading, setRatesLoading] = useState(false)
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [categories, setCategories] = useState<Category[]>([])
  const [showChoiceModal, setShowChoiceModal] = useState(false)
  const [showSingleModal, setShowSingleModal] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [pendingAdjustment, setPendingAdjustment] = useState<{
    payload: any,
    accountId: string,
    oldBalance: number,
    newBalance: number
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lockingId, setLockingId] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(!manage)
  const [lifecycleId, setLifecycleId] = useState<string | null>(null)
  const [editorStatus, setEditorStatus] = useState({ locked: false, archived: false })
  const [editorConfirming, setEditorConfirming] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const editingAccount = accounts.find(account => account.id === editingId)
  const editorReadOnly = Boolean(editingId && (editorStatus.locked || editorStatus.archived))
  const accountActionBusy = Boolean(lockingId || lifecycleId || deletingId)
  useEffect(() => {
    if (editingAccount) setEditorStatus({ locked: Boolean(editingAccount.is_locked), archived: editingAccount.archived_at != null })
  }, [editingId, editingAccount?.is_locked, editingAccount?.archived_at])
  const activeAccounts = accounts.filter(account => account.archived_at == null)
  const archivedAccounts = accounts.filter(account => account.archived_at != null)

  useUnsavedChanges(isAdding || showChoiceModal || showSingleModal || showSplitModal || isSubmitting)

  const { privacyMode, shouldHideInvestment } = usePrivacy()

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/categories`)
        const data = await res.json()
        setCategories(data)
      } catch (error) {
        console.error('Failed to fetch categories:', error)
      }
    }
    fetchCategories()
  }, [])

  // Fetch exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        setRatesLoading(true)
        const response = await fetch('https://open.er-api.com/v6/latest/USD')
        if (!response.ok) throw new Error('Rates unavailable')
        const data = await response.json()
        setExchangeRates(validRates(data.rates))
      } catch {
        setExchangeRates({})
      } finally {
        setRatesLoading(false)
      }
    }
    fetchRates()
  }, [ratesRefreshKey, accounts])

  // Fetch market quotes for investment accounts
  useEffect(() => {
    const fetchQuotes = async () => {
      const investmentAccounts = activeAccounts.filter(a => a.type === 'investment' && a.symbol && a.asset_type !== 'manual')
      if (investmentAccounts.length === 0) return

      const symbols = [...new Set(investmentAccounts.map(a => a.symbol!))]
      const newQuotes: Record<string, MarketQuote> = {}

      await Promise.all(symbols.map(async (symbol) => {
        try {
          const res = await apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
          if (res.ok) {
            const data = await res.json()
            newQuotes[symbol] = data
          }
        } catch (error) {
          console.error(`Failed to fetch quote for ${symbol}:`, error)
        }
      }))

      setQuotes(newQuotes)
    }

    if (accounts.length > 0) {
      fetchQuotes()
    }
  }, [accounts])

  const missingCurrencies = new Set<string>()
  const accountValues = Object.fromEntries(accounts.map(account => {
    const conversion = accountValueForOrdering(account, quotes, 'USD', exchangeRates)
    if (account.archived_at == null) conversion.missingCurrencies.forEach(currency => missingCurrencies.add(currency))
    return [account.id, conversion.value]
  }))
  const orderingValues = sortValues ?? accountValues
  const totalCashUSD = sumAvailable(activeAccounts.filter(account => account.type === 'cash' &&
    !(account.exclude_from_cash_balance && account.exclude_from_net_worth)).map(account => accountValues[account.id]))
  const totalInvestmentUSD = sumAvailable(activeAccounts.filter(account => account.type === 'investment').map(account => accountValues[account.id]))
  const totalPortfolioUSD = sumAvailable([totalCashUSD, totalInvestmentUSD])
  const allocation = (value: number | null, total: number | null) =>
    value === null || total === null ? null : total > 0 ? value / total * 100 : 0
  const cashAllocation = allocation(totalCashUSD, totalPortfolioUSD)
  const investmentAllocation = allocation(totalInvestmentUSD, totalPortfolioUSD)
  const formatHufTotal = (usdValue: number | null) => {
    if (usdValue === null) return 'Unavailable'
    const result = convertCurrency(usdValue, 'USD', 'HUF', exchangeRates, 'USD')
    return result.value === null ? 'Unavailable' : `${Math.round(result.value).toLocaleString('hu-HU')} HUF`
  }
  if (accounts.length) convertCurrency(1, 'USD', 'HUF', exchangeRates, 'USD').missingCurrencies.forEach(item => missingCurrencies.add(item))

  const resetForm = () => {
    setFormData({ name: '', type: 'cash', balance: '', currency: 'HUF', quote_currency: 'USD', symbol: '', asset_type: 'stock', adjustWithTransaction: false, exclude_from_net_worth: false, exclude_from_cash_balance: false })
    setShowSymbolSearch(false)
    setSearchQuery('')
    setSearchResults([])
    setManualMode(false)
  }

  const handleTypeChange = (newType: string) => {
    setFormData({ ...formData, type: newType as 'cash' | 'investment' })
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery) return

    setSearching(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/market/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.quotes || [])
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearching(false)
    }
  }

  const handleSelectAsset = async (asset: any) => {
    const assetType = asset.quoteType === 'CRYPTOCURRENCY' ? 'crypto' : 'stock'
    // For crypto, currency is the crypto symbol (e.g., BTC). For stocks, use 'SHARE'
    const currency = assetType === 'crypto' ? asset.symbol.split('-')[0] : 'SHARE'
    const initialQuoteCurrency = typeof asset.currency === 'string' ? asset.currency.toUpperCase() : 'USD'
    setFormData({
      ...formData,
      name: asset.shortname || asset.longname || asset.symbol,
      symbol: asset.symbol,
      asset_type: assetType,
      currency: currency,
      quote_currency: initialQuoteCurrency
    })
    setShowSymbolSearch(false)
    setSearchQuery('')
    setSearchResults([])
    try {
      const response = await apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(asset.symbol)}`)
      const quote = await response.json()
      if (response.ok && typeof quote.currency === 'string') {
        setFormData(current => current.symbol === asset.symbol
          ? { ...current, quote_currency: quote.currency.toUpperCase() }
          : current)
      }
    } catch (error) {
      console.error('Failed to determine quote currency:', error)
    }
  }

  const handleManualAsset = () => {
    setFormData({
      ...formData,
      currency: 'HUF',
      quote_currency: 'HUF',
      asset_type: 'manual'
    })
    setShowSymbolSearch(false)
    setManualMode(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || accountActionBusy || editorReadOnly) return
    
    setIsSubmitting(true)
    try {
      const wasEditing = !!editingId
      const balanceValue = parseAmount(formData.balance)
      if (formData.balance.trim() !== '' && balanceValue === null) {
        throw new Error('Please enter a valid balance')
      }
      const payload: any = {
        name: formData.name,
        type: formData.type,
        balance: balanceValue ?? 0,
        currency: formData.currency,
        exclude_from_net_worth: formData.exclude_from_net_worth,
        exclude_from_cash_balance: formData.exclude_from_cash_balance,
        quote_currency: formData.type === 'investment' && formData.asset_type !== 'manual' ? formData.quote_currency : undefined
      }

      if (formData.type === 'investment') {
        payload.symbol = formData.symbol || null
        payload.asset_type = formData.asset_type
      }

      if (editingId) {
        // Check if we need to show adjustment choice modal
        if (formData.adjustWithTransaction) {
          const account = accounts.find(a => a.id === editingId)
          if (account && account.balance !== payload.balance) {
            // Store pending adjustment and show choice modal
            setPendingAdjustment({
              payload,
              accountId: editingId,
              oldBalance: account.balance,
              newBalance: payload.balance
            })
            setShowChoiceModal(true)
            return // Don't proceed yet, wait for user choice
          }
        }

        // Include the adjustWithTransaction flag when editing
        payload.adjustWithTransaction = formData.adjustWithTransaction

        await apiFetch(`${API_BASE_URL}/accounts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setEditingId(null)
      } else {
        await apiFetch(`${API_BASE_URL}/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      setIsAdding(false)
      resetForm()
      onAccountAdded()
      showAlert({
        type: 'success',
        message: wasEditing ? 'Account updated' : 'Account created'
      })
    } catch (error) {
      console.error('Failed to save account', error)
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save account. Please try again.'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (account: Account) => {
    setFormData({
      name: account.name,
      type: account.type,
      balance: formatAmount(account.balance, { maximumFractionDigits: 8 }),
      currency: account.currency,
      quote_currency: account.quote_currency || (account.symbol ? quotes[account.symbol]?.currency : undefined) || 'USD',
      symbol: account.symbol || '',
      asset_type: account.asset_type || 'stock',
      adjustWithTransaction: true,
      exclude_from_net_worth: Boolean(account.exclude_from_net_worth),
      exclude_from_cash_balance: Boolean(account.exclude_from_cash_balance)
    })
    setManualMode(account.asset_type === 'manual')
    setEditorStatus({ locked: Boolean(account.is_locked), archived: account.archived_at != null })
    setEditingId(account.id)
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await apiFetch(`${API_BASE_URL}/accounts/${id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setDeleteName('')
      if (editingId === id) handleCancel()
      onAccountAdded()
      showAlert({ type: 'success', message: 'Account deleted' })
    } catch (error) {
      console.error('Failed to delete account', error)
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete account. Please try again.'
      })
    } finally {
      setDeletingId(null)
    }
  }

  const handledRequest = useRef<string>('')
  useEffect(() => {
    const action = editAccountId || (addRequest ? 'add' : '')
    const request = action ? `${requestKey}:${action}` : ''
    if (!request || request === handledRequest.current) return
    if (editAccountId) {
      const account = accounts.find(item => item.id === editAccountId)
      if (!account) return
      handledRequest.current = request
      handleEdit(account)
    } else {
      handledRequest.current = request
      setIsAdding(true)
    }
  }, [accounts, editAccountId, addRequest, requestKey])

  const confirmAccountAction = async (id: string, options: Parameters<typeof confirm>[0]) => {
    const fromEditor = isAdding && editingId === id
    if (fromEditor) setEditorConfirming(true)
    try { return await confirm(options) }
    finally { if (fromEditor) setEditorConfirming(false) }
  }

  const handleLifecycle = async (account: Account, archived = account.archived_at != null, locked = Boolean(account.is_locked)) => {
    if (!archived && (account.balance !== 0 || locked)) {
      showAlert({ type: 'error', message: locked ? 'Unlock the account before archiving.' : 'The balance or holding must be zero before archiving. Transfer it out or record the final transaction first.' })
      return
    }
    const approved = await confirmAccountAction(account.id, { title: archived ? 'Restore account' : 'Archive account',
      message: archived ? `Restore "${account.name}" to active account choices? Recurring schedules will remain paused.` : `Archive "${account.name}"? History and exports are kept. New transactions, transfers and MCP drafts will be blocked. Recurring schedules using this account will be paused. All pending and review items must be resolved first.`,
      confirmText: archived ? 'Restore account' : 'Archive account' })
    if (!approved) return
    setLifecycleId(account.id)
    try {
      await apiFetch(`${API_BASE_URL}/accounts/${account.id}/${archived ? 'restore' : 'archive'}`, { method: 'PATCH' })
      onAccountAdded()
      if (editingId === account.id) setEditorStatus(previous => ({ ...previous, archived: !archived }))
      showAlert({ type: 'success', message: archived ? 'Account restored. Schedules remain paused.' : 'Account archived. History preserved.' })
    } catch (error) { showAlert({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update account' }) }
    finally { setLifecycleId(null) }
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingId(null)
    resetForm()
  }

  const handleLockToggle = async (accountId: string, wasLocked = Boolean(isLocked(accountId))) => {
    if (wasLocked) {
      const confirmed = await confirmAccountAction(accountId, {
        title: 'Unlock Account',
        message: 'Are you sure you want to unlock this account? You will be able to edit, delete, and add transactions again.',
        confirmText: 'Unlock',
        cancelText: 'Cancel'
      })
      if (!confirmed) return
    }
    setLockingId(accountId)
    try {
      if (wasLocked) {
        await apiFetch(`${API_BASE_URL}/accounts/${accountId}/unlock`, { method: 'PATCH' })
      } else {
        await apiFetch(`${API_BASE_URL}/accounts/${accountId}/lock`, { method: 'PATCH' })
      }
      if (editingId === accountId) setEditorStatus(previous => ({ ...previous, locked: !wasLocked }))
      onAccountAdded()
      showAlert({
        type: 'success',
        message: wasLocked ? 'Account unlocked' : 'Account locked'
      })
    } catch (error) {
      console.error('Failed to update account lock state', error)
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update account lock state'
      })
    } finally {
      setLockingId(null)
    }
  }

  const handleExcludeToggle = async (account: Account) => {
    // Check if account is locked
    if (isLocked(account.id)) {
      showAlert({
        type: 'error',
        message: 'Account is locked. Unlock it first to change exclusion settings.'
      })
      return
    }

    const isCurrentlyExcluded = account.exclude_from_cash_balance && account.exclude_from_net_worth
    const newExcluded = !isCurrentlyExcluded

    // Show confirmation dialog
    const confirmed = await confirm({
      title: newExcluded ? 'Exclude Account' : 'Include Account',
      message: newExcluded
        ? `Exclude "${account.name}" from dashboard calculations? It will be hidden from income, expenses, cash balance, and percentages on the dashboard. It will still appear in Analytics.`
        : `Include "${account.name}" in dashboard calculations?`,
      confirmText: newExcluded ? 'Exclude' : 'Include',
      cancelText: 'Cancel'
    })
    
    if (!confirmed) return

    try {
      await apiFetch(`${API_BASE_URL}/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exclude_from_cash_balance: newExcluded,
          exclude_from_net_worth: newExcluded
        }),
      })
      onAccountAdded()
      showAlert({
        type: 'success',
        message: newExcluded
          ? `"${account.name}" excluded from dashboard`
          : `"${account.name}" included in dashboard`
      })
    } catch (error) {
      console.error('Failed to update account exclusions', error)
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update account exclusion settings'
      })
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currencySymbols[currency] || currency
    const formatted = Math.abs(amount).toLocaleString('hu-HU', {
      minimumFractionDigits: currency === 'HUF' ? 0 : 2,
      maximumFractionDigits: currency === 'HUF' ? 0 : 2
    })
 const sign = amount < 0 ? '−' : ''
    return currency === 'HUF' ? `${sign}${formatted} ${symbol}` : `${sign}${symbol}${formatted}`
  }

  const handleSingleTransactionConfirm = async (transaction: SplitTransaction) => {
    if (!pendingAdjustment) return

    try {
      const { payload, accountId } = pendingAdjustment

      // Send the payload with the transaction details chosen by the user.
      payload.adjustWithTransaction = true
      payload.splitTransactions = [transaction]

      await apiFetch(`${API_BASE_URL}/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setEditingId(null)
      setIsAdding(false)
      resetForm()
      setPendingAdjustment(null)
      setShowSingleModal(false)
      onAccountAdded()
      
      showAlert({
        type: 'success',
        message: 'Account updated with adjustment transaction'
      })
    } catch (error) {
      console.error('Failed to save account with adjustment', error)
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save account changes'
      })
    }
  }

  const handleSplitTransactionConfirm = async (splits: SplitTransaction[]) => {
    if (!pendingAdjustment) return

    try {
      const { payload, accountId } = pendingAdjustment

      // Send the payload with split transactions
      payload.adjustWithTransaction = true
      payload.splitTransactions = splits

      await apiFetch(`${API_BASE_URL}/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setEditingId(null)
      setIsAdding(false)
      resetForm()
      setPendingAdjustment(null)
      onAccountAdded()
      
      showAlert({
        type: 'success',
        message: `Account updated with ${splits.length} transaction${splits.length > 1 ? 's' : ''}`
      })
    } catch (error) {
      console.error('Failed to save account with split transactions', error)
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save account changes'
      })
    }
  }

  return (
    <Card className={manage ? "contents" : "h-fit"}>
      <CardHeader className={`flex flex-row items-center justify-between pb-3 sm:pb-4 ${manage ? "px-0 sm:px-0 pt-0 sm:pt-0" : ""}`}>
        <button
          type="button"
          className="flex items-center gap-2 sm:gap-3 lg:cursor-default"
          disabled={manage}
          onClick={() => setIsCollapsed(c => !c)}
        >
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-secondary flex items-center justify-center">
            <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-sm sm:text-base">{manage ? `${activeAccounts.length} active · ${archivedAccounts.length} archived` : 'Accounts'}</CardTitle>
          <ChevronDown className={`${manage ? 'hidden' : ''} lg:hidden h-4 w-4 text-muted-foreground transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
        </button>
        <Button
          onClick={() => isAdding ? handleCancel() : setIsAdding(true)}
          size="sm"
          variant={isAdding ? "ghost" : "outline"}
          className="h-7 sm:h-8 text-xs"
        >
          {isAdding ? <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          <span className="ml-1">{isAdding ? 'Cancel' : 'Add'}</span>
        </Button>
      </CardHeader>
      <Modal isOpen={isAdding && !showSymbolSearch && !showChoiceModal && !showSingleModal && !showSplitModal && !deleteTarget && !editorConfirming} onClose={() => { if (!isSubmitting && !accountActionBusy) handleCancel() }} title={editingId ? (editorReadOnly ? 'Account details' : 'Edit Account') : 'Add Account'} placement="centered">
        <form onSubmit={handleSubmit} className="space-y-4">
          {editorReadOnly && <p role="status" className="rounded-lg border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">{editorStatus.archived ? 'Account archived. Restore it to continue editing.' : 'Account locked. Unlock it to continue editing.'} Unsaved form values are retained.</p>}
          <fieldset disabled={isSubmitting || accountActionBusy || editorReadOnly} className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="name">Account Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. OTP Bank"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  id="type"
                  value={formData.type}
                  onChange={e => handleTypeChange(e.target.value)}
                >
                  <option value="cash">💵 Cash / Bank</option>
                  <option value="investment">📈 Investment</option>
                </Select>
              </div>

              {formData.type === 'cash' && (
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    id="currency"
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                  >
                    <option value="HUF">🇭🇺 HUF</option>
                    <option value="EUR">🇪🇺 EUR</option>
                    <option value="USD">🇺🇸 USD</option>
                    <option value="GBP">🇬🇧 GBP</option>
                    <option value="CHF">🇨🇭 CHF</option>
                    <option value="MXN">🇲🇽 MXN</option>
                  </Select>
                </div>
              )}

              {formData.type === 'investment' && !formData.symbol && !editingId && (
                <div className="space-y-2">
                  <Label>Asset Symbol</Label>
                  <button
                    type="button"
                    onClick={() => setShowSymbolSearch(true)}
                    className="w-full p-2 border border-border rounded-lg text-left text-sm text-muted-foreground hover:bg-secondary/50 transition-colors"
                  >
                    Search for asset...
                  </button>
                </div>
              )}
              <div className="col-span-2 space-y-2">
                <Label htmlFor="balance">{formData.type === 'investment' ? 'Initial Quantity (0 if tracking from transactions)' : 'Current Balance'}</Label>
                {editorReadOnly && privacyMode === 'hidden' ? <Input id="balance" value="••••••" readOnly /> : (
                <AmountInput
                  id="balance"
                  value={formData.balance}
                  onValueChange={balance => setFormData({ ...formData, balance })}
                  allowNegative
                  placeholder="0"
                />
                )}
              </div>

              {formData.type === 'investment' && formData.symbol && (
                <>
                  <div className="col-span-2 p-3 bg-secondary/30 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="font-bold">{formData.symbol}</div>
                      <div className="text-sm text-muted-foreground">{formData.name}</div>
                    </div>
                    {!editingId && (
                      <button
                        type="button"
                        onClick={() => { setShowSymbolSearch(true); setFormData({ ...formData, symbol: '', name: '' }) }}
                        className="text-xs text-primary hover:underline"
                      >
                        Change
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quote-currency">Trading currency</Label>
                    <Select
                      id="quote-currency"
                      value={formData.quote_currency}
                      onChange={e => setFormData({ ...formData, quote_currency: e.target.value })}
                    >
                      <option value="EUR">🇪🇺 EUR</option>
                      <option value="USD">🇺🇸 USD</option>
                      <option value="GBP">🇬🇧 GBP</option>
                      <option value="CHF">🇨🇭 CHF</option>
                      <option value="HUF">🇭🇺 HUF</option>
                    </Select>
                  </div>
                </>
              )}

              {formData.type === 'investment' && manualMode && !formData.symbol && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="manual-currency">Currency</Label>
                    <Select
                      id="manual-currency"
                      value={formData.currency}
                      onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    >
                      <option value="HUF">🇭🇺 HUF</option>
                      <option value="EUR">🇪🇺 EUR</option>
                      <option value="USD">🇺🇸 USD</option>
                      <option value="GBP">🇬🇧 GBP</option>
                      <option value="CHF">🇨🇭 CHF</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-symbol">Symbol (Optional)</Label>
                    <Input
                      id="manual-symbol"
                      value={formData.symbol}
                      onChange={e => setFormData({ ...formData, symbol: e.target.value.slice(0, 5) })}
                      placeholder="e.g. MÁP+"
                      maxLength={5}
                    />
                  </div>
                </>
              )}

              {/* Checkbox for adjusting with transaction - only shown when editing */}
              {editingId && (
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg border border-border/30">
                    <input
                      id="adjust-with-transaction"
                      type="checkbox"
                      checked={formData.adjustWithTransaction}
                      onChange={e => setFormData({ ...formData, adjustWithTransaction: e.target.checked })}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    />
                    <Label htmlFor="adjust-with-transaction" className="cursor-pointer text-sm font-normal">
                      Adjust balance with a transaction instead of direct update
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground px-1">
                    {formData.adjustWithTransaction
                      ? "A transaction will be created for the difference between old and new balance"
                      : "Balance will be updated directly without creating a transaction"}
                  </p>
                </div>
              )}
            </div>
            <fieldset className="rounded-xl border border-border p-4 space-y-3">
              <legend className="px-1 text-sm font-medium">Calculation exclusions</legend>
              <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={formData.exclude_from_net_worth} onChange={event => setFormData({ ...formData, exclude_from_net_worth: event.target.checked })} className="mt-1" /><span>Exclude from net worth<span className="block text-xs text-muted-foreground">Keep the account's records in history.</span></span></label>
              {formData.type === 'cash' && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={formData.exclude_from_cash_balance} onChange={event => setFormData({ ...formData, exclude_from_cash_balance: event.target.checked })} className="mt-1" /><span>Exclude from cash balance<span className="block text-xs text-muted-foreground">Independent of net worth and archive status.</span></span></label>}
            </fieldset>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {editingId ? <Check className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {isSubmitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Account')}
            </Button>
          </fieldset>
          {editingAccount && <section aria-label="Account actions" className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              {!editorStatus.archived && <Button type="button" variant="outline" size="sm" disabled={isSubmitting || accountActionBusy} onClick={() => handleLockToggle(editingAccount.id, editorStatus.locked)}>{editorStatus.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{editorStatus.locked ? 'Unlock account' : 'Lock account'}</Button>}
              <Button type="button" variant="outline" size="sm" disabled={isSubmitting || accountActionBusy || (!editorStatus.archived && (editorStatus.locked || editingAccount.balance !== 0))} onClick={() => handleLifecycle(editingAccount, editorStatus.archived, editorStatus.locked)}><Archive className="h-4 w-4" />{editorStatus.archived ? 'Restore account' : 'Archive account'}</Button>
              <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={isSubmitting || accountActionBusy || editorStatus.locked || editorStatus.archived} onClick={() => { setDeleteTarget(editingAccount); setDeleteName('') }}><Trash2 className="h-4 w-4" />Delete permanently</Button>
            </div>
            <p className="text-xs text-muted-foreground">Actions apply to the saved account. Form changes require Save Changes. Archive requires an unlocked account with zero balance or holding and no pending items.</p>
          </section>}
          </form>
      </Modal>

      {!manage && <div className={`lg:!max-h-none lg:overflow-visible overflow-hidden transition-all duration-500 ease-in-out ${isCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}>
      <CardContent className="space-y-3 sm:space-y-4">
        {/* Cash Accounts Section */}
        {!ratesLoading && <MissingExchangeRates currencies={[...missingCurrencies].sort()} targetCurrency="USD"
          onRetry={() => setRatesRefreshKey(key => key + 1)} retrying={ratesLoading} />}
        {activeAccounts.filter(a => a.type === 'cash').length > 0 && (
          <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cash Accounts</h4>
              <div className="flex items-center gap-1.5">
                {privacyMode === 'hidden' ? <span className="text-[9px] font-medium text-muted-foreground sm:text-[10px]">••••••</span> : formatHufTotal(totalCashUSD) && <span className="whitespace-nowrap text-[9px] font-medium tabular-nums text-muted-foreground sm:text-[10px]">{formatHufTotal(totalCashUSD)}</span>}
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-primary sm:text-[10px]">{privacyMode === 'hidden' ? '••••' : cashAllocation === null ? 'Allocation unavailable' : `${cashAllocation.toFixed(0)}% total`}</span>
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {sortAccountsByValue(activeAccounts.filter(a => a.type === 'cash'), orderingValues).map(account => {
                const percentage = allocation(accountValues[account.id], totalCashUSD)
                const isExcluded = account.exclude_from_cash_balance && account.exclude_from_net_worth
                
                return (
                  <div
                    key={account.id}
                    className={`group relative overflow-hidden rounded-lg sm:rounded-xl transition-all duration-300 cursor-pointer ${
                      isExcluded
                        ? 'bg-gradient-to-br from-gray-500/30 to-gray-600/20 border border-gray-500/40 hover:border-gray-500/60 opacity-80'
                        : 'bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40'
                    }`}
                    onClick={() => {
                      // On mobile, first click shows options, hover works on desktop
                      if (window.innerWidth < 768) {
                        setActiveAccountId(activeAccountId === account.id ? null : account.id)
                      }
                    }}
                  >
                    {/* Percentage bar background (hide if excluded) */}
                    {!isExcluded && (
                      <div 
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/20 to-primary/10 transition-all duration-500"
                        style={{ width: `${privacyMode === 'hidden' ? 0 : percentage ?? 0}%` }}
                      />
                    )}
                    
                    <div className="relative p-2.5 sm:p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 pointer-events-none">
                        <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg ${
                          isExcluded
                            ? 'bg-gradient-to-br from-gray-600 to-gray-700 shadow-gray-600/30'
                            : 'bg-gradient-to-br from-primary to-primary/80 shadow-primary/25'
                        }`}>
                          <Wallet className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <p className="font-semibold text-sm sm:text-base truncate">{account.name}</p>
                            {!isExcluded && (
                              <span className="inline-flex items-center justify-center h-4 sm:h-5 px-1.5 sm:px-2 rounded-full bg-primary/20 text-primary text-[10px] sm:text-xs font-medium">
                                {privacyMode === 'hidden' ? '••••' : percentage === null ? 'Unavailable' : `${percentage.toFixed(1)}%`}
                              </span>
                            )}
                          </div>
                          <p className={`text-base sm:text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {privacyMode === 'hidden' ? '••••••' : formatCurrency(account.balance, account.currency)}
                          </p>
                        </div>
                      </div>
                      
                      {/* Blur background overlay */}
                      <div className={`absolute inset-0 backdrop-blur-sm bg-background/30 rounded-xl transition-opacity ${
                        activeAccountId === account.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 md:group-hover:opacity-100 pointer-events-none md:group-hover:pointer-events-auto'
                      }`} />
                      
                      <div className={`absolute inset-0 flex items-center justify-center gap-3 transition-opacity ${
                        activeAccountId === account.id ? 'opacity-100 pointer-events-auto z-20' : 'opacity-0 md:group-hover:opacity-100 pointer-events-none md:group-hover:pointer-events-auto z-10'
                      }`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-10 w-10 ${
                            account.exclude_from_cash_balance && account.exclude_from_net_worth
                              ? 'text-primary hover:bg-primary/20'
                              : 'text-red-500 hover:bg-red-500/20'
                          } ${
                            isLocked(account.id) ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.innerWidth < 768 && activeAccountId !== account.id) {
                              return
                            }
                            handleExcludeToggle(account)
                          }}
                          title={
                            isLocked(account.id)
                              ? 'Unlock account to change exclusion settings'
                              : account.exclude_from_cash_balance && account.exclude_from_net_worth
                              ? 'Excluded from dashboard (click to include)'
                              : 'Included in dashboard (click to exclude)'
                          }
                          disabled={isLocked(account.id)}
                        >
                          {account.exclude_from_cash_balance && account.exclude_from_net_worth ? (
                            <CircleCheck className="h-4 w-4" />
                          ) : (
                            <CircleX className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={lockingId === account.id}
                          className={`h-10 w-10 ${isLocked(account.id) ? 'text-amber-500 hover:bg-amber-500/20' : 'hover:bg-primary/20'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.innerWidth < 768 && activeAccountId !== account.id) {
                              return
                            }
                            handleLockToggle(account.id)
                          }}
                          title={isLocked(account.id) ? 'Unlock account' : 'Lock account'}
                        >
                          {lockingId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : isLocked(account.id) ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                        </Button>
                        {!isLocked(account.id) && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Edit account"
                              aria-label="Edit account"
                              className="h-10 w-10 hover:bg-primary/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (window.innerWidth < 768 && activeAccountId !== account.id) {
                                  return
                                }
                                handleEdit(account)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Delete account"
                              aria-label="Delete account"
                              className="h-10 w-10 text-destructive hover:text-destructive hover:bg-red-500/10"
                              disabled={deletingId === account.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(account); setDeleteName('')
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Investment Accounts Section */}
        {activeAccounts.filter(a => a.type === 'investment').length > 0 && (
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Investment Accounts</h4>
              <div className="flex items-center gap-1.5">
                {privacyMode === 'hidden' ? <span className="text-[9px] font-medium text-muted-foreground sm:text-[10px]">••••••</span> : formatHufTotal(totalInvestmentUSD) && <span className="whitespace-nowrap text-[9px] font-medium tabular-nums text-muted-foreground sm:text-[10px]">{formatHufTotal(totalInvestmentUSD)}</span>}
                <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-violet-400 sm:text-[10px]">{privacyMode === 'hidden' ? '••••' : investmentAllocation === null ? 'Allocation unavailable' : `${investmentAllocation.toFixed(0)}% total`}</span>
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {sortAccountsByValue(activeAccounts.filter(a => a.type === 'investment'), orderingValues).map(account => {
                const percentage = allocation(accountValues[account.id], totalInvestmentUSD)
                const quote = account.symbol ? quotes[account.symbol] : null
                const priceChange = quote?.regularMarketChangePercent || 0
                
                return (
                  <div
                    key={account.id}
                    className="group relative overflow-hidden rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/5 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 cursor-pointer"
                    onClick={() => {
                      // On mobile, first click shows options, hover works on desktop
                      if (window.innerWidth < 768) {
                        setActiveAccountId(activeAccountId === account.id ? null : account.id)
                      }
                    }}
                  >
                    {/* Percentage bar background */}
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500/20 to-purple-500/10 transition-all duration-500"
                      style={{ width: `${privacyMode === 'hidden' ? 0 : percentage ?? 0}%` }}
                    />
                    
                    <div className="relative p-2.5 sm:p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 pointer-events-none">
                        <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg font-bold text-xs sm:text-sm ${
                          account.asset_type === 'crypto' 
                            ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-orange-500/25' 
                            : account.asset_type === 'manual' 
                            ? 'bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-gray-500/25' 
                            : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/25'
                        }`}>
                          {account.symbol?.slice(0, 3).toUpperCase() || account.name.slice(0, 3).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1 flex-wrap">
                            <p className="font-semibold text-sm sm:text-base truncate">
                              {account.symbol || account.name}
                            </p>
                            <span className="inline-flex items-center justify-center h-4 sm:h-5 px-1.5 sm:px-2 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] sm:text-xs font-medium">
                              {privacyMode === 'hidden' ? '••••' : percentage === null ? 'Unavailable' : `${percentage.toFixed(1)}%`}
                            </span>
                            {account.asset_type !== 'manual' && priceChange !== 0 && (
                              <span className={`inline-flex items-center justify-center h-4 sm:h-5 px-1.5 sm:px-2 rounded-full text-[10px] sm:text-xs font-medium ${
                                priceChange >= 0 
                                  ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                                  : 'bg-red-500/20 text-red-600 dark:text-red-400'
                              }`}>
                                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-1.5 sm:gap-2">
                            <p className={`text-sm sm:text-lg font-bold ${privacyMode === 'hidden' || shouldHideInvestment() ? 'select-none' : ''}`}>
                              {privacyMode === 'hidden' || shouldHideInvestment() ? (
                                '••••••'
                              ) : (
                                `${account.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${account.currency}`
                              )}
                            </p>
                            {quote?.regularMarketPrice && (
                              <p className="text-[10px] sm:text-xs text-muted-foreground">
                                @ {currencySymbols[(account.quote_currency || quote.currency || 'USD').toUpperCase()] || (account.quote_currency || quote.currency || 'USD')} {quote.regularMarketPrice.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Blur background overlay */}
                      <div className={`absolute inset-0 backdrop-blur-sm bg-background/30 rounded-xl transition-opacity ${
                        activeAccountId === account.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 md:group-hover:opacity-100 pointer-events-none md:group-hover:pointer-events-auto'
                      }`} />
                      
                      <div className={`absolute inset-0 flex items-center justify-center gap-3 transition-opacity ${
                        activeAccountId === account.id ? 'opacity-100 pointer-events-auto z-20' : 'opacity-0 md:group-hover:opacity-100 pointer-events-none md:group-hover:pointer-events-auto z-10'
                      }`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={lockingId === account.id}
                          className={`h-10 w-10 ${isLocked(account.id) ? 'text-amber-500 hover:bg-amber-500/20' : 'hover:bg-blue-500/20'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.innerWidth < 768 && activeAccountId !== account.id) {
                              return
                            }
                            handleLockToggle(account.id)
                          }}
                          title={isLocked(account.id) ? 'Unlock account' : 'Lock account'}
                        >
                          {lockingId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : isLocked(account.id) ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                        </Button>
                        {!isLocked(account.id) && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Edit account"
                              aria-label="Edit account"
                              className="h-10 w-10 hover:bg-blue-500/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (window.innerWidth < 768 && activeAccountId !== account.id) {
                                  return
                                }
                                handleEdit(account)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Delete account"
                              aria-label="Delete account"
                              className="h-10 w-10 text-destructive hover:text-destructive hover:bg-red-500/10"
                              disabled={deletingId === account.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (window.innerWidth < 768 && activeAccountId !== account.id) {
                                  return
                                }
                                setDeleteTarget(account); setDeleteName('')
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {accounts.length === 0 && !isAdding && (
          loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No accounts yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add your first account to get started</p>
            </div>
          )
        )}
      </CardContent>
      </div>}

      {/* Symbol Search Modal */}
      {showSymbolSearch && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold">Select Investment Asset</h3>
              <button onClick={() => { setShowSymbolSearch(false); resetForm(); setIsAdding(false); }} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="p-4 space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search symbol (e.g. AAPL, BTC-USD)"
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={searching}
                  size="icon"
                >
                  {searching ? '...' : <Search className="h-4 w-4" />}
                </Button>
              </form>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {searchResults.map((result: any) => (
                  <button
                    key={result.symbol}
                    onClick={() => handleSelectAsset(result)}
                    className="w-full p-3 text-left hover:bg-secondary/50 rounded-lg transition-colors flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium">{result.symbol}</div>
                      <div className="text-xs text-muted-foreground">{result.shortname || result.longname}</div>
                    </div>
                    <div className="text-xs px-2 py-1 bg-secondary rounded text-muted-foreground">
                      {result.quoteType}
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-border">
                <Button
                  onClick={handleManualAsset}
                  variant="outline"
                  className="w-full"
                >
                  Enter Manually
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjustment Choice Modal */}
      {pendingAdjustment && (
        <AdjustmentChoiceModal
          isOpen={showChoiceModal}
          onClose={() => {
            setShowChoiceModal(false)
            setPendingAdjustment(null)
          }}
          onSingleTransaction={() => {
            setShowChoiceModal(false)
            setShowSingleModal(true)
          }}
          onSplitTransaction={() => {
            setShowChoiceModal(false)
            setShowSplitModal(true)
          }}
          adjustmentAmount={pendingAdjustment.newBalance - pendingAdjustment.oldBalance}
          currency={pendingAdjustment.payload.currency}
        />
      )}

      {/* Single Transaction Modal */}
      {pendingAdjustment && (
        <SplitTransactionModal
          isOpen={showSingleModal}
          onClose={() => {
            setShowSingleModal(false)
            setPendingAdjustment(null)
          }}
          onConfirm={splits => handleSingleTransactionConfirm(splits[0])}
          totalAmount={pendingAdjustment.newBalance - pendingAdjustment.oldBalance}
          accountCurrency={pendingAdjustment.payload.currency}
          categories={categories}
          defaultDate={new Date().toISOString().split('T')[0]}
          mode="single"
        />
      )}

      {/* Split Transaction Modal */}
      {pendingAdjustment && (
        <SplitTransactionModal
          isOpen={showSplitModal}
          onClose={() => {
            setShowSplitModal(false)
            setPendingAdjustment(null)
          }}
          onConfirm={handleSplitTransactionConfirm}
          totalAmount={pendingAdjustment.newBalance - pendingAdjustment.oldBalance}
          accountCurrency={pendingAdjustment.payload.currency}
          categories={categories}
          defaultDate={new Date().toISOString().split('T')[0]}
        />
      )}

      {manage && <div className="space-y-5">
        {!loading && activeAccounts.some(account => orderingValues[account.id] == null) && <p className="text-xs text-muted-foreground">Accounts with unavailable converted values are listed last.</p>}
        {loading ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading accounts…</p> : <>
          {!ratesLoading && <MissingExchangeRates currencies={[...missingCurrencies].sort()} targetCurrency="USD" onRetry={() => setRatesRefreshKey(key => key + 1)} retrying={ratesLoading} />}
          {(['cash', 'investment', 'archived'] as const).map(group => {
            const rows = sortAccountsByValue(group === 'archived' ? archivedAccounts : activeAccounts.filter(account => account.type === group), orderingValues)
            return <section key={group} className="rounded-[14px] border border-border bg-card" aria-label={group === 'cash' ? 'Cash accounts' : group === 'investment' ? 'Investment accounts' : 'Archived accounts'}>
              <div className="flex items-center justify-between px-5 py-4"><h2 className="text-[15px] font-medium">{group === 'cash' ? 'Cash & bank accounts' : group === 'investment' ? 'Investments' : 'Archived'}</h2><span className="text-xs text-muted-foreground">{rows.length}</span></div>
              {rows.length === 0 && <p className="border-t border-border px-5 py-6 text-sm text-muted-foreground">{group === 'archived' ? 'No archived accounts. Archive keeps your history without deleting it.' : 'No accounts yet. Add an account to get started.'}</p>}
              {rows.map(account => {
                const archived = account.archived_at != null
                const market = account.type === 'investment' && account.asset_type !== 'manual'
                const hidden = privacyMode === 'hidden' || (market && shouldHideInvestment())
                const locked = Boolean(account.is_locked)
                const excluded = Boolean(account.exclude_from_cash_balance && account.exclude_from_net_worth)
                return <div key={account.id} className={`relative border-t border-border ${archived ? 'text-muted-foreground' : ''}`}>
                  <div className="flex items-center gap-1 px-3 py-2 sm:px-4">
                    <button type="button" aria-label={archived ? `${account.name}, archived` : locked ? `View ${account.name}` : `Edit ${account.name}`}
                      disabled={isSubmitting || accountActionBusy} onClick={() => handleEdit(account)}
                      className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 disabled:cursor-wait disabled:hover:bg-transparent">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${account.type === 'investment' ? 'bg-violet-500/10 text-violet-400' : 'bg-primary/10 text-primary'}`}>{account.type === 'cash' ? <Wallet className="h-[18px] w-[18px]" /> : <span className="text-xs font-bold">{(account.symbol || account.name).slice(0,3).toUpperCase()}</span>}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[15px] font-medium"><span className="truncate">{account.name}</span>{locked && <Lock className="h-3 w-3 shrink-0" />}</span>
                        <span className="block truncate text-xs text-muted-foreground">{archived ? `Archived ${new Date(account.archived_at!).toLocaleDateString()}` : `${account.type === 'cash' ? 'Cash / bank' : account.asset_type === 'manual' ? 'Manual asset' : account.symbol || 'Investment'} · ${account.currency}`}</span>
                        {Boolean(account.exclude_from_net_worth || account.exclude_from_cash_balance) && <span className="block text-[11px] text-muted-foreground">{[account.exclude_from_net_worth && 'Excluded from net worth', account.exclude_from_cash_balance && 'Excluded from cash balance'].filter(Boolean).join(' · ')}</span>}
                      </span>
                      <span className="max-w-full text-right text-sm font-semibold tabular-nums">{hidden ? '••••••' : market ? `${account.balance.toLocaleString('hu-HU', { maximumFractionDigits: 8 })} ${account.currency}` : formatCurrency(account.balance, account.currency)}
                        {market && <span className="block text-xs font-normal text-muted-foreground">{hidden ? '••••••' : archived ? 'No position' : formatHufTotal(accountValues[account.id])}</span>}
                      </span>
                    </button>
                    {archived && <Button size="sm" variant="ghost" disabled={accountActionBusy} onClick={() => handleLifecycle(account)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restore</Button>}
                    <ActionMenu label={account.name} disabled={isSubmitting || accountActionBusy} items={[
                      { label: archived || locked ? 'View details' : 'Edit details', description: archived ? 'Restore before editing' : locked ? 'Unlock before editing' : 'Name, currency, balance', icon: <Pencil className="h-4 w-4" />, onSelect: () => handleEdit(account) },
                      ...(!archived ? [{ label: locked ? 'Unlock' : 'Lock', description: locked ? 'Allow edits and new transactions' : 'Block edits and new transactions', icon: locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />, onSelect: () => { void handleLockToggle(account.id) } }] : []),
                      ...(!archived && account.type === 'cash' ? [{ label: excluded ? 'Include in totals' : 'Exclude from totals', description: locked ? 'Unlock to change calculation exclusions' : 'Dashboard cash, net worth, income and expenses', icon: <CircleX className="h-4 w-4" />, disabled: locked, onSelect: () => { void handleExcludeToggle(account) } }] : []),
                      { label: archived ? 'Restore account' : 'Archive account', description: archived ? 'Return to active choices; schedules stay paused' : locked ? 'Unlock before archiving' : account.balance !== 0 ? 'Balance or holding must be zero to archive' : 'Keep history, hide from new choices', icon: <Archive className="h-4 w-4" />, separator: true, disabled: !archived && (locked || account.balance !== 0), onSelect: () => { void handleLifecycle(account) } },
                      { label: 'Delete permanently', description: archived ? 'Restore before permanently deleting' : locked ? 'Unlock before permanently deleting' : 'Deletes this account and its history', icon: <Trash2 className="h-4 w-4" />, separator: true, destructive: true, disabled: archived || locked, onSelect: () => { setDeleteTarget(account); setDeleteName('') } },
                    ]} />
                  </div>
                </div>
              })}
            </section>
          })}
        </>}
      </div>}
      <Modal isOpen={deleteTarget !== null} onClose={() => { if (!deletingId) setDeleteTarget(null) }} title="Delete account permanently?" placement="centered">
        <div className="space-y-4"><p className="text-sm text-muted-foreground">This deletes the account, its transactions, investment history, and recurring schedules. Linked transfers block deletion to protect the other account. Archive instead to retain history. Deleted data can only be recovered from a database backup.</p>
          <Label htmlFor="delete-account-name">Type {deleteTarget?.name} to confirm</Label><Input id="delete-account-name" value={deleteName} onChange={event => setDeleteName(event.target.value)} autoComplete="off" />
          <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={Boolean(deletingId)} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={!deleteTarget || deleteName !== deleteTarget.name || Boolean(deletingId)} onClick={() => { if (deleteTarget) void handleDelete(deleteTarget.id) }}>{deletingId ? 'Deleting…' : 'Delete permanently'}</Button></div>
        </div>
      </Modal>
    </Card>
  )
}
