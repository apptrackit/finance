import type { DashboardFilters, FilterChange } from '../../navigation/filters'
import { useUnsavedChanges } from '../../navigation/UnsavedChanges'
import { matchesTransaction } from '../../lib/global-search'
import { useState, useEffect, useRef } from 'react'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { Modal } from '../common/modal'
import { Plus, ArrowDownLeft, ArrowUpRight, Receipt, Pencil, Trash2, Check, ArrowRightLeft, ChevronDown, MoreHorizontal, SlidersHorizontal, Split, Search, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, differenceInCalendarDays, parseISO } from 'date-fns'
import { API_BASE_URL, apiFetch } from '../../config'
import { usePrivacy } from '../../context/PrivacyContext'
import { useAlert } from '../../context/AlertContext'
import { SplitLinesEditor } from './SplitLinesEditor'
import { resolveSplit, startSplit, newSplitLine, toSplitPayloadLines, type SplitLineDraft } from '../../lib/transaction-split'
import { AmountInput } from '../common/amount-input'
import { formatAmount, formatCalculatedAmount, parseAmount } from '../../lib/amount'
import type { PendingKind } from '../../lib/transaction-review'
import { getMcpReviewItems, hasPossibleDuplicateFlag, isMcpReviewTransaction } from '../../lib/transaction-review'
import { TransactionCalendar } from './TransactionCalendar'
import { TransferForm, type TransferAccount } from './TransferForm'
import { cn } from '../../lib/utils'

type Transaction = {
  id: string
  account_id: string
  category_id?: string | null
  amount: number
  quantity?: number
  price?: number
  description?: string | null
  date: string
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  status?: 'posted' | 'pending' | 'cancelled'
  pending_kind?: PendingKind | null
  review_batch_id?: string | null
  review_flags?: unknown
  confirmed_at?: number | null
  cancelled_at?: number | null
  created_at?: number | null
  updated_at?: number | null
  split_id?: string | null
  split_description?: string | null
}

// Every transaction list endpoint returns rows newest first (rowid DESC), so a split's
// lines arrive in reverse entry order. Restore the order they were entered in.
const inEntryOrder = <T,>(lines: T[]): T[] => [...lines].reverse()

// A pending review row: either one transaction or a whole split with its lines.
type PendingItem = Transaction & { splitGroup?: Transaction[] }

type Account = {
  id: string
  name: string
  balance: number
  currency: string
  quote_currency?: string
  type: 'cash' | 'investment'
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

const ALL_TIME_RANGE = { startDate: '1900-01-01', endDate: '2100-12-31' }
const isAllTimeRange = (r: { startDate: string; endDate: string }) =>
  r.startDate === '1900-01-01' && r.endDate === '2100-12-31'
const DISPLAY_LIMIT = 7
const RECENT_TRANSACTION_MS = 10 * 60 * 1000
const RECENT_TIMESTAMP_GRACE_MS = 60 * 1000
const UPDATED_BADGE_GRACE_MS = 1000
const getLocalDateString = () => format(new Date(), 'yyyy-MM-dd')
const getTransferPairKey = (fromAccountId: string, toAccountId: string) => `${fromAccountId}:${toAccountId}`

const isRecentTimestamp = (timestamp: number, now: number) => {
  return timestamp > 0
    && timestamp <= now + RECENT_TIMESTAMP_GRACE_MS
    && now - timestamp <= RECENT_TRANSACTION_MS
}

const getRecentTransactionLabel = (tx: Transaction, now: number) => {
  const createdAt = tx.created_at || 0
  const updatedAt = tx.updated_at || 0
  const isRecentlyCreated = isRecentTimestamp(createdAt, now)
  const isRecentlyUpdated = isRecentTimestamp(updatedAt, now)
    && (!createdAt || updatedAt > createdAt + UPDATED_BADGE_GRACE_MS)

  if (isRecentlyUpdated) return 'edited'
  if (isRecentlyCreated) return 'new'
  return null
}

// LocalStorage keys for remembering last used values
const STORAGE_KEYS = {
  expenseAccount: 'finance_last_expense_account',
  expenseCategory: 'finance_last_expense_category',
  incomeAccount: 'finance_last_income_account',
  incomeCategory: 'finance_last_income_category',
  transferFrom: 'finance_last_transfer_from',
  transferTo: 'finance_last_transfer_to',
}

export function TransactionList({ 
  transactions, 
  upcomingTransactions,
  accounts, 
  onTransactionAdded,
  loading,
  dateRange,
  onDateRangeChange,
  currentMonth,
  onMonthChange,
  convertToMasterCurrency,
  masterCurrency,
  onCalendarViewChange,
  filters,
  onFiltersChange,
  availableCategories,
  composerOnly = false,
  openRequest = 0,
  searchRequest,
  searchRequestKey,
  navigationKey = '',
}: { 
  transactions: Transaction[], 
  upcomingTransactions: Transaction[],
  accounts: Account[],
  onTransactionAdded: () => void,
  loading?: boolean,
  dateRange: { startDate: string; endDate: string },
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void,
  currentMonth: Date,
  onMonthChange: (month: Date) => void,
  convertToMasterCurrency?: (amount: number, accountId: string) => number | null,
  masterCurrency: string,
  onCalendarViewChange?: (isCalendar: boolean) => void,
  filters?: DashboardFilters,
  onFiltersChange?: FilterChange<DashboardFilters>,
  availableCategories?: Category[],
  composerOnly?: boolean,
  openRequest?: number,
  searchRequest?: string,
  searchRequestKey?: string,
  navigationKey?: string,
}) {
  const lastNavigationKey = useRef(navigationKey)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Split mode turns the category into lines of category, note and amount. Null means a single entry.
  const [splitLines, setSplitLines] = useState<SplitLineDraft[] | null>(null)
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null)
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(() => new Set())
  const [addedAnother, setAddedAnother] = useState(false)
  const [fetchedCategories, setCategories] = useState<Category[]>([])
  const categories = availableCategories ?? fetchedCategories
  const [upcomingOpen, setUpcomingOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [activeTxId, setActiveTxId] = useState<string | null>(null)
  const [pendingDetails, setPendingDetails] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    account_id: '',
    to_account_id: '',
    category_id: '',
    amount: '',
    amount_to: '',
    description: '',
    date: getLocalDateString(),
    type: 'expense' as 'expense' | 'income' | 'transfer',
    manual_price: '', // For investment accounts - manual price override
    exclude_from_estimate: false
  })
  const originalTransferRef = useRef<{ data: typeof formData; rate: number | null; rateDraft: string } | null>(null)
  const [transferSaveError, setTransferSaveError] = useState<string | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [exchangeRateDraft, setExchangeRateDraft] = useState('')
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null)
  const [isLoadingRate, setIsLoadingRate] = useState(false)
  const rateRequestSequenceRef = useRef(0)
  const manualRateOverrideRef = useRef(false)
  const manuallyEditedTransferFieldsRef = useRef({
    amount_to: false,
    manual_price: false,
  })
  const editedTransferPairRef = useRef<string | null>(null)
  const [localCategoryFilter, setCategoryFilterLocal] = useState<string>('all')
  const categoryFilter = filters?.category ?? localCategoryFilter
  const setCategoryFilter = (value: string) => onFiltersChange ? onFiltersChange({ category: value }) : setCategoryFilterLocal(value)
  const [localSortOrder, setSortOrderLocal] = useState<'date' | 'amount-high' | 'amount-low'>('date')
  const sortOrder = filters?.sort ?? localSortOrder
  const setSortOrder = (value: 'date' | 'amount-high' | 'amount-low') => onFiltersChange ? onFiltersChange({ sort: value }) : setSortOrderLocal(value)
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [localTransactionView, setTransactionViewLocal] = useState<'list' | 'calendar'>('list')
  const transactionView = filters?.view ?? localTransactionView
  const setTransactionView = (value: 'list' | 'calendar') => onFiltersChange ? onFiltersChange({ view: value }) : setTransactionViewLocal(value)
  const openCalendar = () => {
    if (onFiltersChange) onFiltersChange({ view: 'calendar', range: 'custom',
      startDate: format(startOfMonth(currentMonth), 'yyyy-MM-dd'), endDate: format(endOfMonth(currentMonth), 'yyyy-MM-dd') })
    else { setTransactionView('calendar'); onMonthChange(currentMonth) }
  }
  const [searchQuery, setSearchQuery] = useState<string>('')
  useEffect(() => {
    if (searchRequest !== undefined) setSearchQuery(searchRequest)
  }, [searchRequest, searchRequestKey])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [resolvedPendingIds, setResolvedPendingIds] = useState<Set<string>>(() => new Set())
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [badgeNow, setBadgeNow] = useState(() => Date.now())
  
  useUnsavedChanges(isAdding || isSubmitting)

  const { confirm, showAlert } = useAlert()
  const { privacyMode, shouldHideInvestment } = usePrivacy()
  const isLocked = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId)
    return Boolean(account?.is_locked || account?.archived_at != null)
  }
  const today = getLocalDateString()
  const isUpcomingForm = formData.type !== 'transfer' && formData.date > today
  const selectedAccount = accounts.find(account => account.id === formData.account_id)
  const splitResolution = splitLines ? resolveSplit(formData.amount, splitLines) : null
  // A pending split (an MCP review draft) stays pending when edited, so it may keep a future date.
  const editingPendingSplit = !!editingSplitId && upcomingTransactions.some(tx => tx.split_id === editingSplitId)
  const splitBlockedReason = selectedAccount?.type === 'investment' ? 'Investment accounts cannot be split.'
    : isUpcomingForm && !editingPendingSplit ? 'A split cannot be dated in the future.' : ''
  const allKnownTransactions = [...transactions, ...upcomingTransactions]
  const editingReviewTransfer = !!editingId && upcomingTransactions.some(tx =>
    tx.id === editingId && !!tx.linked_transaction_id && isMcpReviewTransaction(tx)
  )
  const refreshRecentBadges = () => setBadgeNow(Date.now())

  // Reset showAllTransactions when filter, sort, search, or date range changes
  useEffect(() => {
    setShowAllTransactions(false)
  }, [categoryFilter, sortOrder, searchQuery, dateRange])

  useEffect(() => {
    onCalendarViewChange?.(transactionView === 'calendar')
  }, [onCalendarViewChange, transactionView])

  useEffect(() => {
    const interval = window.setInterval(() => setBadgeNow(Date.now()), 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    setBadgeNow(Date.now())
  }, [transactions, upcomingTransactions])

  useEffect(() => {
    if (availableCategories) return
    apiFetch(`${API_BASE_URL}/categories`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(() => console.error('Failed to fetch categories'))
  }, [availableCategories])

  // Fetch exchange rate when transfer accounts are selected
  useEffect(() => {
    const requestId = ++rateRequestSequenceRef.current
    let cancelled = false
    const isCurrentRequest = () => !cancelled && rateRequestSequenceRef.current === requestId

    if (formData.type !== 'transfer' || !formData.account_id || !formData.to_account_id) {
      setSuggestedRate(null)
      setExchangeRate(null)
      setExchangeRateDraft('')
      setIsLoadingRate(false)
      return
    }

    if (editingReviewTransfer) {
      setSuggestedRate(null)
      setIsLoadingRate(false)
      return
    }

    const fromAccount = accounts.find(a => a.id === formData.account_id)
    const toAccount = accounts.find(a => a.id === formData.to_account_id)
    
    if (!fromAccount || !toAccount || fromAccount.currency === toAccount.currency) {
      setSuggestedRate(null)
      setExchangeRate(null)
      setExchangeRateDraft('')
      setIsLoadingRate(false)
      return
    }

    const pairKey = getTransferPairKey(fromAccount.id, toAccount.id)
    const shouldKeepCurrentRate = () =>
      (!!editingId && editedTransferPairRef.current === pairKey)
      || manualRateOverrideRef.current

    const fetchRate = async () => {
      setIsLoadingRate(true)
      try {
        let rate = 0

        // Helper to get quote price
        const getQuotePrice = async (symbol: string) => {
          try {
            const res = await apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
            if (!res.ok) return null
            const data = await res.json()
            return { price: data.regularMarketPrice, currency: data.currency }
          } catch {
            console.error('Quote fetch failed')
            return null
          }
        }

        // Helper to get FX rate
        const getFxRate = async (from: string, to: string) => {
          if (from === to) return 1
          try {
            const res = await apiFetch(`${API_BASE_URL}/transfers/exchange-rate?from=${from}&to=${to}`)
            if (!res.ok) return null
            const data = await res.json()
            return data.rate
          } catch {
            console.error('FX fetch failed')
            return null
          }
        }

        // Case 1: Investment -> Cash/Other
        if (fromAccount.type === 'investment' && fromAccount.symbol) {
          const quote = await getQuotePrice(fromAccount.symbol)
          if (quote && quote.price) {
            // Ensure currency is uppercase, trimmed, and default to USD
            const quoteCurrency = (quote.currency || 'USD').toUpperCase().trim()
            
            let fxRate = await getFxRate(quoteCurrency, toAccount.currency)
            
            // If failed and currency wasn't USD, try USD as fallback (common for crypto quotes)
            if (!fxRate && quoteCurrency !== 'USD') {
               fxRate = await getFxRate('USD', toAccount.currency)
            }

            if (fxRate) {
              rate = quote.price * fxRate
            }
          }
        }
        // Case 2: Cash/Other -> Investment
        else if (toAccount.type === 'investment' && toAccount.symbol) {
          const quote = await getQuotePrice(toAccount.symbol)
          if (quote && quote.price) {
            const quoteCurrency = (quote.currency || 'USD').toUpperCase().trim()
            
            let fxRate = await getFxRate(fromAccount.currency, quoteCurrency)
            
            // If failed and currency wasn't USD, try converting From -> USD
            if (!fxRate && quoteCurrency !== 'USD') {
               fxRate = await getFxRate(fromAccount.currency, 'USD')
            }

            if (fxRate) {
              rate = fxRate / quote.price
            }
          }
        }
        
        // Fallback / Case 3: Direct Currency Conversion
        // Only try this if we haven't calculated a rate yet AND it's not an investment case that just failed
        const isInvestmentCase = (fromAccount.type === 'investment' && fromAccount.symbol) || (toAccount.type === 'investment' && toAccount.symbol)
        
        if (!rate && !isInvestmentCase && fromAccount.currency !== toAccount.currency) {
           const directRate = await getFxRate(fromAccount.currency, toAccount.currency)
           if (directRate) rate = directRate
        }

        if (!isCurrentRequest()) return

        const preserveEditedRate = shouldKeepCurrentRate()

        if (Number.isFinite(rate) && rate > 0) {
          setSuggestedRate(rate)
          if (!preserveEditedRate) {
            setExchangeRate(rate)
            setExchangeRateDraft(formatCalculatedAmount(rate, { maximumFractionDigits: 12 }))
          }
        } else {
          setSuggestedRate(null)
          if (!preserveEditedRate) {
            setExchangeRate(null)
            setExchangeRateDraft('')
          }
        }
      } catch {
        if (!isCurrentRequest()) return
        console.error('Failed to fetch exchange rate')
        setSuggestedRate(null)
        if (!shouldKeepCurrentRate()) {
          setExchangeRate(null)
          setExchangeRateDraft('')
        }
      } finally {
        if (isCurrentRequest()) setIsLoadingRate(false)
      }
    }

    fetchRate()
    return () => {
      cancelled = true
    }
  }, [formData.account_id, formData.to_account_id, formData.type, accounts, editingId, editingReviewTransfer])

  // Auto-calculate the received amount only until the user enters it themselves.
  // A manual value must remain the source of truth even if the amount, rate, or
  // selected accounts subsequently change.
  useEffect(() => {
    if (formData.type !== 'transfer' || manuallyEditedTransferFieldsRef.current.amount_to) return

    const fromAccount = accounts.find(a => a.id === formData.account_id)
    const toAccount = accounts.find(a => a.id === formData.to_account_id)
    const isDifferentCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency

    if (editingReviewTransfer && isDifferentCurrency) return

    if (isDifferentCurrency && formData.amount && exchangeRate) {
      // Different currency: amount_to = amount_from × exchange_rate
      const amountFrom = parseAmount(formData.amount) || 0
      const calculated = amountFrom * exchangeRate
      const maximumFractionDigits = toAccount?.type === 'investment' ? 8 : 2
      setFormData(prev => ({
        ...prev,
        amount_to: formatCalculatedAmount(calculated, { maximumFractionDigits })
      }))
    } else if (!isDifferentCurrency && formData.amount) {
      // Same currency: amount_to = amount_from (no fee)
      setFormData(prev => ({ ...prev, amount_to: prev.amount }))
    } else if (!formData.amount) {
      setFormData(prev => prev.amount_to ? ({ ...prev, amount_to: '' }) : prev)
    }
  }, [formData.amount, exchangeRate, formData.type, formData.account_id, formData.to_account_id, accounts, editingReviewTransfer])

  // Auto-fetch price for investment accounts when date or account changes
  useEffect(() => {
    let cancelled = false
    const fetchHistoricalPrice = async () => {
      // Never overwrite a price that the user has edited, including a deliberate
      // empty value. This also protects against a pending fetch resolving late.
      if (manuallyEditedTransferFieldsRef.current.manual_price) {
        return
      }
      
      // Check if income/expense to investment account OR transfer to investment account
      let investmentAccount = null
      
      if (formData.type === 'transfer') {
        const toAccount = accounts.find(a => a.id === formData.to_account_id)
        if (toAccount?.type === 'investment' && toAccount.symbol && toAccount.asset_type !== 'manual') {
          investmentAccount = toAccount
        }
      } else {
        const account = accounts.find(a => a.id === formData.account_id)
        if (account?.type === 'investment' && account.symbol && account.asset_type !== 'manual') {
          investmentAccount = account
        }
      }
      
      if (!investmentAccount || !formData.date) return
      
      try {
        const txDate = new Date(formData.date)
        const startDate = new Date(txDate)
        startDate.setDate(startDate.getDate() - 7)
        const endDate = new Date(txDate)
        endDate.setDate(endDate.getDate() + 1)
        
        const period1 = Math.floor(startDate.getTime() / 1000)
        const period2 = Math.floor(endDate.getTime() / 1000)
        
        const chartRes = await apiFetch(
          `${API_BASE_URL}/market/chart?symbol=${encodeURIComponent(investmentAccount.symbol!)}&interval=1d&period1=${period1}&period2=${period2}`
        )
        
        if (chartRes.ok) {
          const chartData = await chartRes.json()
          
          if (chartData.quotes && Array.isArray(chartData.quotes) && chartData.quotes.length > 0) {
            const txTime = txDate.getTime()
            let closestIdx = 0
            let minDiff = Math.abs(new Date(chartData.quotes[0].date).getTime() - txTime)
            
            for (let i = 1; i < chartData.quotes.length; i++) {
              const quoteTime = new Date(chartData.quotes[i].date).getTime()
              const diff = Math.abs(quoteTime - txTime)
              if (diff < minDiff) {
                minDiff = diff
                closestIdx = i
              }
            }
            
            // Only use the price if it's within 3 days of the target date
            const daysDiff = Math.abs(minDiff) / (1000 * 60 * 60 * 24)
            if (daysDiff <= 3) {
              const price = chartData.quotes[closestIdx].close
              if (!cancelled && !manuallyEditedTransferFieldsRef.current.manual_price) {
                setFormData(prev => ({ ...prev, manual_price: price.toFixed(2) }))
              }
            } else {
              if (!cancelled && !manuallyEditedTransferFieldsRef.current.manual_price) {
                setFormData(prev => ({ ...prev, manual_price: '' }))
              }
            }
          } else {
            // No chart data, clear manual_price
            if (!cancelled && !manuallyEditedTransferFieldsRef.current.manual_price) {
              setFormData(prev => ({ ...prev, manual_price: '' }))
            }
          }
        }
      } catch {
        console.error('Failed to auto-fetch price')
        // Don't set manual_price on error
      }
    }
    
    fetchHistoricalPrice()
    return () => { cancelled = true }
  }, [formData.date, formData.account_id, formData.to_account_id, formData.type, accounts])

  // Load saved defaults when opening the form
  const loadSavedDefaults = (type: 'expense' | 'income' | 'transfer') => {
    const availableAccount = (id: string) => accounts.some(account => account.id === id && !isLocked(id)) ? id : ''
    if (type === 'expense') {
      const savedAccount = localStorage.getItem(STORAGE_KEYS.expenseAccount) || ''
      const savedCategory = localStorage.getItem(STORAGE_KEYS.expenseCategory) || ''
      return { account_id: availableAccount(savedAccount), category_id: savedCategory, to_account_id: '', fee: '0' }
    } else if (type === 'income') {
      const savedAccount = localStorage.getItem(STORAGE_KEYS.incomeAccount) || ''
      const savedCategory = localStorage.getItem(STORAGE_KEYS.incomeCategory) || ''
      return { account_id: availableAccount(savedAccount), category_id: savedCategory, to_account_id: '', fee: '0' }
    } else {
      const savedFrom = localStorage.getItem(STORAGE_KEYS.transferFrom) || ''
      const savedTo = localStorage.getItem(STORAGE_KEYS.transferTo) || ''
      return { account_id: availableAccount(savedFrom), to_account_id: availableAccount(savedTo), category_id: '', fee: '0', amount_to: '' }
    }
  }

  // Save defaults to localStorage
  const saveDefaults = (type: 'expense' | 'income' | 'transfer') => {
    if (type === 'expense') {
      if (formData.account_id) localStorage.setItem(STORAGE_KEYS.expenseAccount, formData.account_id)
      if (formData.category_id) localStorage.setItem(STORAGE_KEYS.expenseCategory, formData.category_id)
    } else if (type === 'income') {
      if (formData.account_id) localStorage.setItem(STORAGE_KEYS.incomeAccount, formData.account_id)
      if (formData.category_id) localStorage.setItem(STORAGE_KEYS.incomeCategory, formData.category_id)
    } else {
      if (formData.account_id) localStorage.setItem(STORAGE_KEYS.transferFrom, formData.account_id)
      if (formData.to_account_id) localStorage.setItem(STORAGE_KEYS.transferTo, formData.to_account_id)
    }
  }

  const resetTransferRateState = (clearOriginal = true) => {
    if (clearOriginal) originalTransferRef.current = null
    setTransferSaveError(null)
    manualRateOverrideRef.current = false
    manuallyEditedTransferFieldsRef.current = { amount_to: false, manual_price: false }
    editedTransferPairRef.current = null
    setExchangeRate(null)
    setExchangeRateDraft('')
    setSuggestedRate(null)
  }

  const resetSplitState = () => {
    setSplitLines(null)
    setEditingSplitId(null)
    setAddedAnother(false)
  }

  const resetForm = () => {
    resetSplitState()
    const defaults = loadSavedDefaults('expense')
    setFormData({
      account_id: defaults.account_id,
      to_account_id: '',
      category_id: defaults.category_id,
      amount: '',
      amount_to: '',
      description: '',
      date: getLocalDateString(),
      type: 'expense',
      manual_price: '',
      exclude_from_estimate: false
    })
    resetTransferRateState()
  }

  // When opening the Add form, load defaults
  const handleOpenForm = () => {
    resetSplitState()
    const defaults = loadSavedDefaults('expense')
    setFormData({
      account_id: defaults.account_id,
      to_account_id: '',
      category_id: defaults.category_id,
      amount: '',
      amount_to: '',
      description: '',
      date: getLocalDateString(),
      type: 'expense',
      manual_price: '',
      exclude_from_estimate: false
    })
    resetTransferRateState()
    setIsAccountOpen(false)
    setIsAdding(true)
  }

  const lastOpenRequest = useRef(0)
  useEffect(() => {
    if (openRequest > lastOpenRequest.current) {
      lastOpenRequest.current = openRequest
      if (!isAdding) handleOpenForm()
    }
  }, [openRequest, isAdding, handleOpenForm])

  // Handle type change with saved defaults
  const handleTypeChange = (newType: 'expense' | 'income' | 'transfer') => {
    // Categories belong to a type, so a split keeps its lines and amounts but clears their categories.
    setSplitLines(lines => newType === 'transfer' ? null : lines && lines.map(line => ({ ...line, category_id: '' })))
    const defaults = loadSavedDefaults(newType)
    setFormData({
      ...formData,
      type: newType,
      account_id: defaults.account_id,
      to_account_id: defaults.to_account_id,
      category_id: defaults.category_id,
      amount_to: defaults.amount_to || ''
    })
    resetTransferRateState()
  }

  const handleTransferAccountChange = (
    field: 'account_id' | 'to_account_id',
    accountId: string,
  ) => {
    resetTransferRateState(false)
    setFormData(prev => ({ ...prev, [field]: accountId, amount_to: '', manual_price: '' }))
  }

  // Which submit button was used: only expense and income entries can stay open for the next payment.
  const submitModeRef = useRef<'close' | 'another'>('close')

  const submitSplit = async (addAnother: boolean) => {
    const type = formData.type as 'expense' | 'income'
    const account = accounts.find(a => a.id === formData.account_id)
    let body
    if (splitLines) {
      const resolution = resolveSplit(formData.amount, splitLines)
      if (!resolution.valid) {
        showAlert({ type: 'error', message: resolution.problem === 'amounts' ? 'Enter the amounts for each line'
          : resolution.problem === 'category' ? 'Choose a category for each line' : 'Assign the full amount to the lines' })
        return
      }
      body = toSplitPayloadLines(splitLines, resolution, type)
    } else {
      // A split reduced to one line is saved as an ordinary transaction.
      const amount = parseAmount(formData.amount)
      if (amount === null || amount <= 0) {
        showAlert({ type: 'error', message: 'Please enter a valid amount greater than 0' })
        return
      }
      body = [{ category_id: formData.category_id || null, amount: type === 'expense' ? -amount : amount, note: null }]
    }
    if (account?.type === 'investment') {
      showAlert({ type: 'error', message: 'Investment accounts cannot be split' })
      return
    }
    if (splitLines && isUpcomingForm && !editingPendingSplit) {
      showAlert({ type: 'error', message: 'A split cannot be dated in the future' })
      return
    }

    setIsSubmitting(true)
    try {
      const wasEditing = !!editingSplitId
      await apiFetch(editingSplitId ? `${API_BASE_URL}/transactions/splits/${editingSplitId}` : `${API_BASE_URL}/transactions/splits`, {
        method: editingSplitId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: formData.account_id,
          date: formData.date,
          description: formData.description.trim() || null,
          exclude_from_estimate: type === 'expense' ? formData.exclude_from_estimate : false,
          lines: body,
        }),
      })
      saveDefaults(type)
      refreshRecentBadges()
      onTransactionAdded()
      if (addAnother && !wasEditing) {
        // Keep type, account and date for the next payment.
        setFormData(prev => ({ ...prev, amount: '', category_id: '', description: '', manual_price: '' }))
        setSplitLines(null)
        setAddedAnother(true)
      } else {
        setIsAdding(false)
        resetForm()
      }
      showAlert({
        type: 'success',
        message: body.length > 1 ? (wasEditing ? editingPendingSplit ? 'Split review draft updated' : 'Split updated' : `Split saved as ${body.length} transactions`)
          : wasEditing ? 'Split changed to a single transaction' : 'Transaction created',
      })
    } catch (error) {
      console.error('Failed to save split')
      showAlert({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save split. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    const addAnother = submitModeRef.current === 'another'
    submitModeRef.current = 'close'
    setTransferSaveError(null)
    if (formData.type !== 'transfer' && (splitLines || editingSplitId)) {
      await submitSplit(addAnother)
      return
    }

    const amount = parseAmount(formData.amount)
    if (amount === null || amount <= 0) {
      showAlert({ type: 'error', message: 'Please enter a valid amount greater than 0' })
      return
    }
    
    setIsSubmitting(true)
    try {
      const wasEditing = !!editingId
      const savedType = formData.type
      const savedAsUpcoming = isUpcomingForm

      if (formData.type === 'transfer') {
        // Handle transfer
        const sourceAccount = accounts.find(a => a.id === formData.account_id)
        const toAccount = accounts.find(a => a.id === formData.to_account_id)
        if (!sourceAccount || !toAccount || sourceAccount.id === toAccount.id) {
          throw new Error('Choose two different accounts for the transfer')
        }
        if (isLocked(sourceAccount.id) || isLocked(toAccount.id)) {
          throw new Error('Unlock or restore both accounts before transferring')
        }
        const isSameCurrency = sourceAccount && toAccount
          && sourceAccount.currency === toAccount.currency
        const receivedDraft = parseAmount(formData.amount_to)
        const parsedAmountTo = isSameCurrency ? amount : receivedDraft
        if (parsedAmountTo === null || parsedAmountTo <= 0) {
          throw new Error('Please enter a valid amount to receive greater than 0')
        }
        const amountTo = parsedAmountTo
        let price = undefined
        
        // For transfers to investment accounts, include price
        if (toAccount?.type === 'investment' && formData.manual_price) {
          const parsedPrice = parseAmount(formData.manual_price)
          if (parsedPrice === null || parsedPrice <= 0) {
            throw new Error('Please enter a valid price greater than 0')
          }
          price = parsedPrice
        }

        if (editingId) {
          await apiFetch(`${API_BASE_URL}/transactions/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                account_id: formData.account_id,
                to_account_id: formData.to_account_id,
                amount,
                amount_to: amountTo,
                description: formData.description,
                date: formData.date,
                price,
              }),
          })
          setEditingId(null)
        } else {
          await apiFetch(`${API_BASE_URL}/transfers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from_account_id: formData.account_id,
              to_account_id: formData.to_account_id,
              amount_from: amount,
              amount_to: amountTo,
              exchange_rate: exchangeRate,
              description: formData.description,
              date: formData.date,
              price: price
            }),
          })
        }
        saveDefaults('transfer')
      } else {
        // Handle expense/income
        const finalAmount = formData.type === 'expense' ? -Math.abs(amount) : Math.abs(amount)

        if (editingId) {
          await apiFetch(`${API_BASE_URL}/transactions/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: formData.account_id,
              category_id: formData.category_id || null,
              amount: finalAmount,
              description: formData.description,
              date: formData.date,
              exclude_from_estimate: formData.type === 'expense' ? formData.exclude_from_estimate : false
            }),
          })
          setEditingId(null)
        } else {
          // For investment accounts, use the manual_price if set (auto-filled or manually entered)
          const account = accounts.find(a => a.id === formData.account_id)
          let price = undefined
          
          if (account?.type === 'investment' && formData.manual_price) {
            const parsedPrice = parseAmount(formData.manual_price)
            if (parsedPrice === null || parsedPrice <= 0) {
              throw new Error('Please enter a valid price greater than 0')
            }
            price = parsedPrice
          }
          
          await apiFetch(`${API_BASE_URL}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: formData.account_id,
              category_id: formData.category_id || null,
              amount: finalAmount,
              description: formData.description,
              date: formData.date,
              price: price, // Include price for investment accounts
              exclude_from_estimate: formData.type === 'expense' ? formData.exclude_from_estimate : false
            }),
          })
        }
        saveDefaults(formData.type)
      }
      if (addAnother && !wasEditing && savedType !== 'transfer') {
        // Keep type, account and date for the next payment.
        setFormData(prev => ({ ...prev, amount: '', category_id: '', description: '', manual_price: '' }))
        setAddedAnother(true)
      } else {
        setIsAdding(false)
        resetForm()
      }
      refreshRecentBadges()
      onTransactionAdded()
      showAlert({
        type: 'success',
        message: wasEditing
          ? `${savedType === 'transfer' ? 'Transfer' : 'Transaction'} updated`
          : savedType === 'transfer'
            ? 'Transfer created'
            : savedAsUpcoming
              ? 'Upcoming transaction saved'
              : 'Transaction created'
      })
    } catch (error) {
      if (formData.type === 'transfer') setTransferSaveError(error instanceof Error ? error.message : 'Failed to save transfer. Please try again.')
      console.error('Failed to save transaction')
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save transaction. Please try again.'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Opening any line opens the whole split with its shared fields.
  const handleEditSplit = (splitId: string) => {
    const lines = inEntryOrder(allKnownTransactions.filter(tx => tx.split_id === splitId))
    if (lines.length === 0 || isLocked(lines[0].account_id)) return
    const total = lines.reduce((sum, line) => sum + line.amount, 0)
    resetTransferRateState()
    setFormData({
      account_id: lines[0].account_id,
      to_account_id: '',
      category_id: '',
      amount: formatCalculatedAmount(Math.abs(total), { maximumFractionDigits: 2 }),
      amount_to: '',
      description: lines[0].split_description || '',
      date: lines[0].date,
      type: total >= 0 ? 'income' : 'expense',
      manual_price: '',
      exclude_from_estimate: !!lines[0].exclude_from_estimate,
    })
    setSplitLines(lines.map(line => ({
      ...newSplitLine(line.category_id || '', formatCalculatedAmount(Math.abs(line.amount), { maximumFractionDigits: 2 })),
      note: line.description || '',
    })))
    setEditingId(null)
    setEditingSplitId(splitId)
    setIsAccountOpen(false)
    setIsAdding(true)
  }

  const handleDeleteSplit = async (splitId: string) => {
    const lines = allKnownTransactions.filter(tx => tx.split_id === splitId)
    if (lines.length === 0 || isLocked(lines[0].account_id)) return
    const confirmed = await confirm({
      title: 'Delete Split',
      message: `Delete this split and its ${lines.length} transactions? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })
    if (!confirmed) return

    setDeletingId(`split:${splitId}`)
    try {
      await apiFetch(`${API_BASE_URL}/transactions/splits/${splitId}`, { method: 'DELETE' })
      refreshRecentBadges()
      onTransactionAdded()
      showAlert({ type: 'success', message: 'Split deleted' })
    } catch (error) {
      console.error('Failed to delete split')
      showAlert({ type: 'error', message: error instanceof Error ? error.message : 'Failed to delete split. Please try again.' })
    } finally {
      setDeletingId(null)
    }
  }

  const handleEdit = (tx: Transaction) => {
    // Prevent editing if the account is locked
    if (isLocked(tx.account_id)) {
      return
    }
    
    // For transfers, also check if the linked account is locked
    if (tx.linked_transaction_id) {
      const linkedTx = allKnownTransactions.find(t => t.id === tx.linked_transaction_id)
      if (linkedTx && isLocked(linkedTx.account_id)) {
        return
      }
    }

    if (tx.split_id) {
      handleEditSplit(tx.split_id)
      return
    }

    const formatNumber = (num: number) => isMcpReviewTransaction(tx)
      ? formatAmount(Math.abs(num))
      : formatAmount(Math.abs(num), { maximumFractionDigits: 8 })
    
    const relatedTx = (tx as Transaction & { relatedTx?: Transaction }).relatedTx
      || (tx.linked_transaction_id ? allKnownTransactions.find(t => t.id === tx.linked_transaction_id) : undefined)

    resetTransferRateState()

    if (tx.linked_transaction_id && relatedTx) {
      const outgoing = tx.amount < 0 ? tx : relatedTx
      const incoming = tx.amount < 0 ? relatedTx : tx
      const transferNote = isMcpReviewTransaction(outgoing)
        ? outgoing.description || ''
        : (outgoing.description || '').split(' - ').slice(1).join(' - ')
      const outgoingAccount = accounts.find(account => account.id === outgoing.account_id)
      const incomingAccount = accounts.find(account => account.id === incoming.account_id)
      const incomingValue = incomingAccount?.type === 'investment' && incoming.quantity !== undefined
        ? Math.abs(incoming.quantity)
        : Math.abs(incoming.amount)
      const investmentPrice = incomingAccount?.type === 'investment' && incoming.price !== undefined
        ? formatNumber(incoming.price)
        : ''
      const existingRate = Math.abs(outgoing.amount) > 0
        ? incomingValue / Math.abs(outgoing.amount)
        : null

      const transferData = {
        account_id: outgoing.account_id,
        to_account_id: incoming.account_id,
        category_id: '',
        amount: formatNumber(outgoing.amount),
        amount_to: formatNumber(incomingValue),
        description: transferNote,
        date: outgoing.date,
        type: 'transfer' as const,
        manual_price: investmentPrice,
        exclude_from_estimate: false
      }
      setFormData(transferData)
      const isDifferentCurrency = outgoingAccount && incomingAccount
        && outgoingAccount.currency !== incomingAccount.currency
      const historicalRate = isDifferentCurrency ? existingRate : null
      editedTransferPairRef.current = getTransferPairKey(outgoing.account_id, incoming.account_id)
      manuallyEditedTransferFieldsRef.current.amount_to = !!isDifferentCurrency
      manualRateOverrideRef.current = true
      manuallyEditedTransferFieldsRef.current.manual_price = incomingAccount?.type === 'investment' && incoming.price !== undefined
      setExchangeRate(historicalRate)
      setExchangeRateDraft(historicalRate === null
        ? ''
        : formatCalculatedAmount(historicalRate, { maximumFractionDigits: 12 })
      )
      originalTransferRef.current = {
        data: transferData,
        rate: historicalRate,
        rateDraft: historicalRate === null ? '' : formatCalculatedAmount(historicalRate, { maximumFractionDigits: 12 }),
      }
      setEditingId(outgoing.id)
      setIsAccountOpen(false)
      setIsAdding(true)
      return
    }

    const isIncome = tx.amount >= 0
    const account = accounts.find(a => a.id === tx.account_id)

    // For investment accounts, use quantity (shares) instead of amount (USD)
    const amountValue = account?.type === 'investment' && tx.quantity !== undefined
      ? formatNumber(tx.quantity)
      : formatNumber(tx.amount)
    
    // Calculate price from amount and quantity for investment accounts
    let priceValue = ''
    if (account?.type === 'investment' && tx.quantity !== undefined && tx.quantity !== 0) {
      priceValue = formatNumber(Math.abs(tx.amount) / Math.abs(tx.quantity))
    }
    
    setFormData({
      account_id: tx.account_id,
      to_account_id: '',
      category_id: tx.category_id || '',
      amount: amountValue,
      amount_to: '',
      description: tx.description || '',
      date: tx.date,
      type: isIncome ? 'income' : 'expense',
      manual_price: priceValue,
      exclude_from_estimate: !!tx.exclude_from_estimate
    })
    setEditingId(tx.id)
    setIsAccountOpen(false)
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    // Find the transaction first to check if account is locked
    const tx = allKnownTransactions.find(t => t.id === id)
    if (!tx) return
    
    // Check if the account is locked
    if (isLocked(tx.account_id)) {
      return
    }
    
    // For transfers, also check if the linked account is locked
    if (tx.linked_transaction_id) {
      const linkedTx = allKnownTransactions.find(t => t.id === tx.linked_transaction_id)
      if (linkedTx && isLocked(linkedTx.account_id)) {
        return
      }
    }
    
    const confirmed = await confirm({
      title: 'Delete Transaction',
      message: 'Delete this transaction? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })
    
    if (!confirmed) return
    
    setDeletingId(id)
    try {
      // Find the transaction to determine if it's an investment transaction
      const tx = allKnownTransactions.find(t => t.id === id)
      const account = accounts.find(a => a.id === tx?.account_id)
      
      // If it's an investment account and has quantity data, it's from investment_transactions table
      const isInvestmentTx = account?.type === 'investment' && tx?.quantity !== undefined
      
      if (isInvestmentTx) {
        await apiFetch(`${API_BASE_URL}/investment-transactions/${id}`, { method: 'DELETE' })
      } else {
        await apiFetch(`${API_BASE_URL}/transactions/${id}`, { method: 'DELETE' })
      }
      
      refreshRecentBadges()
      onTransactionAdded()
      showAlert({ type: 'success', message: 'Transaction deleted' })
    } catch (error) {
      console.error('Failed to delete transaction')
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete transaction. Please try again.'
      })
    } finally {
      setDeletingId(null)
    }
  }

  const splitLinesOf = (tx: Transaction) => upcomingTransactions.filter(line => line.split_id === tx.split_id)

  // Hide a resolved review item at once: both transfer legs, or every line of a split.
  const markResolved = (tx: Transaction) => setResolvedPendingIds(ids => {
    const next = new Set(ids).add(tx.id)
    if (tx.linked_transaction_id) next.add(tx.linked_transaction_id)
    if (tx.split_id) splitLinesOf(tx).forEach(line => next.add(line.id))
    return next
  })

  const handleConfirmUpcoming = async (tx: Transaction) => {
    if (pendingActionId) return

    const isMcpReview = isMcpReviewTransaction(tx)
    setPendingActionId(tx.id)
    try {
      // A split is confirmed as a whole: every line posts and its total reaches the balance once.
      const res = await apiFetch(tx.split_id ? `${API_BASE_URL}/transactions/splits/${tx.split_id}/confirm` : `${API_BASE_URL}/transactions/${tx.id}/confirm`, {
        method: 'POST'
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to confirm transaction')
      }

      refreshRecentBadges()
      markResolved(tx)
      onTransactionAdded()
      showAlert({
        type: 'success',
        message: tx.split_id ? 'Split review draft confirmed' : tx.linked_transaction_id ? 'Transfer review pair confirmed' : isMcpReview ? 'MCP draft confirmed' : 'Upcoming transaction confirmed'
      })
    } catch (error) {
      console.error('Failed to confirm upcoming transaction')
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to confirm transaction. Please try again.'
      })
    } finally {
      setPendingActionId(null)
    }
  }

  const handleDeclineUpcoming = async (tx: Transaction) => {
    if (pendingActionId) return

    const isMcpReview = isMcpReviewTransaction(tx)

    const confirmed = await confirm({
      title: 'Decline Transaction',
      message: tx.split_id
        ? `Decline this split and all ${splitLinesOf(tx).length} of its lines? Your balance will not change.`
        : tx.linked_transaction_id
        ? 'Decline both sides of this transfer review draft? Neither balance will change.'
        : isMcpReview
        ? 'Decline this MCP draft? It will not affect your balance.'
        : 'Decline this upcoming transaction? It will not affect your balance.',
      confirmText: 'Decline',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    setPendingActionId(tx.id)
    try {
      const res = await apiFetch(tx.split_id ? `${API_BASE_URL}/transactions/splits/${tx.split_id}/decline` : `${API_BASE_URL}/transactions/${tx.id}/decline`, {
        method: 'POST'
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to decline transaction')
      }

      markResolved(tx)
      onTransactionAdded()
      showAlert({
        type: 'success',
        message: tx.split_id ? 'Split review draft declined' : tx.linked_transaction_id ? 'Transfer review pair declined' : isMcpReview ? 'MCP draft declined' : 'Upcoming transaction declined'
      })
    } catch (error) {
      console.error('Failed to decline upcoming transaction')
      showAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to decline transaction. Please try again.'
      })
    } finally {
      setPendingActionId(null)
    }
  }

  const handleCancel = () => {
    if (isSubmitting) return
    setIsAdding(false)
    setEditingId(null)
    resetForm()
  }

  const matchesSearch = (tx: Transaction): boolean => {
    // The shared split description (payee) is searchable alongside each line's note.
    return matchesTransaction(searchQuery, tx.split_description ? { ...tx, description: [tx.description, tx.split_description].filter(Boolean).join(' ') } : tx, accounts, categories)
  }

  const getCategoryName = (id?: string | null) => {
    if (!id) return 'Uncategorized'
    const cat = categories.find(c => c.id === id)
    return cat ? cat.name : 'Unknown'
  }

  const getCategoryIcon = (id?: string | null) => {
    if (!id) return '📄'
    const cat = categories.find(c => c.id === id)
    return cat?.icon || '📄'
  }

  const getAccountName = (id: string) => {
    const acc = accounts.find(a => a.id === id)
    return acc ? acc.name : 'Unknown'
  }

  const getAccountCurrency = (id: string) => {
    const acc = accounts.find(a => a.id === id)
    return acc ? acc.currency : 'HUF'
  }

  // For transfer preview
  const fromAccount = accounts.find(a => a.id === formData.account_id)
  const toAccount = accounts.find(a => a.id === formData.to_account_id)
  const selectedAmountUnit = fromAccount?.asset_type === 'manual' ? 'ITEM' : fromAccount?.currency
  const isEditingTransfer = !!editingId && formData.type === 'transfer'
  const isEditingStandardTransaction = !!editingId && formData.type !== 'transfer'

  const originalTransfer = originalTransferRef.current
  const transferDirty = !!originalTransfer && (
    (['account_id', 'to_account_id', 'date', 'description'] as const).some(key => formData[key] !== originalTransfer.data[key])
    || (['amount', 'amount_to', 'manual_price'] as const).some(key => parseAmount(formData[key]) !== parseAmount(originalTransfer.data[key]))
    || parseAmount(exchangeRateDraft) !== parseAmount(originalTransfer.rateDraft)
  )
  // Posted balances already include the old legs. Undo them before previewing
  // the replacement, including when either selected account has changed.
  const availableTransferBalance = (account: TransferAccount) => {
    let balance = account.balance
    const originalRow = allKnownTransactions.find(tx => tx.id === editingId)
    if (originalTransfer && originalRow && (originalRow.status ?? 'posted') === 'posted') {
      if (account.id === originalTransfer.data.account_id) balance += parseAmount(originalTransfer.data.amount) || 0
      if (account.id === originalTransfer.data.to_account_id) balance -= parseAmount(originalTransfer.data.amount_to) || 0
    }
    return balance
  }
  const handleTransferAmountChange = (amount: string) => {
    setFormData(prev => ({ ...prev, amount }))
    // Keep explicitly entered received amounts, while displaying their current
    // effective rate when the sent amount changes.
    if (manuallyEditedTransferFieldsRef.current.amount_to && fromAccount && toAccount && fromAccount.currency !== toAccount.currency) {
      const sent = parseAmount(amount)
      const received = parseAmount(formData.amount_to)
      const rate = sent !== null && sent > 0 && received !== null && received > 0 ? received / sent : null
      setExchangeRate(rate)
      setExchangeRateDraft(rate === null ? '' : formatCalculatedAmount(rate, { maximumFractionDigits: 12 }))
    }
  }
  const handleTransferReceivedChange = (amountTo: string) => {
    manuallyEditedTransferFieldsRef.current.amount_to = true
    manualRateOverrideRef.current = true
    setFormData(prev => ({ ...prev, amount_to: amountTo }))
    const sent = parseAmount(formData.amount)
    const received = parseAmount(amountTo)
    const rate = sent !== null && sent > 0 && received !== null && received > 0 ? received / sent : null
    if (fromAccount && toAccount && fromAccount.currency !== toAccount.currency) {
      setExchangeRate(rate)
      setExchangeRateDraft(rate === null ? '' : formatCalculatedAmount(rate, { maximumFractionDigits: 12 }))
    }
  }
  const handleTransferRateChange = (draft: string) => {
    manualRateOverrideRef.current = true
    manuallyEditedTransferFieldsRef.current.amount_to = false
    setExchangeRateDraft(draft)
    const rate = parseAmount(draft)
    setExchangeRate(rate !== null && rate > 0 ? rate : null)
    // Clearing the rate clears its calculated amount, so an invalid draft
    // cannot silently submit the previous conversion.
    if (rate === null || rate <= 0) setFormData(prev => ({ ...prev, amount_to: '' }))
  }
  const handleSwapTransfer = () => {
    if (!fromAccount || !toAccount || isSubmitting) return
    const sameCurrency = fromAccount.currency === toAccount.currency
    const sent = sameCurrency ? formData.amount : formData.amount_to
    const received = formData.amount
    const sentValue = parseAmount(sent)
    const receivedValue = parseAmount(received)
    const rate = !sameCurrency && sentValue && receivedValue ? receivedValue / sentValue : null
    rateRequestSequenceRef.current += 1
    manualRateOverrideRef.current = true
    manuallyEditedTransferFieldsRef.current.amount_to = !sameCurrency
    // A price belongs to the receiving holding and cannot follow a swap.
    manuallyEditedTransferFieldsRef.current.manual_price = false
    setSuggestedRate(null)
    setTransferSaveError(null)
    setExchangeRate(rate)
    setExchangeRateDraft(rate === null ? '' : formatCalculatedAmount(rate, { maximumFractionDigits: 12 }))
    setFormData(prev => ({ ...prev, account_id: prev.to_account_id, to_account_id: prev.account_id,
      amount: sent, amount_to: received, manual_price: '' }))
  }
  const handleRevertTransfer = () => {
    if (!originalTransfer || isSubmitting) return
    manualRateOverrideRef.current = true
    if (formData.account_id !== originalTransfer.data.account_id || formData.to_account_id !== originalTransfer.data.to_account_id) setSuggestedRate(null)
    manuallyEditedTransferFieldsRef.current = { amount_to: true, manual_price: !!originalTransfer.data.manual_price }
    editedTransferPairRef.current = getTransferPairKey(originalTransfer.data.account_id, originalTransfer.data.to_account_id)
    setFormData({ ...originalTransfer.data })
    setExchangeRate(originalTransfer.rate)
    setExchangeRateDraft(originalTransfer.rateDraft)
    setIsLoadingRate(false)
    setTransferSaveError(null)
  }
  const typeSelector = !isEditingTransfer && (
    <div className={cn('grid grid-cols-3', formData.type === 'transfer' ? 'gap-0.5 rounded-[10px] border border-border/50 bg-background p-[3px]' : 'gap-2')}>
      {([['expense', 'Expense', ArrowUpRight], ['income', 'Income', ArrowDownLeft], ['transfer', 'Transfer', ArrowRightLeft]] as const).map(([type, label, Icon]) => (
        <button key={type} type="button" disabled={isSubmitting || (isEditingStandardTransaction && type === 'transfer')}
          onClick={() => handleTypeChange(type)} aria-pressed={formData.type === type}
          className={cn('flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50',
            formData.type === 'transfer' ? 'h-8' : 'border border-border p-3 text-sm',
            formData.type === 'transfer'
              ? formData.type === type ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              : formData.type === type
                ? type === 'expense' ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-success/50 bg-success/10 text-success'
                : 'bg-background/50 text-muted-foreground hover:bg-background')}>
          <Icon className={formData.type === 'transfer' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />{label}
        </button>
      ))}
    </div>
  )

  // Group transactions by date
  const groupedTransactions = transactions.reduce((groups, tx) => {
    const date = tx.date
    if (!groups[date]) groups[date] = []
    groups[date].push(tx)
    return groups
  }, {} as Record<string, Transaction[]>)

  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  )

  const applyFilters = (tx: Transaction) => {
    const catMatch = categoryFilter === 'all' ? true
      : categoryFilter === 'all-expenses' ? (tx.amount < 0 && !tx.linked_transaction_id)
      : categoryFilter === 'all-income' ? (tx.amount > 0 && !tx.linked_transaction_id)
      : categoryFilter === 'transfer' ? !!tx.linked_transaction_id
      : tx.category_id === categoryFilter
    return catMatch && matchesSearch(tx)
  }

  const visibleUpcomingTransactions = upcomingTransactions.filter(tx => !resolvedPendingIds.has(tx.id))
  // A pending split is one review item with the full total, even when a filter matched only some of its lines.
  const groupPendingSplits = (items: Transaction[]): PendingItem[] => {
    const seen = new Set<string>()
    return items.flatMap(tx => {
      if (!tx.split_id) return [tx]
      if (seen.has(tx.split_id)) return []
      seen.add(tx.split_id)
      const lines = inEntryOrder(visibleUpcomingTransactions.filter(line => line.split_id === tx.split_id))
      const group = lines.length > 0 ? lines : [tx]
      return [{ ...group[0], id: `split:${tx.split_id}`, description: tx.split_description, amount: group.reduce((sum, line) => sum + line.amount, 0), splitGroup: group }]
    })
  }
  const standardPendingCount = visibleUpcomingTransactions.filter(tx => !isMcpReviewTransaction(tx)).length
  const mcpReviewTransactions = groupPendingSplits(getMcpReviewItems(visibleUpcomingTransactions, applyFilters))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const mcpReviewCount = mcpReviewTransactions.length

  // Keep legacy pending rows visible as upcoming while the migration rolls out.
  // Projection calculations are stricter and require pending_kind === 'upcoming'.
  const pendingFilteredTransactions = groupPendingSplits(visibleUpcomingTransactions
    .filter(tx => !isMcpReviewTransaction(tx))
    .filter(applyFilters))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const readyTransactions = pendingFilteredTransactions.filter(tx => tx.date <= today)
  const futureTransactions = pendingFilteredTransactions.filter(tx => tx.date > today)
  const totalFilteredCount = transactions.filter(applyFilters).length
    + pendingFilteredTransactions.length
    + mcpReviewTransactions.length

  // Helper to process transactions and merge transfers
  const processTransactions = (txs: Transaction[]) => {
    const processed: (Transaction & { relatedTx?: Transaction; splitGroup?: Transaction[] })[] = []
    const skipIds = new Set<string>()
    const seenSplits = new Set<string>()

    txs.forEach(tx => {
      if (skipIds.has(tx.id)) return

      if (tx.split_id) {
        // A split shows as one row with the full total, even when a filter matched only some of its lines.
        if (seenSplits.has(tx.split_id)) return
        seenSplits.add(tx.split_id)
        const group = inEntryOrder(transactions.filter(line => line.split_id === tx.split_id))
        const lines = group.length > 0 ? group : [tx]
        processed.push({ ...lines[0], id: `split:${tx.split_id}`, description: tx.split_description, amount: lines.reduce((sum, line) => sum + line.amount, 0), splitGroup: lines })
        return
      }

      if (tx.linked_transaction_id) {
        const related = txs.find(t => t.id === tx.linked_transaction_id)
          ?? transactions.find(t => t.id === tx.linked_transaction_id)
        if (related) {
          // Found the pair.
          // We prefer to show the outgoing one (negative) as the main one
          if (tx.amount < 0) {
             processed.push({ ...tx, relatedTx: related })
             skipIds.add(related.id)
          } else {
             // Current is incoming. Use related (outgoing) as base.
             processed.push({ ...related, relatedTx: tx })
             skipIds.add(related.id)
          }
        } else {
          // Linked tx not found in this list
          processed.push(tx)
        }
      } else {
        processed.push(tx)
      }
    })
    
    return processed
  }

  const renderRecentBadge = (tx: Transaction) => {
    const recentLabel = getRecentTransactionLabel(tx, badgeNow)
    if (!recentLabel) return null

    return (
      <span className="flex-shrink-0 select-none text-[10px] font-medium lowercase leading-none text-primary/90 animate-pulse-slow">
        {recentLabel}
      </span>
    )
  }

  const nativeAmount = (value: number, accountId: string, signed = true) => {
    const account = accounts.find(a => a.id === accountId)
    if (privacyMode === 'hidden' || (account?.type === 'investment' && shouldHideInvestment())) return '••••••'
    const digits = account?.type === 'investment' ? 8 : account?.currency === 'HUF' ? 0 : 2
    return `${signed ? value > 0 ? '+' : value < 0 ? '−' : '' : ''}${formatCalculatedAmount(Math.abs(value), { minimumFractionDigits: digits === 2 ? 2 : 0, maximumFractionDigits: digits }).replace('.', ',')} ${getAccountCurrency(accountId)}`
  }
  const convertedAmount = (value: number | null) => value === null ? 'Total unavailable' : privacyMode === 'hidden' ? '••••••' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCalculatedAmount(Math.abs(value), { maximumFractionDigits: masterCurrency === 'HUF' ? 0 : 2 }).replace('.', ',')} ${masterCurrency}`
  const convertCash = (tx: Transaction) => {
    const account = accounts.find(a => a.id === tx.account_id)
    if (!account || account.type === 'investment') return null
    return convertToMasterCurrency ? convertToMasterCurrency(tx.amount, tx.account_id) : account.currency === masterCurrency ? tx.amount : null
  }
  const cashFlowTransactions = (items: Transaction[]) => items.filter(tx =>
    !tx.linked_transaction_id && accounts.find(account => account.id === tx.account_id)?.type !== 'investment')
  const sumCash = (items: Transaction[]) => {
    const values = cashFlowTransactions(items).map(convertCash)
    return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + value!, 0)
  }
  const reviewTransactions = [...readyTransactions, ...mcpReviewTransactions].sort((a, b) => a.date.localeCompare(b.date))

  // Preview only the review items currently shown that can be confirmed now.
  // A transfer contributes both native legs, even if only one matches a filter.
  const confirmationLegs = new Map<string, Transaction>()
  const canPreviewConfirmation = (tx: Transaction) => tx.date <= today
    && (tx.status ?? 'pending') === 'pending'
    && Number.isFinite(tx.amount)
    && accounts.some(account => account.id === tx.account_id && account.type === 'cash')
    && !isLocked(tx.account_id)
  for (const tx of reviewTransactions) {
    if (!canPreviewConfirmation(tx)) continue
    if (tx.linked_transaction_id) {
      const linked = visibleUpcomingTransactions.find(other => other.id === tx.linked_transaction_id)
      if (!isMcpReviewTransaction(tx) || !linked || !isMcpReviewTransaction(linked)
        || linked.linked_transaction_id !== tx.id || !canPreviewConfirmation(linked)) continue
      confirmationLegs.set(linked.id, linked)
    }
    confirmationLegs.set(tx.id, tx)
  }
  const confirmationDeltas = new Map<string, number>()
  for (const tx of confirmationLegs.values()) {
    confirmationDeltas.set(tx.account_id, (confirmationDeltas.get(tx.account_id) ?? 0) + tx.amount)
  }
  const confirmationBalancePreviews = accounts.flatMap(account => {
    const delta = confirmationDeltas.get(account.id)
    return delta === undefined ? [] : [{ account, acceptedBalance: account.balance + delta }]
  })
  const previewBalance = (value: number, accountId: string) => {
    const formatted = nativeAmount(value, accountId, false)
    return value < 0 && formatted !== '••••••' ? `−${formatted}` : formatted
  }

  const renderPendingTransaction = (tx: PendingItem, ready: boolean) => {
    const group = tx.splitGroup
    const expanded = !!group && expandedSplits.has(tx.id)
    const linked = tx.linked_transaction_id ? visibleUpcomingTransactions.find(other => other.id === tx.linked_transaction_id) : undefined
    const outgoing = linked && tx.amount > 0 ? linked : tx
    const incoming = linked && tx.amount > 0 ? tx : linked
    const isReview = isMcpReviewTransaction(tx)
    const locked = isLocked(tx.account_id) || !!(linked && isLocked(linked.account_id))
    const daysLate = differenceInCalendarDays(parseISO(today), parseISO(tx.date))
    const dateLabel = format(parseISO(tx.date), 'MMM d, yyyy')
    const statusLabel = isReview ? 'MCP draft' : ready ? daysLate > 0 ? `${daysLate} day${daysLate === 1 ? '' : 's'} late` : 'Due today' : `Expected ${dateLabel}`
    const actionName = linked ? 'transfer review draft' : group ? isReview ? 'split review draft' : 'split' : isReview ? 'MCP draft' : 'transaction'
    const busy = pendingActionId === tx.id
    return <div key={tx.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-border px-3 py-3 sm:flex sm:flex-wrap sm:gap-3 sm:px-4">
      <div aria-hidden="true" className={cn('hidden h-9 w-9 shrink-0 items-center justify-center rounded-[10px] sm:flex', tx.linked_transaction_id || group ? 'bg-primary/10 text-primary' : 'bg-secondary')}>
        {tx.linked_transaction_id ? <ArrowRightLeft className="h-4 w-4" /> : group ? <Split className="h-4 w-4" /> : getCategoryIcon(tx.category_id)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium"><button type="button" disabled={locked} aria-expanded={pendingDetails === tx.id} aria-label={`More actions for ${tx.description || (group ? 'split' : getCategoryName(tx.category_id))}`} onClick={() => setPendingDetails(pendingDetails === tx.id ? null : tx.id)} className="flex min-w-0 items-center gap-1 text-left"><span className="truncate">{tx.description || (linked ? 'Transfer' : group ? 'Split' : getCategoryName(tx.category_id))}</span><MoreHorizontal className="h-3 w-3 shrink-0 text-muted-foreground sm:hidden" /></button>{renderRecentBadge(tx)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground"><span className={cn('font-medium', isReview ? 'text-violet-600 dark:text-violet-300' : ready ? 'text-amber-700 dark:text-amber-300' : '')}>{statusLabel}</span> · {linked ? `${getAccountName(outgoing.account_id)} → ${getAccountName(incoming!.account_id)}` : group ? `Split · ${group.length} lines · ${getAccountName(tx.account_id)}` : `${getCategoryName(tx.category_id)} · ${getAccountName(tx.account_id)}`} · {dateLabel}</p>
        {isReview && !ready && <p className="mt-1 text-xs text-muted-foreground">Confirm on {dateLabel}</p>}
        {hasPossibleDuplicateFlag(tx.review_flags) && <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertCircle className="h-3 w-3" />Possible duplicate</span>}
      </div>
      <div className="flex max-w-full items-center gap-1 text-right text-sm font-semibold tabular-nums"><div>
        {linked ? <><div><span className="sr-only">Sent </span>{nativeAmount(outgoing.amount, outgoing.account_id, false)}</div><div className="text-xs font-medium text-muted-foreground"><span className="sr-only">Received </span>→ {nativeAmount(incoming!.amount, incoming!.account_id, false)}</div></> : <span className={tx.amount > 0 ? 'text-success' : 'text-foreground'}>{nativeAmount(tx.amount, tx.account_id)}</span>}
      </div>{renderSplitChevron(group ? tx.id : null)}</div>
      {!locked && <div className="ml-auto flex items-center gap-1 sm:ml-0">
        {(!tx.linked_transaction_id || isReview) && <Button size="icon" variant="ghost" className={cn("h-11 w-11 sm:h-9 sm:w-9", pendingDetails === tx.id ? "" : "hidden sm:inline-flex")} disabled={pendingActionId !== null} aria-label={linked ? 'Edit transfer review draft' : group ? `Edit ${actionName}` : isReview ? 'Edit MCP draft' : 'Edit upcoming transaction'} onClick={() => handleEdit(outgoing)}><Pencil className="h-3.5 w-3.5" /></Button>}
        {ready && (!tx.linked_transaction_id || isReview) && <Button size="sm" variant="ghost" className="h-11 w-11 bg-success/10 p-0 text-success sm:h-9 sm:w-auto sm:px-3" disabled={pendingActionId !== null} aria-label={`Confirm ${actionName}`} onClick={() => handleConfirmUpcoming(outgoing)}>{busy ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Check className="h-4 w-4 sm:mr-1" />}<span className="sr-only sm:not-sr-only">Confirm</span></Button>}
        {!ready && isReview && (!tx.linked_transaction_id || isReview) && <Button size="sm" variant="ghost" className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-3" disabled title={`Can be confirmed on ${dateLabel}`} aria-label={`Confirm ${actionName} available on ${dateLabel}`}><Check className="h-4 w-4 sm:mr-1" /><span className="sr-only sm:not-sr-only">Confirm</span></Button>}
        {(ready || isReview) && (!tx.linked_transaction_id || isReview) ? <Button size="sm" variant="ghost" className={cn("h-11 px-3 text-muted-foreground sm:h-9", pendingDetails === tx.id ? "" : "hidden sm:inline-flex")} disabled={pendingActionId !== null} aria-label={`Decline ${actionName}`} onClick={() => handleDeclineUpcoming(outgoing)}>Decline</Button>
          : !tx.linked_transaction_id && <Button size="icon" variant="ghost" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={group ? 'Delete upcoming split' : 'Delete upcoming transaction'} disabled={deletingId === tx.id} onClick={event => { event.stopPropagation(); if (group && tx.split_id) handleDeleteSplit(tx.split_id); else handleDelete(tx.id) }}><Trash2 className="h-4 w-4" /></Button>}
      </div>}
      {/* Line amounts end under the item total: leave room for the confirm column (mobile) or the edit, confirm and decline buttons. */}
      {expanded && group && <ul className={cn('col-span-3 basis-full space-y-1 border-l border-border pl-3 sm:ml-12', locked ? 'pr-6' : 'pr-[4.75rem] sm:pr-[15.3rem]')} aria-label="Split lines">
        {group.map(line => <li key={line.id} className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true">{getCategoryIcon(line.category_id)}</span><span className="min-w-0 flex-1 truncate">{getCategoryName(line.category_id)}{line.description ? ` · ${line.description}` : ''}</span><span className="tabular-nums">{nativeAmount(line.amount, line.account_id, true)}</span></li>)}
      </ul>}
    </div>
  }

  // The line count doubles as the expand toggle, so split rows need no extra column and amounts stay aligned.
  // A small chevron sits right next to the amount; rows without lines keep an equal blank slot so amounts stay in one column.
  const renderSplitChevron = (id: string | null) => {
    if (!id) return <span aria-hidden="true" className="w-5 shrink-0" />
    const expanded = expandedSplits.has(id)
    return <button type="button" aria-label={expanded ? 'Hide split lines' : 'Show split lines'} aria-expanded={expanded}
      className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground after:absolute after:-inset-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={event => { event.stopPropagation(); setExpandedSplits(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next }) }}><ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} /></button>
  }

  const renderPostedTransaction = (tx: Transaction & { relatedTx?: Transaction; splitGroup?: Transaction[] }) => {
    const related = tx.relatedTx
    const transfer = !!tx.linked_transaction_id
    const group = tx.splitGroup
    const account = accounts.find(a => a.id === tx.account_id)
    const converted = !transfer && account?.currency !== masterCurrency ? convertCash(tx) : null
    const expanded = !!group && expandedSplits.has(tx.id)
    const canChange = !isLocked(tx.account_id) && !(related && isLocked(related.account_id))
    return <div key={tx.id} className="group flex flex-wrap items-center gap-3 rounded-lg px-1 py-2 hover:bg-secondary/40 sm:px-2" onClick={() => setActiveTxId(activeTxId === tx.id ? null : tx.id)}>
      <div aria-hidden="true" className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', transfer || group ? 'bg-primary/10 text-primary' : 'bg-secondary')}>{transfer ? <ArrowRightLeft className="h-4 w-4" /> : group ? <Split className="h-4 w-4" /> : getCategoryIcon(tx.category_id)}</div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium"><button type="button" aria-label={`Actions for ${tx.description || (group ? 'split' : 'transaction')}`} aria-expanded={activeTxId === tx.id} className="min-w-0 truncate text-left">{transfer ? related ? `${getAccountName(tx.account_id)} → ${getAccountName(related.account_id)}` : tx.description || 'Transfer' : group ? tx.description || 'Split' : tx.description || getCategoryName(tx.category_id)}</button>{renderRecentBadge(tx)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sortOrder !== 'date' && `${format(parseISO(tx.date), 'MMM d, yyyy')} · `}{transfer ? 'Transfer' : group ? `Split · ${group.length} lines · ${getAccountName(tx.account_id)}` : `${getCategoryName(tx.category_id)} · ${getAccountName(tx.account_id)}`}</p>
      </div>
      {/* Amount on top, row actions stacked below it, so amounts sit at the card edge on every row. */}
      <div className="flex max-w-full flex-col items-end gap-0.5 self-start text-right tabular-nums">
        <div className="flex items-center gap-1"><p className={cn('text-sm font-semibold', !transfer && tx.amount > 0 ? 'text-success' : 'text-foreground')}>{nativeAmount(account?.type === 'investment' && tx.quantity !== undefined ? tx.quantity : tx.amount, tx.account_id, !transfer)}</p>{renderSplitChevron(group ? tx.id : null)}</div>
        {related ? <p className="pr-6 text-xs text-muted-foreground">→ {nativeAmount(related.quantity ?? related.amount, related.account_id, false)}</p> : !transfer && account?.type === 'cash' && account.currency !== masterCurrency && <p className="pr-6 text-xs text-muted-foreground">{privacyMode === 'hidden' ? '••••••' : converted === null ? 'Conversion unavailable' : `≈ ${convertedAmount(Math.abs(converted)).replace(/^\+/, '')}`}</p>}
        {canChange && <div className={cn("-mr-2 items-center sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", activeTxId === tx.id ? "flex" : "hidden")}>
        <Button size="icon" variant="ghost" className="h-11 w-9 sm:h-8 sm:w-8" aria-label={transfer ? 'Edit transfer' : group ? 'Edit split' : 'Edit transaction'} onClick={event => { event.stopPropagation(); handleEdit(tx) }}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-11 w-9 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8" aria-label={transfer ? 'Delete transfer' : group ? 'Delete split' : 'Delete transaction'} disabled={deletingId === tx.id} onClick={event => { event.stopPropagation(); if (group && tx.split_id) handleDeleteSplit(tx.split_id); else handleDelete(tx.id) }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>}
      </div>
      {expanded && group && <ul className="basis-full space-y-1 border-l border-border pl-3 pr-6 sm:ml-12" aria-label="Split lines">
        {group.map(line => <li key={line.id} className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true">{getCategoryIcon(line.category_id)}</span><span className="min-w-0 flex-1 truncate">{getCategoryName(line.category_id)}{line.description ? ` · ${line.description}` : ''}</span><span className="tabular-nums">{nativeAmount(line.amount, line.account_id, true)}</span></li>)}
      </ul>}
    </div>
  }

  useEffect(() => {
    if (navigationKey === lastNavigationKey.current) return
    lastNavigationKey.current = navigationKey
    if (composerOnly && isAdding) handleCancel()
  }, [navigationKey, composerOnly, isAdding, handleCancel])

  return (
    <Card className={composerOnly ? "contents" : undefined}>
      {!composerOnly && <CardHeader className="space-y-0 p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1"><CardTitle className="text-[15px]">Transactions</CardTitle><p className="mt-1 text-xs text-muted-foreground">{processTransactions(transactions).length} posted{standardPendingCount > 0 ? ` · ${standardPendingCount} upcoming` : ''}{mcpReviewCount > 0 ? ` · ${mcpReviewCount} MCP drafts` : ''}</p></div>
          <div className="hidden rounded-lg border border-border p-0.5 sm:inline-flex" role="group" aria-label="Transaction view">
            <button type="button" onClick={() => setTransactionView('list')} aria-pressed={transactionView === 'list'} className={cn('min-h-9 rounded-md px-2 text-xs sm:px-3', transactionView === 'list' ? 'bg-secondary font-medium' : 'text-muted-foreground')}>List</button>
            <button type="button" onClick={openCalendar} aria-pressed={transactionView === 'calendar'} className={cn('min-h-9 rounded-md px-2 text-xs sm:px-3', transactionView === 'calendar' ? 'bg-secondary font-medium' : 'text-muted-foreground')}>Calendar</button>
          </div>
          <Button onClick={() => isAdding ? handleCancel() : handleOpenForm()} size="sm" className="hidden h-10 px-3 sm:inline-flex"><Plus className="mr-1 h-4 w-4" />New</Button>
        </div>
        <div className="flex items-center justify-between border-b border-border px-4 py-2 sm:hidden"><button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} className="flex min-h-10 items-center gap-2 text-[13px] text-muted-foreground"><SlidersHorizontal className="h-4 w-4" />Filters{categoryFilter !== 'all' || searchQuery ? ' · active' : ''}</button><button type="button" onClick={() => transactionView === 'calendar' ? setTransactionView('list') : openCalendar()} className="min-h-10 px-2 text-[13px] text-muted-foreground">{transactionView === 'calendar' ? 'List view' : 'Calendar view'}</button></div>
        <div className={cn("flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:flex sm:px-5", filtersOpen ? "flex" : "hidden")}>
          <div className="relative min-w-0 flex-[1_1_180px] xl:max-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" aria-label="Filter transactions" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search transactions..." className="h-10 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex items-center gap-0.5" role="group" aria-label="Transaction type">
            {([['all', 'All'], ['all-expenses', 'Expenses'], ['all-income', 'Income'], ['transfer', 'Transfers']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={categoryFilter === value} onClick={() => setCategoryFilter(value)} className={cn('min-h-10 rounded-lg border px-2 text-[13px] sm:px-3', categoryFilter === value ? 'border-border bg-secondary font-medium' : 'border-transparent text-muted-foreground hover:bg-secondary')}>{label}</button>)}
          </div>
          <Select value={['all', 'all-expenses', 'all-income', 'transfer'].includes(categoryFilter) ? 'all' : categoryFilter} aria-label="Transaction category" onChange={e => setCategoryFilter(e.target.value)} className="h-10 w-auto min-w-0 flex-1 text-[13px] sm:max-w-44">
            <option value="all">Category</option>
            {!['all', 'all-expenses', 'all-income', 'transfer'].includes(categoryFilter) && !categories.some(category => category.id === categoryFilter) && <option value={categoryFilter}>Selected category (unavailable)</option>}
            {(['expense', 'income'] as const).map(type => <optgroup key={type} label={type === 'expense' ? 'Expenses' : 'Income'}>{categories.filter(c => c.type === type).map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}</optgroup>)}
          </Select>
          <Select value={sortOrder} aria-label="Transaction sort order" onChange={e => setSortOrder(e.target.value as typeof sortOrder)} className="h-10 w-auto min-w-0 flex-1 text-[13px] sm:max-w-36">
            <option value="date">Newest</option><option value="amount-high">High to low</option><option value="amount-low">Low to high</option>
          </Select>
        </div>
      </CardHeader>}

      <Modal 
        isOpen={isAdding} 
        onClose={handleCancel} 
        placement={formData.type === 'transfer' ? 'centered' : 'center'}
        className={formData.type === 'transfer' ? 'sm:max-w-[480px] rounded-2xl' : undefined}
        headerClassName={formData.type === 'transfer' ? 'px-5 py-4 sm:px-6 sm:py-4 [&_h2]:text-[17px] [&_h2]:tracking-tight' : undefined}
        contentClassName={formData.type === 'transfer' ? 'p-0 sm:p-0' : undefined}
        title={editingSplitId ? 'Edit Split' : editingId ? (formData.type === 'transfer' ? 'Edit Transfer' : 'Edit Transaction') : (formData.type === 'transfer' ? 'New transaction' : formData.type === 'income' ? 'Add Income' : 'Add Transaction')}
      >
        <form onSubmit={handleSubmit} className={formData.type === 'transfer' ? '' : 'space-y-4'}>
            {formData.type !== 'transfer' && typeSelector}

            {/* Transfer Form */}
            {formData.type === 'transfer' ? (
              <TransferForm
                accounts={accounts}
                data={formData}
                editing={!!editingId}
                reviewDraft={editingReviewTransfer}
                dirty={transferDirty}
                submitting={isSubmitting}
                hideBalance={account => privacyMode === 'hidden' || (account.type === 'investment' && shouldHideInvestment())}
                availableBalance={availableTransferBalance}
                exchangeRate={exchangeRateDraft}
                suggestedRate={suggestedRate}
                loadingRate={isLoadingRate}
                error={transferSaveError}
                typeSelector={typeSelector}
                onAccountChange={handleTransferAccountChange}
                onAmountChange={handleTransferAmountChange}
                onReceivedChange={handleTransferReceivedChange}
                onRateChange={handleTransferRateChange}
                onUseMarket={() => suggestedRate && handleTransferRateChange(formatCalculatedAmount(suggestedRate, { maximumFractionDigits: 12 }))}
                onSwap={handleSwapTransfer}
                onChange={patch => setFormData(prev => ({ ...prev, ...patch }))}
                onPriceChange={manualPrice => {
                  manuallyEditedTransferFieldsRef.current.manual_price = true
                  setFormData(prev => ({ ...prev, manual_price: manualPrice }))
                }}
                onRevert={handleRevertTransfer}
                onCancel={handleCancel}
              />
            ) : (
              /* Expense/Income Form */
              <>
                <div className="grid grid-cols-2 gap-3 overflow-hidden">
                  <div className="col-span-2 space-y-2 min-w-0 rounded-xl border border-border bg-background p-4">
                    <Label htmlFor="amount">{splitLines ? 'Total' : accounts.find(a => a.id === formData.account_id)?.type === 'investment' ? 'Shares' : 'Amount'}</Label>
                    <div className="finance-amount-field flex min-w-0 cursor-text items-baseline gap-2 rounded-lg" onClick={() => document.getElementById('amount')?.focus()}>
                      <AmountInput
                        id="amount"
                        className="finance-amount-input h-14 w-auto min-w-[1ch] max-w-full border-0 bg-transparent px-0 text-3xl font-semibold shadow-none field-sizing-content hover:bg-transparent focus:ring-0 focus-visible:bg-transparent focus-visible:ring-0"
                        value={formData.amount}
                        onValueChange={amount => setFormData({...formData, amount})}
                        placeholder={splitLines ? 'Sum of lines' : '0'}
                        aria-describedby={selectedAmountUnit ? 'amount-currency' : undefined}
                        required={!splitLines}
                      />
                      {selectedAmountUnit && <span id="amount-currency" className="shrink-0 text-base font-medium text-muted-foreground">{selectedAmountUnit}</span>}
                    </div>
                  </div>
                  <div className="col-span-2 space-y-2 min-w-0">
                    {/* Mobile: collapsible account selector */}
                    <div className="sm:hidden">
                      <button
                        type="button"
                        onClick={() => setIsAccountOpen(!isAccountOpen)}
                        className="w-full flex items-center justify-between h-10 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground hover:border-border/80 hover:bg-background/80 transition-all"
                      >
                        <span className="text-muted-foreground text-xs">Account</span>
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate text-xs">
                            {accounts.find(a => a.id === formData.account_id)?.name || 'Select'}
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${isAccountOpen ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {isAccountOpen && (
                        <div className="mt-1">
                          <Select
                            id="account-mobile"
                            value={formData.account_id}
                            onChange={e => { setFormData({...formData, account_id: e.target.value}); setIsAccountOpen(false) }}
                            required
                          >
                            <option value="">Select Account</option>
                            {accounts.filter(acc => !isLocked(acc.id)).map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </div>
                    {/* Desktop: always visible */}
                    <div className="hidden sm:block space-y-2">
                      <Label htmlFor="account">Account</Label>
                      <Select
                        id="account"
                        value={formData.account_id}
                        onChange={e => setFormData({...formData, account_id: e.target.value})}
                        required
                      >
                        <option value="">Select Account</option>
                        {accounts.filter(acc => !isLocked(acc.id)).map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  {/* Manual Price field for investment accounts */}
                  {accounts.find(a => a.id === formData.account_id)?.type === 'investment' && (
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="manual_price">Price per Share (optional - leave blank to auto-fetch)</Label>
                      <AmountInput
                        id="manual_price"
                        value={formData.manual_price}
                        onValueChange={manualPrice => {
                          manuallyEditedTransferFieldsRef.current.manual_price = true
                          setFormData(prev => ({ ...prev, manual_price: manualPrice }))
                        }}
                        placeholder="Auto-fetch from market data" 
                      />
                      <p className="text-xs text-gray-500">For old dates (before 2020), enter the price manually for accuracy</p>
                    </div>
                  )}
                  {!splitLines && <div className="col-span-2 space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select 
                      id="category" 
                      value={formData.category_id} 
                      onChange={e => setFormData({...formData, category_id: e.target.value})}
                    >
                      <option value="">Select Category</option>
                      {categories
                        .filter(c => c.type === formData.type)
                        .map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </Select>
                  </div>}
                  <div className="space-y-2 min-w-0 overflow-hidden">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      required
                      className="w-full min-w-0"
                    />
                    {isUpcomingForm && (
                      <p className="text-[11px] text-primary">This will be saved as an upcoming transaction.</p>
                    )}
                  </div>
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="description">Description</Label>
                    <Input 
                      id="description" 
                      value={formData.description} 
                      onChange={e => setFormData({...formData, description: e.target.value})} 
                      placeholder="e.g. Grocery shopping" 
                    />
                  </div>
                  {splitLines && selectedAccount?.type !== 'investment' && (
                    <div className="col-span-2">
                      <SplitLinesEditor
                        lines={splitLines}
                        resolution={splitResolution!}
                        currency={selectedAccount?.currency || ''}
                        categories={categories.filter(c => c.type === formData.type)}
                        disabled={isSubmitting}
                        onChange={setSplitLines}
                        onUndo={() => {
                          setFormData(prev => ({ ...prev, category_id: splitLines[0]?.category_id || '' }))
                          setSplitLines(null)
                        }}
                      />
                    </div>
                  )}
                  {!splitLines && !editingId && (
                    <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Button type="button" variant="outline" size="sm" disabled={!!splitBlockedReason} onClick={() => setSplitLines(startSplit(formData.category_id))}>
                        <Split className="h-3.5 w-3.5" />Split into categories
                      </Button>
                      {splitBlockedReason && <span className="text-xs text-muted-foreground">{splitBlockedReason}</span>}
                    </div>
                  )}
                  {splitLines && isUpcomingForm && !editingPendingSplit && <p className="col-span-2 text-xs text-destructive">A split cannot be dated in the future.</p>}
                  {formData.type === 'expense' && (
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.exclude_from_estimate}
                          onChange={e => setFormData({...formData, exclude_from_estimate: e.target.checked})}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-muted-foreground">
                          Exclude from estimate calculation (one-time expense)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
                {addedAnother && !editingId && !editingSplitId && <p role="status" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-foreground"><Check className="h-3.5 w-3.5 text-success" />Saved. Type, account and date are kept for the next one.</p>}
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="submit" className="w-full sm:flex-1" variant={formData.type === 'income' ? 'success' : 'default'} disabled={isSubmitting} onClick={() => { submitModeRef.current = 'close' }}>
                    {editingId || editingSplitId ? <Check className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    {isSubmitting ? 'Saving...' : splitLines ? (splitResolution?.valid ? `${editingSplitId ? 'Save' : 'Add'} ${splitLines.length} transactions` : splitResolution?.problem === 'amounts' ? 'Enter the amounts' : splitResolution?.problem === 'category' ? 'Choose a category for each line' : 'Assign the full amount')
                      : (editingId ? 'Save Changes' : editingSplitId ? 'Save as single transaction' : isUpcomingForm ? 'Save Upcoming' : `Add ${formData.type === 'income' ? 'Income' : 'Expense'}`)}
                  </Button>
                  {!editingId && !editingSplitId && selectedAccount?.type !== 'investment' && (
                    <Button type="submit" variant="outline" className="w-full sm:w-auto" disabled={isSubmitting} onClick={() => { submitModeRef.current = 'another' }}>
                      Save and add another
                    </Button>
                  )}
                </div>
              </>
            )}
          </form>
      </Modal>

      {!composerOnly && <CardContent className="p-3 sm:p-5">
        {transactionView === 'calendar' ? <TransactionCalendar transactions={transactions.filter(applyFilters)} accounts={accounts} currentMonth={currentMonth} privacyMode={privacyMode}
          getCategoryName={getCategoryName} getCategoryIcon={getCategoryIcon} getAccountName={getAccountName} getAccountCurrency={getAccountCurrency} convertToMasterCurrency={convertToMasterCurrency} masterCurrency={masterCurrency} sortOrder={sortOrder} />
        : <div className="space-y-4">
          {reviewTransactions.length > 0 && <section aria-labelledby="review-heading" className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center gap-2 px-4 py-3"><h3 id="review-heading" className="text-sm font-semibold">Needs review</h3><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{reviewTransactions.length}</span><span className="ml-auto hidden text-xs text-muted-foreground sm:block">Balances change only after confirmation</span></div>
            {reviewTransactions.map(tx => renderPendingTransaction(tx, tx.date <= today))}
            {confirmationBalancePreviews.length > 0 && <div role="region" aria-label="Confirmation balance preview" className="border-t border-border bg-background/40 px-4 py-3 text-xs text-muted-foreground"><p className="mb-1 font-medium">If all ready transactions are confirmed</p><div className="grid gap-y-1 sm:flex sm:flex-wrap sm:gap-x-4">{confirmationBalancePreviews.map(({ account, acceptedBalance }) => <p key={account.id}>{account.name}: {previewBalance(account.balance, account.id)} → {previewBalance(acceptedBalance, account.id)}</p>)}</div></div>}
          </section>}
          {futureTransactions.length > 0 && <section className="overflow-hidden rounded-xl border border-border">
            <button type="button" aria-expanded={upcomingOpen} aria-controls="future-transactions" onClick={() => setUpcomingOpen(!upcomingOpen)} className="flex min-h-14 w-full flex-wrap items-center gap-2 px-4 py-3 text-left text-sm">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="font-semibold">{futureTransactions.length} upcoming</span><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">next {futureTransactions[0].description || getCategoryName(futureTransactions[0].category_id)} · {format(parseISO(futureTransactions[0].date), 'MMM d')}</span><span className="text-xs tabular-nums">{convertedAmount(sumCash(futureTransactions))}</span><ChevronDown className={cn('h-4 w-4 text-muted-foreground', upcomingOpen && 'rotate-180')} />
            </button>
            {upcomingOpen && <div id="future-transactions">{futureTransactions.map(tx => renderPendingTransaction(tx, false))}</div>}
          </section>}
          {(() => {
            const allProcessed = sortOrder === 'date' ? sortedDates.flatMap(date => processTransactions(groupedTransactions[date].filter(applyFilters))) : processTransactions(transactions.filter(applyFilters)).sort((a, b) => sortOrder === 'amount-high' ? Math.abs(b.amount) - Math.abs(a.amount) : Math.abs(a.amount) - Math.abs(b.amount))
            const shown = showAllTransactions ? allProcessed : allProcessed.slice(0, DISPLAY_LIMIT)
            return <>
              {sortOrder === 'date' ? sortedDates.map(date => {
                const items = shown.filter(tx => tx.date === date)
                if (!items.length) return null
                const dailyCashFlow = cashFlowTransactions(groupedTransactions[date].filter(applyFilters))
                return <section key={date} aria-label={format(parseISO(date), 'EEEE, MMM d, yyyy')}>
                  <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border/60 px-1 pb-2 text-xs text-muted-foreground">
                    <h3>{format(parseISO(date), 'EEE, MMM d, yyyy')}</h3>
                    {dailyCashFlow.length > 0 && <span className="whitespace-nowrap text-[11px] tabular-nums" aria-label="Daily total" title="Income less spending; transfers and investment trades excluded">{convertedAmount(sumCash(dailyCashFlow))}</span>}
                  </div>
                  {items.map(renderPostedTransaction)}
                </section>
              }) : shown.map(renderPostedTransaction)}
              {allProcessed.length > DISPLAY_LIMIT && <div className="pt-2 text-center"><Button variant="outline" size="sm" onClick={() => setShowAllTransactions(!showAllTransactions)}>{showAllTransactions ? 'Show Less' : `Show All (${allProcessed.length - DISPLAY_LIMIT} more)`}</Button></div>}
            </>
          })()}
          {loading && transactions.length === 0 && upcomingTransactions.length === 0 && <div role="status" className="py-8 text-center text-sm text-muted-foreground">Loading transactions…</div>}
          {!loading && totalFilteredCount === 0 && !isAdding && <div className="py-12 text-center">
            <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{transactions.length === 0 && upcomingTransactions.length === 0 ? 'No transactions yet' : 'No transactions found'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{transactions.length === 0 && upcomingTransactions.length === 0 ? 'Record your first transaction to start tracking' : 'Try changing the filters or period.'}</p>
            {searchQuery && !isAllTimeRange(dateRange) && <Button variant="outline" size="sm" className="mt-3" onClick={() => onDateRangeChange(ALL_TIME_RANGE)}>Search in All Time</Button>}
          </div>}
        </div>}
      </CardContent>}
    </Card>
  )
}
