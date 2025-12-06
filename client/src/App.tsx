import { useEffect, useState } from 'react'
import { AccountList } from './components/AccountList'
import { TransactionList } from './components/TransactionList'
import { Analytics } from './components/Analytics'
import { Investments } from './components/Investments'
import { Wallet, TrendingUp, TrendingDown, Activity, BarChart3, List, Settings as SettingsIcon, LineChart, Eye, EyeOff } from 'lucide-react'
import { API_BASE_URL, apiFetch } from './config'
import Settings, { getMasterCurrency } from './components/Settings'
import { usePrivacy } from './context/PrivacyContext'


const APP_VERSION = '0.7'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  updated_at: number
}

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  is_recurring: boolean
  linked_transaction_id?: string
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type InvestmentTransaction = {
  id: string
  account_id: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
  created_at: number
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

type View = 'dashboard' | 'analytics' | 'settings' | 'investments'

function App() {
  const [netWorth, setNetWorth] = useState<number | null>(null)
  const [investmentValue, setInvestmentValue] = useState<number>(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [view, setView] = useState<View>('dashboard')
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  const { privacyMode, togglePrivacyMode } = usePrivacy()

  useEffect(() => {
    setMasterCurrency(getMasterCurrency())
  }, [])

  const fetchData = () => {
    const currency = getMasterCurrency()
    
    apiFetch(`${API_BASE_URL}/dashboard/net-worth?currency=${currency}`)
      .then(res => res.json())
      .then(data => setNetWorth(data.net_worth))
      .catch(err => console.error(err))

    apiFetch(`${API_BASE_URL}/accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data))
      .catch(err => console.error(err))

    apiFetch(`${API_BASE_URL}/transactions`)
      .then(res => res.json())
      .then(data => setTransactions(data))
      .catch(err => console.error(err))

    apiFetch(`${API_BASE_URL}/categories`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(err => console.error(err))
  }

  useEffect(() => {
    fetchData()
    fetchInvestmentValue()
  }, [])

  // Fetch and calculate investment value in master currency
  const fetchInvestmentValue = async () => {
    try {
      const investmentAccounts = accounts.filter(a => a.type === 'investment')
      if (investmentAccounts.length === 0) {
        setInvestmentValue(0)
        return
      }

      // Fetch transactions for all investment accounts
      const txPromises = investmentAccounts.map(acc =>
        apiFetch(`${API_BASE_URL}/investment-transactions?account_id=${acc.id}`)
          .then(res => res.json())
          .catch(() => [])
      )
      const allTransactions = await Promise.all(txPromises)
      
      // Fetch market quotes for all symbols
      const symbolsToFetch = investmentAccounts
        .filter(acc => acc.asset_type !== 'manual' && acc.symbol)
        .map(acc => acc.symbol!)
      const uniqueSymbols = [...new Set(symbolsToFetch)]
      
      const quotePromises = uniqueSymbols.map(symbol =>
        apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
          .then(res => res.json())
          .then(data => ({ symbol, data }))
          .catch(() => ({ symbol, data: null }))
      )
      const quotesArray = await Promise.all(quotePromises)
      const quotes: Record<string, MarketQuote> = {}
      quotesArray.forEach(({ symbol, data }) => {
        if (data) quotes[symbol] = data
      })

      // Calculate total value
      let totalValueUSD = 0
      investmentAccounts.forEach((acc, idx) => {
        const txs: InvestmentTransaction[] = allTransactions[idx] || []
        
        // Calculate position from transactions
        let totalQuantity = acc.balance // Initial balance
        txs.forEach(tx => {
          if (tx.type === 'buy') {
            totalQuantity += tx.quantity
          } else {
            totalQuantity -= tx.quantity
          }
        })
        
        // Get current price
        let price = 0
        if (acc.asset_type === 'manual') {
          // For manual, calculate average from transactions
          const buyTxs = txs.filter(tx => tx.type === 'buy')
          if (buyTxs.length > 0) {
            const totalCost = buyTxs.reduce((sum, tx) => sum + tx.total_amount, 0)
            const totalBought = buyTxs.reduce((sum, tx) => sum + tx.quantity, 0)
            price = totalBought > 0 ? totalCost / totalBought : 0
          }
        } else if (acc.symbol && quotes[acc.symbol]) {
          price = quotes[acc.symbol].regularMarketPrice || 0
        }
        
        totalValueUSD += price * totalQuantity
      })

      // Convert USD to master currency
      const currency = getMasterCurrency()
      if (currency === 'USD') {
        setInvestmentValue(totalValueUSD)
      } else {
        const response = await fetch(`https://open.er-api.com/v6/latest/USD`)
        const data = await response.json()
        if (data.rates && data.rates[currency]) {
          setInvestmentValue(totalValueUSD * data.rates[currency])
        } else {
          setInvestmentValue(totalValueUSD) // Fallback
        }
      }
    } catch (error) {
      console.error('Failed to calculate investment value:', error)
      setInvestmentValue(0)
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

  // Calculate stats in master currency
  const totalIncome = transactions
    .filter(t => t.amount > 0 && !t.linked_transaction_id)
    .reduce((sum, t) => sum + convertToMasterCurrency(t.amount, t.account_id), 0)
  const totalExpenses = transactions
    .filter(t => t.amount < 0 && !t.linked_transaction_id)
    .reduce((sum, t) => sum + Math.abs(convertToMasterCurrency(t.amount, t.account_id)), 0)
  
  // Calculate cash balance (accounts without investments)
  const cashBalance = netWorth !== null ? netWorth : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25">
                  <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-xl font-bold tracking-tight">Finance</h1>
                  <p className="text-xs text-muted-foreground">Self-Hosted • Zero Trust</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-xl bg-secondary/50 border border-border/50">
                  <button
                    onClick={() => setView('dashboard')}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'dashboard'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </button>
                  <button
                    onClick={() => setView('analytics')}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'analytics'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Analytics</span>
                  </button>
                  <button
                    onClick={() => setView('investments')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      view === 'investments'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <LineChart className="h-3.5 w-3.5" />
                    Investments
                  </button>
                  <button
                    onClick={() => setView('settings')}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 sm:gap-1.5 ${
                      view === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Settings</span>
                  </button>
                </div>
                {/* Privacy Toggle */}
                <button
                  onClick={togglePrivacyMode}
                  className={`p-2 rounded-lg transition-all ${
                    privacyMode === 'hidden'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  }`}
                  title={privacyMode === 'hidden' ? 'Show values' : 'Hide values'}
                >
                  {privacyMode === 'hidden' ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
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

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
          {view === 'dashboard' && (
            /* Stats Grid - Only on Dashboard */
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-4 sm:mb-8">
              {/* Net Worth Card */}
              <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card to-card/80 p-4 sm:p-6 shadow-xl">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">Net Worth</span>
                    <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
                    {netWorth !== null ? (
                      <>
                        <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                          {privacyMode === 'hidden' 
                            ? '••••••' 
                            : (netWorth + investmentValue).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                        </span>
                        <span className="text-muted-foreground text-lg sm:text-2xl ml-1">{masterCurrency}</span>
                      </>
                    ) : (
                      <div className="h-8 sm:h-10 w-32 bg-muted animate-pulse rounded" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Total value
                  </p>
                </div>
              </div>

              {/* Cash Balance Card */}
              <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-xl hover:border-emerald-500/30 transition-colors">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Cash</span>
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                  </div>
                </div>
                <div className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
                  {netWorth !== null ? (
                    <>
                      <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        {privacyMode === 'hidden' 
                          ? '••••••' 
                          : cashBalance.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                      </span>
                      <span className="text-muted-foreground text-lg sm:text-2xl ml-1">{masterCurrency}</span>
                    </>
                  ) : (
                    <div className="h-8 sm:h-10 w-32 bg-muted animate-pulse rounded" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {accounts.filter(a => a.type === 'cash').length} account{accounts.filter(a => a.type === 'cash').length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Income Card */}
              <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-xl hover:border-success/30 transition-colors">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Income</span>
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-success/10 flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
                  </div>
                </div>
                <div className="text-xl sm:text-3xl font-bold tracking-tight text-success">
                  <span className="text-success/70 text-base sm:text-xl">+</span>
                  <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                    {privacyMode === 'hidden' ? '••••••' : totalIncome.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                  </span> <span className="text-sm sm:text-base">{masterCurrency}</span>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">This period</p>
              </div>

              {/* Expenses Card */}
              <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-xl hover:border-destructive/30 transition-colors">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Expenses</span>
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                  </div>
                </div>
                <div className="text-xl sm:text-3xl font-bold tracking-tight text-destructive">
                  <span className="text-destructive/70 text-base sm:text-xl">-</span>
                  <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                    {privacyMode === 'hidden' ? '••••••' : totalExpenses.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                  </span> <span className="text-sm sm:text-base">{masterCurrency}</span>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">This period</p>
              </div>
            </div>
          )}

          {view === 'dashboard' ? (
            /* Main Content Grid */
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <AccountList accounts={accounts} onAccountAdded={fetchData} />
              </div>
              <div className="lg:col-span-8">
                <TransactionList 
                  transactions={transactions} 
                  accounts={accounts} 
                  onTransactionAdded={fetchData} 
                />
              </div>
            </div>
          ) : view === 'analytics' ? (
            /* Analytics View */
            <Analytics transactions={transactions} categories={categories} accounts={accounts} masterCurrency={masterCurrency} />
          ) : view === 'investments' ? (
            /* Investments View */
            <Investments />
          ) : (
            /* Settings View */
            <Settings />
          )}
        </main>

        {/* Version Footer */}
        <footer className="mt-auto py-4 text-center">
          <span className="text-xs text-muted-foreground">v{APP_VERSION}</span>
        </footer>
      </div>
    </div>
  )
}

export default App
