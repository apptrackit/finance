import { useEffect, useState } from 'react'
import { AccountList } from './components/AccountList'
import { TransactionList } from './components/TransactionList'
import { Analytics } from './components/Analytics'
import { Wallet, TrendingUp, TrendingDown, Activity, BarChart3, List, Settings as SettingsIcon } from 'lucide-react'
import { API_BASE_URL, apiFetch } from './config'
import Settings, { getMasterCurrency } from './components/Settings'


const APP_VERSION = '0.4.3'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
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
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type View = 'dashboard' | 'analytics' | 'settings'

function App() {
  const [netWorth, setNetWorth] = useState<number | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [view, setView] = useState<View>('dashboard')
  const [masterCurrency, setMasterCurrency] = useState('HUF')

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
  }, [])

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
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + convertToMasterCurrency(t.amount, t.account_id), 0)
  const totalExpenses = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(convertToMasterCurrency(t.amount, t.account_id)), 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25">
                  <Wallet className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">Finance</h1>
                  <p className="text-xs text-muted-foreground">Self-Hosted • Zero Trust</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 p-1 rounded-xl bg-secondary/50 border border-border/50">
                  <button
                    onClick={() => setView('dashboard')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      view === 'dashboard'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    Dashboard
                  </button>
                  <button
                    onClick={() => setView('analytics')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      view === 'analytics'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Analytics
                  </button>
                  <button
                    onClick={() => setView('settings')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      view === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    Settings
                  </button>
                </div>
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs text-muted-foreground">Synced</span>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            {/* Net Worth Card */}
            <div className="md:col-span-1 group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card to-card/80 p-6 shadow-xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-muted-foreground">Net Worth</span>
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="text-4xl font-bold tracking-tight text-foreground">
                  {netWorth !== null ? (
                    <>
                      {netWorth.toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      <span className="text-muted-foreground text-2xl ml-1">{masterCurrency}</span>
                    </>
                  ) : (
                    <div className="h-10 w-32 bg-muted animate-pulse rounded" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Income Card */}
            <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 shadow-xl hover:border-success/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Income</span>
                <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-success" />
                </div>
              </div>
              <div className="text-3xl font-bold tracking-tight text-success">
                <span className="text-success/70 text-xl">+</span>
                {totalIncome.toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {masterCurrency}
              </div>
              <p className="text-xs text-muted-foreground mt-2">This period</p>
            </div>

            {/* Expenses Card */}
            <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 shadow-xl hover:border-destructive/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Expenses</span>
                <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </div>
              </div>
              <div className="text-3xl font-bold tracking-tight text-destructive">
                <span className="text-destructive/70 text-xl">-</span>
                {totalExpenses.toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {masterCurrency}
              </div>
              <p className="text-xs text-muted-foreground mt-2">This period</p>
            </div>
          </div>

          {view === 'dashboard' ? (
            /* Main Content Grid */
            <div className="grid gap-6 lg:grid-cols-12">
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
