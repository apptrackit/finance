import { useEffect, useState } from 'react'
import { AccountList } from './components/AccountList'
import { TransactionList } from './components/TransactionList'
import { Analytics } from './components/Analytics'
import { Investments } from './components/Investments'
import { RecurringTransactions } from './components/RecurringTransactions'
import { Wallet, TrendingUp, TrendingDown, Activity, BarChart3, List, Settings as SettingsIcon, LineChart, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { API_BASE_URL, apiFetch } from './config'
import Settings, { getMasterCurrency } from './components/Settings'
import { usePrivacy } from './context/PrivacyContext'
import { startOfMonth, endOfMonth, format } from 'date-fns'


const APP_VERSION = '1.1.2'


type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  updated_at: number
}

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  linked_transaction_id?: string
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

type View = 'dashboard' | 'analytics' | 'settings' | 'investments' | 'recurring'

function App() {
  const [netWorth, setNetWorth] = useState<number | null>(null)
  const [investmentValue, setInvestmentValue] = useState<number>(0)
  const [investmentLoading, setInvestmentLoading] = useState<boolean>(false)
  const [investmentError, setInvestmentError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]) // Unfiltered for Analytics
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [view, setView] = useState<View>(() => {
    // Restore last view from localStorage if available
    const lastView = localStorage.getItem('finance_last_view') as View | null
    if (lastView) {
      localStorage.removeItem('finance_last_view') // Clear it after reading
      return lastView
    }
    return 'dashboard'
  })
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  const [showNetWorth, setShowNetWorth] = useState(false)
  const [investmentRefreshKey, setInvestmentRefreshKey] = useState(0)
  const { privacyMode, togglePrivacyMode, shouldHideInvestment } = usePrivacy()
  
  // Date range state for transactions
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  })

  useEffect(() => {
    setMasterCurrency(getMasterCurrency())
  }, [])

  const fetchData = async () => {
    setTransactionsLoading(true)
    setInvestmentRefreshKey(prev => prev + 1) // Trigger Investments component refresh
    const currency = getMasterCurrency()
    
    apiFetch(`${API_BASE_URL}/dashboard/net-worth?currency=${currency}`)
      .then(res => res.json())
      .then(data => setNetWorth(data.net_worth))
      .catch(err => console.error(err))

    // Fetch accounts first
    const accountsRes = await apiFetch(`${API_BASE_URL}/accounts`)
    const accountsData = await accountsRes.json()
    setAccounts(accountsData)

    // Fetch regular transactions with date range (for TransactionList)
    const regularTxPromise = apiFetch(`${API_BASE_URL}/transactions/date-range?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)
      .then(res => res.json())
      .catch(err => {
        console.error(err)
        return []
      })

    // Fetch investment transactions for all investment accounts and convert to display format
    const investmentAccounts = accountsData.filter((acc: Account) => acc.type === 'investment')
    
    const investmentTxPromises = investmentAccounts.map((acc: Account) =>
      apiFetch(`${API_BASE_URL}/investment-transactions?account_id=${acc.id}`)
        .then(res => res.json())
        .then((txs: any[]) => 
          // Filter investment transactions by date range
          txs.filter(itx => itx.date >= dateRange.startDate && itx.date <= dateRange.endDate)
            .map((itx: any) => ({
              id: itx.id,
              account_id: itx.account_id,
              amount: itx.type === 'buy' ? itx.total_amount : -itx.total_amount,
              quantity: itx.type === 'buy' ? itx.quantity : -itx.quantity,
              description: itx.notes || `${itx.quantity} shares @ $${itx.price}`,
              date: itx.date,
              is_recurring: false,
              category_id: undefined,
              linked_transaction_id: undefined
            }))
        )
        .catch(() => [])
    )

    const [regularTxs, ...investmentTxArrays] = await Promise.all([regularTxPromise, ...investmentTxPromises])
    const allInvestmentTxs = investmentTxArrays.flat()
    const allTxs = [...regularTxs, ...allInvestmentTxs].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    
    setTransactions(allTxs)

    apiFetch(`${API_BASE_URL}/categories`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(err => console.error(err))
      .finally(() => setTransactionsLoading(false))
  }

  // Fetch ALL transactions (unfiltered) for Analytics
  const fetchAllTransactions = async () => {
    try {
      const accountsData = accounts.length > 0 ? accounts : await apiFetch(`${API_BASE_URL}/accounts`).then(res => res.json())
      
      // Fetch all regular transactions (no date filter)
      const regularTxPromise = apiFetch(`${API_BASE_URL}/transactions`)
        .then(res => res.json())
        .catch(err => {
          console.error(err)
          return []
        })

      // Fetch all investment transactions
      const investmentAccounts = accountsData.filter((acc: Account) => acc.type === 'investment')
      
      const investmentTxPromises = investmentAccounts.map((acc: Account) =>
        apiFetch(`${API_BASE_URL}/investment-transactions?account_id=${acc.id}`)
          .then(res => res.json())
          .then((txs: any[]) => 
            txs.map((itx: any) => ({
              id: itx.id,
              account_id: itx.account_id,
              amount: itx.type === 'buy' ? itx.total_amount : -itx.total_amount,
              quantity: itx.type === 'buy' ? itx.quantity : -itx.quantity,
              description: itx.notes || `${itx.quantity} shares @ $${itx.price}`,
              date: itx.date,
              category_id: undefined,
              linked_transaction_id: undefined
            }))
          )
          .catch(() => [])
      )

      const [regularTxs, ...investmentTxArrays] = await Promise.all([regularTxPromise, ...investmentTxPromises])
      const allInvestmentTxs = investmentTxArrays.flat()
      const allTxs = [...regularTxs, ...allInvestmentTxs].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      
      setAllTransactions(allTxs)
    } catch (error) {
      console.error('Failed to fetch all transactions:', error)
    }
  }

  useEffect(() => {
    fetchData()
    fetchAllTransactions()
    fetchInvestmentValue()
    fetchApiVersion()
  }, [])

  // Refetch transactions when date range changes
  useEffect(() => {
    if (accounts.length > 0) {
      fetchData()
    }
  }, [dateRange])

  // Handler for when transactions or accounts are added/modified
  const handleDataChange = () => {
    fetchData()
    fetchAllTransactions()
  }

  const fetchApiVersion = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/version`)
      const data = await res.json()
      setApiVersion(data.version)
    } catch (error) {
      console.error('Failed to fetch API version:', error)
      setApiVersion('unknown')
    }
  }

  // Fetch and calculate investment value in master currency
  const fetchInvestmentValue = async () => {
    setInvestmentLoading(true)
    setInvestmentError(null)
    try {
      const investmentAccounts = accounts.filter(a => a.type === 'investment')
      if (investmentAccounts.length === 0) {
        setInvestmentValue(0)
        setInvestmentLoading(false)
        return
      }
      
      // Fetch market quotes for all symbols
      const symbolsToFetch = investmentAccounts
        .filter(acc => acc.asset_type !== 'manual' && acc.symbol)
        .map(acc => acc.symbol!)
      const uniqueSymbols = [...new Set(symbolsToFetch)]
      
      const quotePromises = uniqueSymbols.map(symbol =>
        apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
          .then(res => res.json())
          .then(data => ({ symbol, data }))
          .catch((err) => {
            console.error(`Failed to fetch quote for ${symbol}:`, err)
            return { symbol, data: null }
          })
      )
      const quotesArray = await Promise.all(quotePromises)
      const quotes: Record<string, MarketQuote> = {}
      let failedQuotes = 0
      quotesArray.forEach(({ symbol, data }) => {
        if (data) {
          quotes[symbol] = data
        } else {
          failedQuotes++
        }
      })
      
      // If all quotes failed, throw an error
      if (uniqueSymbols.length > 0 && failedQuotes === uniqueSymbols.length) {
        throw new Error('Failed to fetch market data. Yahoo Finance API may be temporarily unavailable.')
      }

      // Calculate total value - need to handle multiple currencies
      let totalValueInMasterCurrency = 0
      const masterCurrency = getMasterCurrency()
      
      // Fetch exchange rates to master currency
      const ratesResponse = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`)
      const ratesData = await ratesResponse.json()
      const rates = ratesData.rates || {}

      for (let idx = 0; idx < investmentAccounts.length; idx++) {
        const acc = investmentAccounts[idx]
        
        let valueInAccountCurrency = 0

        if (acc.asset_type === 'manual') {
          // For manual assets, balance is already the total value in account's currency
          valueInAccountCurrency = acc.balance
        } else {
          // For stock/crypto: calculate quantity × market price
          const totalQuantity = acc.balance
          let priceUSD = 0
          
          if (acc.symbol && quotes[acc.symbol]) {
            priceUSD = quotes[acc.symbol].regularMarketPrice || 0
          }
          
          // Value in USD
          const valueUSD = priceUSD * totalQuantity
          
          // Convert USD to master currency
          if (masterCurrency === 'USD') {
            valueInAccountCurrency = valueUSD
          } else {
            const usdToMasterRate = rates['USD'] || 1
            valueInAccountCurrency = valueUSD / usdToMasterRate
          }
          
          // Add to total and continue to next account
          totalValueInMasterCurrency += valueInAccountCurrency
          continue
        }

        // For manual assets, convert from account currency to master currency
        if (acc.currency === masterCurrency) {
          totalValueInMasterCurrency += valueInAccountCurrency
        } else {
          const rate = rates[acc.currency]
          if (rate) {
            // Convert: account.currency -> masterCurrency
            totalValueInMasterCurrency += valueInAccountCurrency / rate
          } else {
            console.warn(`No exchange rate for ${acc.currency}, using raw value`)
            totalValueInMasterCurrency += valueInAccountCurrency
          }
        }
      }

      setInvestmentValue(totalValueInMasterCurrency)

      setInvestmentLoading(false)
    } catch (error) {
      console.error('Failed to calculate investment value:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch investment data'
      setInvestmentError(errorMessage)
      setInvestmentValue(0)
      setInvestmentLoading(false)
    }
  }

  // Re-fetch investment value when accounts change
  useEffect(() => {
    if (accounts.length > 0) {
      fetchInvestmentValue()
    }
  }, [accounts, masterCurrency])

  // Fetch exchange rates for conversion
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`)
        const data = await response.json()
        if (data.rates) {
          setExchangeRates(data.rates)
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error)
      }
    }
    fetchRates()
  }, [masterCurrency])

  // Convert amount to master currency
  const convertToMasterCurrency = (amount: number, accountId: string): number => {
    const account = accounts.find(a => a.id === accountId)
    if (!account || account.currency === masterCurrency) return amount
    
    const rate = exchangeRates[account.currency]
    if (!rate) return amount // Fallback to original if rate unavailable
    
    return amount / rate
  }

  // Calculate stats in master currency (exclude investment accounts and excluded accounts)
  const totalIncome = transactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      const isExcluded = account?.exclude_from_cash_balance && account?.exclude_from_net_worth
      return t.amount > 0 && !t.linked_transaction_id && account?.type !== 'investment' && !isExcluded
    })
    .reduce((sum, t) => sum + convertToMasterCurrency(t.amount, t.account_id), 0)
  const totalExpenses = transactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      const isExcluded = account?.exclude_from_cash_balance && account?.exclude_from_net_worth
      return t.amount < 0 && !t.linked_transaction_id && account?.type !== 'investment' && !isExcluded
    })
    .reduce((sum, t) => sum + Math.abs(convertToMasterCurrency(t.amount, t.account_id)), 0)
  
  // Calculate cash balance (excluding accounts marked to be excluded from all)
  const cashBalance = accounts
    .filter(a => a.type === 'cash' && !(a.exclude_from_cash_balance && a.exclude_from_net_worth))
    .reduce((sum, account) => {
      const rate = exchangeRates[account.currency] || 1
      return sum + (account.balance / rate)
    }, 0)
  
  // Only show total net worth if we have both cash data and investment is not loading
  const totalNetWorth = netWorth !== null && !investmentLoading ? netWorth + investmentValue : null
  
  // Only show cash card separately if there are investment accounts
  const hasInvestmentAccounts = accounts.some(a => a.type === 'investment')
  const showSeparateCashCard = hasInvestmentAccounts

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25">
                  <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary-foreground" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-xl font-bold tracking-tight">Finance</h1>
                  <p className="text-xs text-muted-foreground">Self-Hosted • Zero Trust</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg sm:rounded-xl bg-secondary/50 border border-border/50">
                  <button
                    onClick={() => setView('dashboard')}
                    className={`px-1.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-md sm:rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'dashboard'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <List className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </button>
                  <button
                    onClick={() => setView('analytics')}
                    className={`px-1.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-md sm:rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'analytics'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <BarChart3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">Analytics</span>
                  </button>
                  <button
                    onClick={() => setView('investments')}
                    className={`px-1.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-md sm:rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'investments'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <LineChart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">Investments</span>
                  </button>
                  <button
                    onClick={() => setView('recurring')}
                    className={`px-1.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-md sm:rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'recurring'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">Recurring</span>
                  </button>
                  <button
                    onClick={() => setView('settings')}
                    className={`px-1.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-md sm:rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <SettingsIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">Settings</span>
                  </button>
                </div>
                {/* Privacy Toggle */}
                <button
                  onClick={togglePrivacyMode}
                  className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg transition-all ${
                    privacyMode === 'hidden'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  }`}
                  title={privacyMode === 'hidden' ? 'Show values' : 'Hide values'}
                >
                  {privacyMode === 'hidden' ? (
                    <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  )}
                </button>
                <div className="hidden sm:flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground">Synced</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-8">
          {view === 'dashboard' && (
            /* Stats Grid - Only on Dashboard */
            <div className={`grid gap-2.5 sm:gap-4 grid-cols-2 ${showSeparateCashCard ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} mb-3 sm:mb-8`}>
              {/* Net Worth Card */}
              <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-gradient-to-br from-card to-card/80 p-3 sm:p-6 shadow-xl">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                    <span className="text-[10px] sm:text-sm font-medium text-muted-foreground">Net Worth</span>
                    <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Activity className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="text-lg sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
                      {investmentError ? (
                        <span className="text-xs sm:text-lg text-destructive">Error loading data</span>
                      ) : totalNetWorth !== null ? (
                        <>
                          <span className={privacyMode === 'hidden' || shouldHideInvestment() ? 'select-none' : ''}>
                            {(privacyMode === 'hidden' || shouldHideInvestment()) && !showNetWorth
                              ? '••••••' 
                              : totalNetWorth.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                          </span>
                          <span className="text-muted-foreground text-xs sm:text-2xl ml-0.5 sm:ml-1">{masterCurrency}</span>
                        </>
                      ) : (
                        <div className="h-6 sm:h-10 w-20 sm:w-32 bg-muted animate-pulse rounded" />
                      )}
                    </div>
                    {(privacyMode === 'hidden' || shouldHideInvestment()) && totalNetWorth !== null && !investmentError && (
                      <button
                        onClick={() => setShowNetWorth(!showNetWorth)}
                        className="ml-1 sm:ml-2 p-1 sm:p-1.5 rounded-lg hover:bg-primary/10 transition-colors"
                        aria-label={showNetWorth ? "Hide net worth" : "Show net worth"}
                      >
                        {showNetWorth ? (
                          <EyeOff className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                    {investmentError ? investmentError : 'Total value'}
                  </p>
                </div>
              </div>

              {/* Cash Balance Card - Only show if there are investments */}
              {showSeparateCashCard && (
                <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-card p-3 sm:p-6 shadow-xl hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                    <span className="text-[10px] sm:text-sm font-medium text-muted-foreground">Cash</span>
                    <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-500" />
                    </div>
                  </div>
                  <div className="text-lg sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
                    {netWorth !== null ? (
                      <>
                        <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                          {privacyMode === 'hidden' 
                            ? '••••••' 
                            : cashBalance.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                        </span>
                        <span className="text-muted-foreground text-xs sm:text-2xl ml-0.5 sm:ml-1">{masterCurrency}</span>
                      </>
                    ) : (
                      <div className="h-6 sm:h-10 w-20 sm:w-32 bg-muted animate-pulse rounded" />
                    )}
                  </div>
                  <p className="text-[9px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                    {accounts.filter(a => a.type === 'cash').length} account{accounts.filter(a => a.type === 'cash').length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {/* Income Card */}
              <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-card p-3 sm:p-6 shadow-xl hover:border-success/30 transition-colors">
                <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                  <span className="text-[10px] sm:text-sm font-medium text-muted-foreground">Income</span>
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-success/10 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
                  </div>
                </div>
                <div className="text-base sm:text-3xl font-bold tracking-tight text-success leading-tight">
                  {transactionsLoading ? (
                    <div className="h-5 sm:h-9 w-20 sm:w-32 bg-muted animate-pulse rounded" />
                  ) : (
                    <>
                      <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        +{privacyMode === 'hidden' ? '••••••' : totalIncome.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                      </span> <span className="text-[10px] sm:text-base">{masterCurrency}</span>
                    </>
                  )}
                </div>
                <p className="text-[9px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">This period</p>
              </div>

              {/* Expenses Card */}
              <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-card p-3 sm:p-6 shadow-xl hover:border-destructive/30 transition-colors">
                <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                  <span className="text-[10px] sm:text-sm font-medium text-muted-foreground">Expenses</span>
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
                  </div>
                </div>
                <div className="text-base sm:text-3xl font-bold tracking-tight text-destructive leading-tight">
                  {transactionsLoading ? (
                    <div className="h-5 sm:h-9 w-20 sm:w-32 bg-muted animate-pulse rounded" />
                  ) : (
                    <>
                      <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        <span className="mr-0.5">−</span>{privacyMode === 'hidden' ? '••••••' : totalExpenses.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                      </span> <span className="text-[10px] sm:text-base">{masterCurrency}</span>
                    </>
                  )}
                </div>
                <p className="text-[9px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">This period</p>
              </div>
            </div>
          )}

          {view === 'dashboard' ? (
            /* Main Content Grid */
            <div className="grid gap-3 sm:gap-6 grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <AccountList accounts={accounts} onAccountAdded={handleDataChange} loading={transactionsLoading} />
              </div>
              <div className="lg:col-span-8">
                <TransactionList 
                  transactions={transactions} 
                  accounts={accounts} 
                  onTransactionAdded={handleDataChange}
                  loading={transactionsLoading}
                  dateRange={dateRange}
                  onDateRangeChange={(newRange) => setDateRange(newRange)}
                  currentMonth={currentMonth}
                  onMonthChange={(newMonth) => {
                    setCurrentMonth(newMonth)
                    setDateRange({
                      startDate: format(startOfMonth(newMonth), 'yyyy-MM-dd'),
                      endDate: format(endOfMonth(newMonth), 'yyyy-MM-dd')
                    })
                  }}
                />
              </div>
            </div>
          ) : view === 'analytics' ? (
            /* Analytics View */
            <Analytics transactions={allTransactions} categories={categories} accounts={accounts} masterCurrency={masterCurrency} />
          ) : view === 'investments' ? (
            /* Investments View */
            <Investments key={investmentRefreshKey} />
          ) : view === 'recurring' ? (
            /* Recurring Transactions View */
            <RecurringTransactions accounts={accounts} categories={categories} />
          ) : (
            /* Settings View */
            <Settings />
          )}
        </main>

        {/* Version Footer */}
        <footer className="mt-auto py-4 text-center text-xs text-muted-foreground space-y-1">
          <p>Client v{APP_VERSION}</p>
          <p>API v{apiVersion || 'loading...'}</p>
        </footer>
      </div>
    </div>
  )
}

export default App
