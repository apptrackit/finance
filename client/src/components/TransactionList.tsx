import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Plus, X, ArrowDownLeft, ArrowUpRight, Receipt, RefreshCw, Pencil, Trash2, Check, ArrowRightLeft, ChevronLeft, ChevronRight, Calendar, Filter, ArrowUpDown } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, addDays, differenceInDays } from 'date-fns'
import { API_BASE_URL, apiFetch } from '../config'
import { usePrivacy } from '../context/PrivacyContext'
import { useAlert } from '../context/AlertContext'
import { useLockedAccounts } from '../context/LockedAccountsContext'

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  quantity?: number
  description?: string
  date: string
  is_recurring: boolean
  linked_transaction_id?: string
}

type Account = {
  id: string
  name: string
  balance: number
  currency: string
  type: 'cash' | 'investment'
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
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
  accounts, 
  onTransactionAdded,
  loading,
  dateRange,
  onDateRangeChange,
  currentMonth,
  onMonthChange
}: { 
  transactions: Transaction[], 
  accounts: Account[],
  onTransactionAdded: () => void,
  loading?: boolean,
  dateRange: { startDate: string; endDate: string },
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void,
  currentMonth: Date,
  onMonthChange: (month: Date) => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customRange, setCustomRange] = useState({ startDate: dateRange.startDate, endDate: dateRange.endDate })
  const [formData, setFormData] = useState({
    account_id: '',
    to_account_id: '',
    category_id: '',
    amount: '',
    amount_to: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    is_recurring: false,
    type: 'expense' as 'expense' | 'income' | 'transfer',
    manual_price: '' // For investment accounts - manual price override
  })
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null)
  const [isLoadingRate, setIsLoadingRate] = useState(false)
  const [skipAutoCalc, setSkipAutoCalc] = useState(false)
  const [activeTxId, setActiveTxId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'date' | 'amount-high' | 'amount-low'>('date')
  
  const { confirm } = useAlert()
  const { privacyMode, shouldHideInvestment } = usePrivacy()
  const { isLocked } = useLockedAccounts()

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/categories`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(console.error)
  }, [])

  // Fetch exchange rate when transfer accounts are selected
  useEffect(() => {
    if (formData.type !== 'transfer' || !formData.account_id || !formData.to_account_id) {
      setSuggestedRate(null)
      setExchangeRate(null)
      return
    }

    const fromAccount = accounts.find(a => a.id === formData.account_id)
    const toAccount = accounts.find(a => a.id === formData.to_account_id)
    
    if (!fromAccount || !toAccount || fromAccount.currency === toAccount.currency) {
      setSuggestedRate(null)
      setExchangeRate(null)
      return
    }

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
          } catch (e) {
            console.error('Quote fetch failed', e)
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
          } catch (e) {
            console.error('FX fetch failed', e)
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

        if (rate > 0) {
          setSuggestedRate(rate)
          setExchangeRate(rate)
        } else {
          setSuggestedRate(null)
          setExchangeRate(null)
        }
      } catch (error) {
        console.error('Failed to fetch exchange rate:', error)
        setSuggestedRate(null)
        setExchangeRate(null)
      } finally {
        setIsLoadingRate(false)
      }
    }

    fetchRate()
  }, [formData.account_id, formData.to_account_id, formData.type, accounts])

  // Auto-calculate amount_to when amount or rate changes
  useEffect(() => {
    if (formData.type !== 'transfer' || skipAutoCalc) return

    const fromAccount = accounts.find(a => a.id === formData.account_id)
    const toAccount = accounts.find(a => a.id === formData.to_account_id)
    const isDifferentCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency

    if (isDifferentCurrency && formData.amount && exchangeRate) {
      // Different currency: amount_to = amount_from × exchange_rate
      const amountFrom = parseFloat(formData.amount.replace(/\s/g, '')) || 0
      const calculated = amountFrom * exchangeRate
      setFormData(prev => ({ ...prev, amount_to: calculated.toString() }))
    } else if (!isDifferentCurrency && formData.amount) {
      // Same currency: amount_to = amount_from (no fee)
      const amountFrom = parseFloat(formData.amount.replace(/\s/g, '')) || 0
      setFormData(prev => ({ ...prev, amount_to: amountFrom.toString() }))
    }
  }, [formData.amount, exchangeRate, formData.type, formData.account_id, formData.to_account_id, accounts, skipAutoCalc])

  // Auto-fetch price for investment accounts when date or account changes
  useEffect(() => {
    const fetchHistoricalPrice = async () => {
      // Skip auto-fetch if manual_price is already set (e.g., from editing)
      if (formData.manual_price) {
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
              const priceDate = new Date(chartData.quotes[closestIdx].date).toLocaleDateString()
              console.log(`Auto-filled price for ${investmentAccount.symbol} on ${priceDate}: $${price}`)
              setFormData(prev => ({ ...prev, manual_price: price.toFixed(2) }))
            } else {
              console.warn(`No price data within 3 days of ${formData.date}, leaving manual_price empty`)
              setFormData(prev => ({ ...prev, manual_price: '' }))
            }
          } else {
            // No chart data, clear manual_price
            setFormData(prev => ({ ...prev, manual_price: '' }))
          }
        }
      } catch (e) {
        console.error('Failed to auto-fetch price:', e)
        // Don't set manual_price on error
      }
    }
    
    fetchHistoricalPrice()
  }, [formData.date, formData.account_id, formData.to_account_id, formData.type, accounts])

  // Load saved defaults when opening the form
  const loadSavedDefaults = (type: 'expense' | 'income' | 'transfer') => {
    if (type === 'expense') {
      const savedAccount = localStorage.getItem(STORAGE_KEYS.expenseAccount) || ''
      const savedCategory = localStorage.getItem(STORAGE_KEYS.expenseCategory) || ''
      return { account_id: savedAccount, category_id: savedCategory, to_account_id: '', fee: '0' }
    } else if (type === 'income') {
      const savedAccount = localStorage.getItem(STORAGE_KEYS.incomeAccount) || ''
      const savedCategory = localStorage.getItem(STORAGE_KEYS.incomeCategory) || ''
      return { account_id: savedAccount, category_id: savedCategory, to_account_id: '', fee: '0' }
    } else {
      const savedFrom = localStorage.getItem(STORAGE_KEYS.transferFrom) || ''
      const savedTo = localStorage.getItem(STORAGE_KEYS.transferTo) || ''
      return { account_id: savedFrom, to_account_id: savedTo, category_id: '', fee: '0', amount_to: '' }
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

  const resetForm = () => {
    const defaults = loadSavedDefaults('expense')
    setFormData({
      account_id: defaults.account_id,
      to_account_id: '',
      category_id: defaults.category_id,
      amount: '',
      amount_to: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      is_recurring: false,
      type: 'expense',
      manual_price: ''
    })
    setExchangeRate(null)
    setSuggestedRate(null)
  }

  // When opening the Add form, load defaults
  const handleOpenForm = () => {
    const defaults = loadSavedDefaults('expense')
    setFormData({
      account_id: defaults.account_id,
      to_account_id: '',
      category_id: defaults.category_id,
      amount: '',
      amount_to: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      is_recurring: false,
      type: 'expense',
      manual_price: ''
    })
    setIsAdding(true)
  }

  // Handle type change with saved defaults
  const handleTypeChange = (newType: 'expense' | 'income' | 'transfer') => {
    const defaults = loadSavedDefaults(newType)
    setFormData({
      ...formData,
      type: newType,
      account_id: defaults.account_id,
      to_account_id: defaults.to_account_id,
      category_id: defaults.category_id,
      amount_to: defaults.amount_to || '',
      is_recurring: newType === 'transfer' ? false : formData.is_recurring
    })
    setExchangeRate(null)
    setSuggestedRate(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const amount = parseFloat(formData.amount.replace(/\s/g, ''))

      if (formData.type === 'transfer') {
        // Handle transfer
        const amountTo = parseFloat(formData.amount_to.replace(/\s/g, '')) || amount
        const toAccount = accounts.find(a => a.id === formData.to_account_id)
        let price = undefined
        
        // For transfers to investment accounts, include price
        if (toAccount?.type === 'investment' && formData.manual_price) {
          price = parseFloat(formData.manual_price.replace(/\s/g, ''))
          console.log(`Transfer to investment: ${amountTo} shares @ $${price}`)
        }
        
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
              is_recurring: formData.is_recurring
            }),
          })
          setEditingId(null)
        } else {
          // For investment accounts, use the manual_price if set (auto-filled or manually entered)
          const account = accounts.find(a => a.id === formData.account_id)
          let price = undefined
          
          if (account?.type === 'investment' && formData.manual_price) {
            price = parseFloat(formData.manual_price)
            console.log(`Using price for ${account.symbol}: $${price}`)
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
              is_recurring: formData.is_recurring,
              price: price // Include price for investment accounts
            }),
          })
        }
        saveDefaults(formData.type)
      }
      setIsAdding(false)
      resetForm()
      onTransactionAdded()
    } catch (error) {
      console.error('Failed to save transaction', error)
    }
  }

  const handleEdit = (tx: Transaction) => {
    // Prevent editing if the account is locked
    if (isLocked(tx.account_id)) {
      return
    }
    
    // For transfers, also check if the linked account is locked
    if (tx.linked_transaction_id) {
      const linkedTx = transactions.find(t => t.id === tx.linked_transaction_id)
      if (linkedTx && isLocked(linkedTx.account_id)) {
        return
      }
    }
    
    const isIncome = tx.amount >= 0
    const account = accounts.find(a => a.id === tx.account_id)
    
    // Format numbers with spaces
    const formatNumber = (num: number) => {
      const str = Math.abs(num).toString()
      return str.includes('.') 
        ? (() => { const [integer, decimal] = str.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })()
        : str.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    }
    
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
      is_recurring: tx.is_recurring,
      type: isIncome ? 'income' : 'expense',
      manual_price: priceValue
    })
    setEditingId(tx.id)
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    // Find the transaction first to check if account is locked
    const tx = transactions.find(t => t.id === id)
    if (!tx) return
    
    // Check if the account is locked
    if (isLocked(tx.account_id)) {
      return
    }
    
    // For transfers, also check if the linked account is locked
    if (tx.linked_transaction_id) {
      const linkedTx = transactions.find(t => t.id === tx.linked_transaction_id)
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
    
    try {
      // Find the transaction to determine if it's an investment transaction
      const tx = transactions.find(t => t.id === id)
      const account = accounts.find(a => a.id === tx?.account_id)
      
      // If it's an investment account and has quantity data, it's from investment_transactions table
      const isInvestmentTx = account?.type === 'investment' && tx?.quantity !== undefined
      
      if (isInvestmentTx) {
        await apiFetch(`${API_BASE_URL}/investment-transactions/${id}`, { method: 'DELETE' })
      } else {
        await apiFetch(`${API_BASE_URL}/transactions/${id}`, { method: 'DELETE' })
      }
      
      onTransactionAdded()
    } catch (error) {
      console.error('Failed to delete transaction', error)
    }
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingId(null)
    resetForm()
  }

  const getCategoryName = (id?: string) => {
    if (!id) return 'Uncategorized'
    const cat = categories.find(c => c.id === id)
    return cat ? cat.name : 'Unknown'
  }

  const getCategoryIcon = (id?: string) => {
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
  const transferAmount = parseFloat(formData.amount.replace(/\s/g, '')) || 0
  const transferAmountTo = parseFloat(formData.amount_to.replace(/\s/g, '')) || transferAmount

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

  // Helper to process transactions and merge transfers
  const processTransactions = (txs: Transaction[]) => {
    const processed: (Transaction & { relatedTx?: Transaction })[] = []
    const skipIds = new Set<string>()

    txs.forEach(tx => {
      if (skipIds.has(tx.id)) return

      if (tx.linked_transaction_id) {
        const related = txs.find(t => t.id === tx.linked_transaction_id)
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

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center justify-between sm:justify-start">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-secondary flex items-center justify-center">
                <Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Transactions</CardTitle>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{transactions.length} total</p>
              </div>
            </div>
            
            <Button 
              onClick={() => isAdding ? handleCancel() : handleOpenForm()} 
              size="sm" 
              variant={isAdding ? "ghost" : "outline"}
              className="h-7 sm:h-8 text-xs flex-shrink-0 sm:hidden"
            >
              {isAdding ? <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              <span className="ml-1">{isAdding ? 'Cancel' : 'Add'}</span>
            </Button>
          </div>
          
          <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-4">
            {/* Month Navigation */}
            <div className="flex items-center gap-1 sm:gap-2 relative">
            <Button
              onClick={() => {
                const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
                const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
                const isDefaultMonth = dateRange.startDate === monthStart && dateRange.endDate === monthEnd
                
                if (isDefaultMonth) {
                  // Default behavior: go to previous month
                  onMonthChange(subMonths(currentMonth, 1))
                } else {
                  // Custom range: shift by the range length
                  const rangeDays = differenceInDays(new Date(dateRange.endDate), new Date(dateRange.startDate)) + 1
                  const newStart = format(addDays(new Date(dateRange.startDate), -rangeDays), 'yyyy-MM-dd')
                  const newEnd = format(addDays(new Date(dateRange.endDate), -rangeDays), 'yyyy-MM-dd')
                  onDateRangeChange({ startDate: newStart, endDate: newEnd })
                }
              }}
              size="sm"
              variant="ghost"
              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <button
              onClick={() => {
                const now = new Date()
                const todayMonthStart = format(startOfMonth(now), 'yyyy-MM-dd')
                const todayMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd')
                const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
                const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
                const isDefaultMonth = dateRange.startDate === monthStart && dateRange.endDate === monthEnd
                
                if (!isDefaultMonth) {
                  // Reset to today's month (not currentMonth)
                  onMonthChange(now)
                  onDateRangeChange({ startDate: todayMonthStart, endDate: todayMonthEnd })
                } else {
                  // Open date picker
                  setCustomRange({ startDate: dateRange.startDate, endDate: dateRange.endDate })
                  setShowDatePicker(!showDatePicker)
                }
              }}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded-md bg-secondary/50 border border-border/50 hover:bg-secondary/70 transition-colors cursor-pointer"
            >
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] sm:text-sm font-medium min-w-[90px] sm:min-w-[120px] text-center">
                {(() => {
                  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
                  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
                  const isDefaultMonth = dateRange.startDate === monthStart && dateRange.endDate === monthEnd
                  
                  if (isDefaultMonth) {
                    return format(currentMonth, 'MMMM yyyy')
                  } else {
                    return `${format(new Date(dateRange.startDate), 'MMM d')} - ${format(new Date(dateRange.endDate), 'MMM d')}`
                  }
                })()}
              </span>
            </button>
            <Button
              onClick={() => {
                const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
                const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
                const isDefaultMonth = dateRange.startDate === monthStart && dateRange.endDate === monthEnd
                
                if (isDefaultMonth) {
                  // Default behavior: go to next month
                  onMonthChange(addMonths(currentMonth, 1))
                } else {
                  // Custom range: shift by the range length
                  const rangeDays = differenceInDays(new Date(dateRange.endDate), new Date(dateRange.startDate)) + 1
                  const newStart = format(addDays(new Date(dateRange.startDate), rangeDays), 'yyyy-MM-dd')
                  const newEnd = format(addDays(new Date(dateRange.endDate), rangeDays), 'yyyy-MM-dd')
                  onDateRangeChange({ startDate: newStart, endDate: newEnd })
                }
              }}
              size="sm"
              variant="ghost"
              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            
            {/* Custom Date Range Picker */}
            {showDatePicker && (
              <div className="absolute top-full right-0 mt-2 p-4 bg-background border border-border rounded-lg shadow-lg z-50 min-w-[280px]">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Start Date</Label>
                    <Input
                      type="date"
                      value={customRange.startDate}
                      onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End Date</Label>
                    <Input
                      type="date"
                      value={customRange.endDate}
                      onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDatePicker(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        onDateRangeChange(customRange)
                        setShowDatePicker(false)
                      }}
                      className="flex-1"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            )}
            </div>
          
            {/* Category Filter */}
            <div className="relative">
              <button
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-secondary/50 border border-border/50 hover:bg-secondary/70 transition-colors text-[11px] sm:text-xs"
                onClick={() => {
                  const select = document.getElementById('category-filter') as HTMLSelectElement
                  select?.focus()
                }}
              >
                <Filter className="h-3 w-3 text-muted-foreground" />
                <span className="hidden sm:inline text-muted-foreground">
                  {categoryFilter === 'all' ? 'Category' : 
                   categoryFilter === 'transfer' ? '🔄 Transfers' :
                   (() => {
                     const cat = categories.find(c => c.id === categoryFilter)
                     return cat ? `${cat.icon} ${cat.name}` : 'Category'
                   })()}
                </span>
              </button>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              >
                <option value="all">All Categories</option>
                {categories.filter(c => c.type === 'expense').length > 0 && (
                  <optgroup label="Expenses">
                    {categories.filter(c => c.type === 'expense').map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                    ))}
                  </optgroup>
                )}
                {categories.filter(c => c.type === 'income').length > 0 && (
                  <optgroup label="Income">
                    {categories.filter(c => c.type === 'income').map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                    ))}
                  </optgroup>
                )}
                <option value="transfer">Transfers</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="relative">
              <button
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-secondary/50 border border-border/50 hover:bg-secondary/70 transition-colors text-[11px] sm:text-xs"
                onClick={() => {
                  const select = document.getElementById('sort-order') as HTMLSelectElement
                  select?.focus()
                }}
              >
                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                <span className="hidden sm:inline text-muted-foreground">
                  {sortOrder === 'date' ? 'Sort' :
                   sortOrder === 'amount-high' ? 'Amount ↓' :
                   'Amount ↑'}
                </span>
              </button>
              <select
                id="sort-order"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'date' | 'amount-high' | 'amount-low')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              >
                <option value="date">Date (Newest)</option>
                <option value="amount-high">Amount (High to Low)</option>
                <option value="amount-low">Amount (Low to High)</option>
              </select>
            </div>
          
            <Button 
              onClick={() => isAdding ? handleCancel() : handleOpenForm()} 
              size="sm" 
              variant={isAdding ? "ghost" : "outline"}
              className="h-7 sm:h-8 text-xs flex-shrink-0 hidden sm:flex"
            >
              {isAdding ? <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              <span className="ml-1">{isAdding ? 'Cancel' : 'Add'}</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        {isAdding && (
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-secondary/50 border border-border/50 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* Transaction Type Selector - 3 options now */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`p-3 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                  formData.type === 'expense' 
                    ? 'border-destructive/50 bg-destructive/10 text-destructive' 
                    : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                <span className="text-sm font-medium">Expense</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`p-3 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                  formData.type === 'income' 
                    ? 'border-success/50 bg-success/10 text-success' 
                    : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
                }`}
              >
                <ArrowDownLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Income</span>
              </button>
              <button
                type="button"
                disabled={!!editingId}
                onClick={() => handleTypeChange('transfer')}
                className={`p-3 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                  formData.type === 'transfer' 
                    ? 'border-primary/50 bg-primary/10 text-primary' 
                    : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
                } ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Transfer</span>
              </button>
            </div>

            {/* Transfer Form */}
            {formData.type === 'transfer' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="from_account">From Account</Label>
                    <Select 
                      id="from_account" 
                      value={formData.account_id} 
                      onChange={e => setFormData({...formData, account_id: e.target.value})}
                      required
                    >
                      <option value="">Select Account</option>
                      {accounts.filter(acc => !isLocked(acc.id)).map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.balance.toLocaleString('hu-HU')} {acc.currency})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="to_account">To Account</Label>
                    <Select 
                      id="to_account" 
                      value={formData.to_account_id} 
                      onChange={e => setFormData({...formData, to_account_id: e.target.value})}
                      required
                    >
                      <option value="">Select Account</option>
                      {accounts
                        .filter(acc => acc.id !== formData.account_id && !isLocked(acc.id))
                        .map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.balance.toLocaleString('hu-HU')} {acc.currency})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_amount">
                      Amount to Send {fromAccount && `(${fromAccount.currency})`}
                    </Label>
                    <Input 
                      id="transfer_amount" 
                      type="text"
                      inputMode="decimal"
                      value={formData.amount} 
                      onChange={e => {
                        let value = e.target.value.replace(/\s/g, '')
                        if (!/^\d*\.?\d*$/.test(value)) return
                        const formatted = value.includes('.') 
                          ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })() 
                          : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                        setFormData({...formData, amount: formatted})
                      }} 
                      placeholder="0.00" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_amount_to">
                      {toAccount?.type === 'investment' ? 'Shares to Receive' : `Amount to Receive ${toAccount ? `(${toAccount.currency})` : ''}`}
                    </Label>
                    <Input 
                      id="transfer_amount_to" 
                      type="text"
                      inputMode="decimal"
                      value={formData.amount_to} 
                      onChange={e => {
                        let value = e.target.value.replace(/\s/g, '')
                        if (!/^\d*\.?\d*$/.test(value)) return
                        const formatted = value.includes('.') 
                          ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })() 
                          : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                        setSkipAutoCalc(true)
                        setFormData({...formData, amount_to: formatted})
                        
                        // Recalculate exchange rate if different currencies
                        if (fromAccount && toAccount && formData.amount && value) {
                          const amountFrom = parseFloat(formData.amount.replace(/\s/g, '')) || 0
                          const amountTo = parseFloat(value) || 0
                          
                          if (fromAccount.currency !== toAccount.currency && amountFrom > 0 && amountTo > 0) {
                            // Different currency: recalculate exchange rate
                            // Formula: amount_to = amount_from × rate
                            // So: rate = amount_to / amount_from
                            const newRate = amountTo / amountFrom
                            setExchangeRate(newRate)
                          }
                        }
                      }}
                      onBlur={() => setSkipAutoCalc(false)}
                      placeholder="0.00" 
                      required
                    />
                  </div>
                </div>

                {/* Exchange Rate Section */}
                {fromAccount && toAccount && fromAccount.currency !== toAccount.currency && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 space-y-2">
                    <Label htmlFor="exchange_rate" className="text-xs font-medium text-blue-900 dark:text-blue-100">
                      Exchange Rate
                    </Label>
                    {isLoadingRate ? (
                      <p className="text-sm text-muted-foreground">Loading exchange rate...</p>
                    ) : (
                      <>
                        {suggestedRate && (
                          <p className="text-xs text-muted-foreground">
                            Suggested: 1 {fromAccount.currency} = {suggestedRate} {toAccount.currency}
                          </p>
                        )}
                        <Input 
                          id="exchange_rate"
                          type="text"
                          inputMode="decimal"
                          value={exchangeRate !== null ? exchangeRate.toString() : ''} 
                          onChange={e => {
                            let value = e.target.value.replace(/\s/g, '')
                            if (value === '') {
                              setExchangeRate(null)
                              return
                            }
                            if (!/^\d*\.?\d*$/.test(value)) return
                            const rate = parseFloat(value)
                            if (!isNaN(rate) && rate > 0) {
                              setExchangeRate(rate)
                            }
                          }} 
                          placeholder="Enter custom rate"
                          className="bg-background"
                        />
                        {exchangeRate && formData.amount && (
                          <p className="text-xs text-muted-foreground">
                            {parseFloat(formData.amount.replace(/\s/g, ''))} {fromAccount.currency} = {parseFloat(formData.amount.replace(/\s/g, '')) * exchangeRate} {toAccount.currency}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Manual Price field for transfers to investment accounts */}
                {toAccount?.type === 'investment' && (
                  <div className="space-y-2">
                    <Label htmlFor="transfer_price">Price per Share in USD (optional - leave blank to auto-fetch)</Label>
                    <Input 
                      id="transfer_price" 
                      type="text"
                      inputMode="decimal"
                      value={formData.manual_price} 
                      onChange={e => {
                        let value = e.target.value.replace(/\s/g, '')
                        if (!/^\d*\.?\d*$/.test(value)) return
                        const formatted = value.includes('.') 
                          ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })() 
                          : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                        setFormData({...formData, manual_price: formatted})
                      }} 
                      placeholder="Auto-fetch from market data" 
                    />
                    <p className="text-xs text-gray-500">For old dates (before 2020), enter the price manually for accuracy</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="transfer_date">Date</Label>
                    <Input 
                      id="transfer_date" 
                      type="date" 
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_description">Note (optional)</Label>
                    <Input 
                      id="transfer_description" 
                      value={formData.description} 
                      onChange={e => setFormData({...formData, description: e.target.value})} 
                      placeholder="e.g. Monthly savings" 
                    />
                  </div>
                </div>

                {/* Transfer Preview */}
                {fromAccount && toAccount && transferAmount > 0 && (
                  <div className="p-3 rounded-lg bg-background/50 border border-border space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
                    <div className="flex items-center justify-between text-sm">
                      <span>{fromAccount.name}</span>
                      <span className="text-destructive font-medium">-{transferAmount} {fromAccount.currency}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>{toAccount.name}</span>
                      <span className="text-success font-medium">
                        +{transferAmountTo} {toAccount.type === 'investment' ? 'shares' : toAccount.currency}
                      </span>
                    </div>
                    {toAccount.type === 'investment' && formData.manual_price && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                        <span>@ ${formData.manual_price}/share</span>
                        <span>${(transferAmountTo * parseFloat(formData.manual_price)).toFixed(2)} USD value</span>
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full">
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transfer Funds
                </Button>
              </div>
            ) : (
              /* Expense/Income Form */
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="amount">{accounts.find(a => a.id === formData.account_id)?.type === 'investment' ? 'Shares' : 'Amount'}</Label>
                    <Input 
                      id="amount" 
                      type="text"
                      inputMode="decimal"
                      value={formData.amount} 
                      onChange={e => {
                        let value = e.target.value.replace(/\s/g, '')
                        if (!/^\d*\.?\d*$/.test(value)) return
                        const formatted = value.includes('.') 
                          ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })() 
                          : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                        setFormData({...formData, amount: formatted})
                      }} 
                      placeholder="0" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
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
                  {/* Manual Price field for investment accounts */}
                  {accounts.find(a => a.id === formData.account_id)?.type === 'investment' && (
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="manual_price">Price per Share (optional - leave blank to auto-fetch)</Label>
                      <Input 
                        id="manual_price" 
                        type="text"
                        inputMode="decimal"
                        value={formData.manual_price} 
                        onChange={e => {
                          let value = e.target.value.replace(/\s/g, '')
                          if (!/^\d*\.?\d*$/.test(value)) return
                          const formatted = value.includes('.') 
                            ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })() 
                            : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                          setFormData({...formData, manual_price: formatted})
                        }} 
                        placeholder="Auto-fetch from market data" 
                      />
                      <p className="text-xs text-gray-500">For old dates (before 2020), enter the price manually for accuracy</p>
                    </div>
                  )}
                  <div className="space-y-2">
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
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input 
                      id="date" 
                      type="date" 
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})} 
                      required 
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input 
                      id="description" 
                      value={formData.description} 
                      onChange={e => setFormData({...formData, description: e.target.value})} 
                      placeholder="e.g. Grocery shopping" 
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border">
                    <input 
                      type="checkbox" 
                      id="recurring" 
                      checked={formData.is_recurring} 
                      onChange={e => setFormData({...formData, is_recurring: e.target.checked})}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                    />
                    <Label htmlFor="recurring" className="flex items-center gap-2 cursor-pointer">
                      <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      Recurring monthly
                    </Label>
                  </div>
                </div>
                <Button type="submit" className="w-full" variant={formData.type === 'income' ? 'success' : 'default'}>
                  {editingId ? <Check className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {editingId ? 'Save Changes' : `Add ${formData.type === 'income' ? 'Income' : 'Expense'}`}
                </Button>
              </>
            )}
          </form>
        )}

        <div className="space-y-3 sm:space-y-4">
          {sortOrder === 'date' ? (
            // Date-based grouping
            sortedDates.map(date => {
              // Filter transactions by category
              const dateTransactions = groupedTransactions[date].filter(tx => {
                if (categoryFilter === 'all') return true
                if (categoryFilter === 'transfer') return !!tx.linked_transaction_id
                return tx.category_id === categoryFilter
              })
              
              // Skip date if no transactions match filter
              if (dateTransactions.length === 0) return null
              
              return (
              <div key={date}>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <div className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                    {format(new Date(date), 'EEEE, MMM d')}
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-1">
                  {processTransactions(dateTransactions).reverse().map(tx => {
                    const isTransfer = !!tx.linked_transaction_id && !!(tx as any).relatedTx
                    const related = (tx as any).relatedTx as Transaction | undefined
                    
                    return (
                    <div 
                      key={tx.id} 
                      className="group flex items-center justify-between p-2 sm:p-3 rounded-lg sm:rounded-xl hover:bg-secondary/30 transition-all duration-200"
                      onClick={() => setActiveTxId(activeTxId === tx.id ? null : tx.id)}
                    >
                      <div className="flex items-center gap-2 sm:gap-3" onClick={(e) => e.stopPropagation()}>
                        <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-lg ${
                          isTransfer ? 'bg-blue-500/10 text-blue-500' :
                          tx.amount >= 0 ? 'bg-success/10' : 'bg-secondary'
                        }`}>
                          {isTransfer ? <ArrowRightLeft className="h-4 w-4 sm:h-5 sm:w-5" /> : getCategoryIcon(tx.category_id)}
                        </div>
                        <div>
                          <p className="font-medium text-xs sm:text-sm">
                            {isTransfer 
                              ? `Transfer to ${related ? getAccountName(related.account_id) : 'Unknown'}`
                              : (tx.description || getCategoryName(tx.category_id))
                            }
                          </p>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground">
                            <span>{getAccountName(tx.account_id)}</span>
                            {isTransfer && related && (
                               <>
                                 <span>→</span>
                                 <span>{getAccountName(related.account_id)}</span>
                               </>
                            )}
                            {tx.is_recurring && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-primary">
                                  <RefreshCw className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  Recurring
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <div className={`font-bold text-xs sm:text-sm ${isTransfer ? 'text-destructive' : (tx.amount >= 0 ? 'text-success' : 'text-destructive')} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {(() => {
                            const account = accounts.find(a => a.id === tx.account_id)
                            const isInvestmentTx = account?.type === 'investment'
                            const shouldHide = privacyMode === 'hidden' || (isInvestmentTx && shouldHideInvestment())
                            
                            if (shouldHide) {
                              return '••••••'
                            }
                            
                            if (isInvestmentTx && tx.quantity !== undefined) {
                              return <>{tx.quantity > 0 ? '+' : ''}{tx.quantity.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 8})} {getAccountCurrency(tx.account_id)}</>
                            }
                            return <>{tx.amount >= 0 ? '+' : '-'}{Math.abs(tx.amount).toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {getAccountCurrency(tx.account_id)}</>
                          })()}
                        </div>
                        {isTransfer && related && (
                          <div className={`text-[10px] sm:text-xs text-success font-medium ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {(() => {
                              const relatedAccount = accounts.find(a => a.id === related.account_id)
                              const isInvestmentTx = relatedAccount?.type === 'investment'
                              const shouldHide = privacyMode === 'hidden' || (isInvestmentTx && shouldHideInvestment())
                              
                              if (shouldHide) {
                                return '••••••'
                              }
                              return <>+{Math.abs(related.amount).toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {getAccountCurrency(related.account_id)}</>
                            })()}
                          </div>
                        )}
                        <div className={`flex gap-1 transition-opacity ${activeTxId === tx.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                          {!isLocked(tx.account_id) && !(related && isLocked(related.account_id)) && (
                            <>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7 sm:h-8 sm:w-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEdit(tx)
                                }}
                              >
                                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(tx.id)
                                }}
                              >
                                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            )})
          ) : (
            // Amount-based sorting (flat list)
            (() => {
              // Flatten all transactions
              const allTransactions = transactions.filter(tx => {
                if (categoryFilter === 'all') return true
                if (categoryFilter === 'transfer') return !!tx.linked_transaction_id
                return tx.category_id === categoryFilter
              })
              
              // Sort by amount
              const sortedTransactions = [...allTransactions].sort((a, b) => 
                sortOrder === 'amount-high' 
                  ? Math.abs(b.amount) - Math.abs(a.amount)
                  : Math.abs(a.amount) - Math.abs(b.amount)
              )
              
              return (
                <div className="space-y-1">
                  {processTransactions(sortedTransactions).map(tx => {
                  const isTransfer = !!tx.linked_transaction_id && !!(tx as any).relatedTx
                  const related = (tx as any).relatedTx as Transaction | undefined
                  
                  return (
                  <div 
                    key={tx.id} 
                    className="group flex items-center justify-between p-2 sm:p-3 rounded-lg sm:rounded-xl hover:bg-secondary/30 transition-all duration-200"
                    onClick={() => setActiveTxId(activeTxId === tx.id ? null : tx.id)}
                  >
                    <div className="flex items-center gap-2 sm:gap-3" onClick={(e) => e.stopPropagation()}>
                      <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-lg ${
                        isTransfer ? 'bg-blue-500/10 text-blue-500' :
                        tx.amount >= 0 ? 'bg-success/10' : 'bg-secondary'
                      }`}>
                        {isTransfer ? <ArrowRightLeft className="h-4 w-4 sm:h-5 sm:w-5" /> : getCategoryIcon(tx.category_id)}
                      </div>
                      <div>
                        <p className="font-medium text-xs sm:text-sm">
                          {isTransfer 
                            ? `Transfer to ${related ? getAccountName(related.account_id) : 'Unknown'}`
                            : (tx.description || getCategoryName(tx.category_id))
                          }
                        </p>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground">
                          <span>{format(new Date(tx.date), 'MMM d')}</span>
                          <span>•</span>
                          <span>{getAccountName(tx.account_id)}</span>
                          {isTransfer && related && (
                             <>
                               <span>→</span>
                               <span>{getAccountName(related.account_id)}</span>
                             </>
                          )}
                          {tx.is_recurring && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-primary">
                                <RefreshCw className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                Recurring
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <div className={`font-bold text-xs sm:text-sm ${isTransfer ? 'text-destructive' : (tx.amount >= 0 ? 'text-success' : 'text-destructive')} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                        {(() => {
                          const account = accounts.find(a => a.id === tx.account_id)
                          const isInvestmentTx = account?.type === 'investment'
                          const shouldHide = privacyMode === 'hidden' || (isInvestmentTx && shouldHideInvestment())
                          
                          if (shouldHide) {
                            return '••••••'
                          }
                          
                          if (isInvestmentTx && tx.quantity !== undefined) {
                            return <>{tx.quantity > 0 ? '+' : ''}{tx.quantity.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 8})} {getAccountCurrency(tx.account_id)}</>
                          }
                          return <>{tx.amount >= 0 ? '+' : '-'}{Math.abs(tx.amount).toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {getAccountCurrency(tx.account_id)}</>
                        })()}
                      </div>
                      {isTransfer && related && (
                        <div className={`text-[10px] sm:text-xs text-success font-medium ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {(() => {
                            const relatedAccount = accounts.find(a => a.id === related.account_id)
                            const isInvestmentTx = relatedAccount?.type === 'investment'
                            const shouldHide = privacyMode === 'hidden' || (isInvestmentTx && shouldHideInvestment())
                            
                            if (shouldHide) {
                              return '••••••'
                            }
                            return <>+{Math.abs(related.amount).toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {getAccountCurrency(related.account_id)}</>
                          })()}
                        </div>
                      )}
                      <div className={`flex gap-1 transition-opacity ${activeTxId === tx.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                        {!isLocked(tx.account_id) && !(related && isLocked(related.account_id)) && (
                          <>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 sm:h-8 sm:w-8"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(tx)
                              }}
                            >
                              <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(tx.id)
                              }}
                            >
                              <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  )})}
                </div>
              )
            })()
          )}
          
          {transactions.length === 0 && !isAdding && (
            loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                  <Receipt className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No transactions yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Record your first transaction to start tracking</p>
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  )
}
