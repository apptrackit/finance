import { useEffect, useState } from 'react'
import { AccountList } from './components/dashboard-module/AccountList'
import { TransactionList } from './components/dashboard-module/TransactionList'
import { Analytics } from './components/analytics-module/Analytics'
import { Investments } from './components/investments-module/Investments'
import { RecurringTransactions } from './components/dashboard-module/RecurringTransactions'
import { Wallet, TrendingUp, TrendingDown, Activity, BarChart3, List, Settings as SettingsIcon, LineChart, Eye, EyeOff, RefreshCw, PiggyBank } from 'lucide-react'
import Settings, { getMasterCurrency } from './components/settings-module/Settings'
import { usePrivacy } from './context/PrivacyContext'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { Budget } from './components/budget-module/Budget'
import { useFinanceData } from './hooks/useFinanceData'

const MENU_STORAGE_KEY = 'finance_visible_menus'

type View = 'dashboard' | 'analytics' | 'settings' | 'investments' | 'recurring' | 'budget'
type MenuKey = Exclude<View, 'settings'>

const DEFAULT_MENU_VISIBILITY: Record<MenuKey, boolean> = {
  dashboard: true,
  analytics: true,
  investments: true,
  recurring: true,
  budget: true,
}

const getVisibleMenus = (): Record<MenuKey, boolean> => {
  try {
    const stored = localStorage.getItem(MENU_STORAGE_KEY)
    if (!stored) return DEFAULT_MENU_VISIBILITY
    const parsed = JSON.parse(stored) as Partial<Record<MenuKey, boolean>>
    return { ...DEFAULT_MENU_VISIBILITY, ...parsed }
  } catch {
    return DEFAULT_MENU_VISIBILITY
  }
}

function App() {
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem('finance_last_view') as View | null
    const validViews: View[] = ['dashboard', 'analytics', 'settings', 'investments', 'recurring', 'budget']
    return (saved && validViews.includes(saved)) ? saved : 'dashboard'
  })

  const navigateTo = (v: View) => {
    localStorage.setItem('finance_last_view', v)
    setView(v)
  }
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  const [showNetWorth, setShowNetWorth] = useState(false)
  const [visibleMenus, setVisibleMenus] = useState<Record<MenuKey, boolean>>(getVisibleMenus)
  const { privacyMode, togglePrivacyMode, shouldHideInvestment } = usePrivacy()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  })

  const {
    netWorth,
    investmentValue,
    investmentLoading,
    investmentError,
    accounts,
    transactions,
    allTransactions,
    transactionsLoading,
    categories,
    exchangeRates,
    investmentRefreshKey,
    handleDataChange,
  } = useFinanceData(dateRange, masterCurrency)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [view])

  useEffect(() => {
    setMasterCurrency(getMasterCurrency())
  }, [])

  useEffect(() => {
    const handler = () => setVisibleMenus(getVisibleMenus())
    window.addEventListener('finance:menu-visibility', handler)
    return () => window.removeEventListener('finance:menu-visibility', handler)
  }, [])

  useEffect(() => {
    const menuOrder: MenuKey[] = ['dashboard', 'analytics', 'investments', 'recurring', 'budget']
    if (view !== 'settings' && !visibleMenus[view]) {
      const next = menuOrder.find(key => visibleMenus[key]) || 'dashboard'
      navigateTo(next)
    }
  }, [visibleMenus, view])

  const convertToMasterCurrency = (amount: number, accountId: string): number => {
    const account = accounts.find(a => a.id === accountId)
    if (!account || account.currency === masterCurrency) return amount
    const rate = exchangeRates[account.currency]
    if (!rate) return amount
    return amount / rate
  }

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

  const cashBalance = accounts
    .filter(a => a.type === 'cash' && !(a.exclude_from_cash_balance && a.exclude_from_net_worth))
    .reduce((sum, account) => {
      const rate = exchangeRates[account.currency] || 1
      return sum + account.balance / rate
    }, 0)

  const totalNetWorth = netWorth !== null && !investmentLoading ? netWorth + investmentValue : null
  const hasInvestmentAccounts = accounts.some(a => a.type === 'investment')
  const showSeparateCashCard = hasInvestmentAccounts

  const navItems: { key: MenuKey; icon: React.ReactNode; label: string }[] = [
    { key: 'dashboard', icon: <List className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Dashboard' },
    { key: 'analytics', icon: <BarChart3 className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Analytics' },
    { key: 'investments', icon: <LineChart className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Investments' },
    { key: 'recurring', icon: <RefreshCw className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Recurring' },
    { key: 'budget', icon: <PiggyBank className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Budget' },
  ]

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
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
                {/* Desktop nav — hidden on mobile (replaced by bottom bar) */}
                <div className="hidden lg:flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg sm:rounded-xl bg-secondary/50 border border-border/50">
                  {navItems.filter(n => visibleMenus[n.key]).map(n => (
                    <button
                      key={n.key}
                      onClick={() => navigateTo(n.key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                        view === n.key
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      }`}
                    >
                      {n.icon}
                      <span>{n.label}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => navigateTo('settings')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      view === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    <span>Settings</span>
                  </button>
                </div>

                {/* Mobile header — compact icon buttons */}
                <div className="flex lg:hidden gap-0.5 p-0.5 rounded-lg bg-secondary/50 border border-border/50">
                  <button
                    onClick={() => navigateTo('settings')}
                    className={`px-2.5 py-2 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                      view === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Privacy Toggle */}
                <button
                  onClick={togglePrivacyMode}
                  className={`p-2 rounded-md lg:rounded-lg transition-all ${
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
                <div className="hidden lg:flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground">Synced</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-8">
          {view === 'dashboard' && (
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
                              : totalNetWorth.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                        aria-label={showNetWorth ? 'Hide net worth' : 'Show net worth'}
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

              {/* Cash Balance Card */}
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
                            : cashBalance.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                        +{privacyMode === 'hidden' ? '••••••' : totalIncome.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>{' '}
                      <span className="text-[10px] sm:text-base">{masterCurrency}</span>
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
                        <span className="mr-0.5">−</span>
                        {privacyMode === 'hidden' ? '••••••' : totalExpenses.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>{' '}
                      <span className="text-[10px] sm:text-base">{masterCurrency}</span>
                    </>
                  )}
                </div>
                <p className="text-[9px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">This period</p>
              </div>
            </div>
          )}

          {view === 'dashboard' ? (
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
                      endDate: format(endOfMonth(newMonth), 'yyyy-MM-dd'),
                    })
                  }}
                />
              </div>
            </div>
          ) : view === 'analytics' ? (
            <Analytics transactions={allTransactions} categories={categories} accounts={accounts} masterCurrency={masterCurrency} loading={transactionsLoading} />
          ) : view === 'investments' ? (
            <Investments key={investmentRefreshKey} />
          ) : view === 'recurring' ? (
            <RecurringTransactions accounts={accounts} categories={categories} dataLoading={transactionsLoading} />
          ) : view === 'budget' ? (
            <Budget accounts={accounts} categories={categories} transactions={allTransactions} masterCurrency={masterCurrency} />
          ) : (
            <Settings />
          )}
        </main>


      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50">
        <div className="flex items-center justify-around px-2 pt-2" style={{paddingBottom: 'max(8px, env(safe-area-inset-bottom))'}}>
          {navItems.filter(n => visibleMenus[n.key]).map(n => (
            <button
              key={n.key}
              onClick={() => navigateTo(n.key)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-0 ${
                view === n.key
                  ? 'text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              <span className={`${view === n.key ? 'scale-110' : ''} transition-transform`}>
                {n.icon}
              </span>
              <span className="text-[10px] font-medium truncate">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default App