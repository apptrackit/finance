import { useCallback, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { startOfMonth, endOfMonth, format, parseISO } from 'date-fns'
import { Wallet, TrendingUp, TrendingDown, Activity, Eye, EyeOff } from 'lucide-react'
import { convertCurrency, sumAvailable } from '../../../shared/currency'
import { MissingExchangeRates } from '../components/common/MissingExchangeRates'
import { FinanceDataBoundary } from '../components/common/FinanceDataStatus'
import { AccountList } from '../components/dashboard-module/AccountList'
import { TransactionList } from '../components/dashboard-module/TransactionList'
import { usePrivacy } from '../context/PrivacyContext'
import { isUpcomingProjectionTransaction } from '../lib/transaction-review'
import { parseDashboardFilters, dashboardSearch } from '../navigation/filters'
import { useUrlFilters } from '../navigation/useUrlFilters'
import type { FinancePageContext } from '../App'

export function DashboardPage() {
  const { finance, masterCurrency } = useOutletContext<FinancePageContext>()
  const categoriesReady = finance.dataStatus.categories.loaded && !finance.dataStatus.categories.loading && !finance.dataStatus.categories.error
  const parseFilters = useCallback((params: URLSearchParams) => parseDashboardFilters(params, new Date(), categoriesReady ? finance.categories : undefined), [categoriesReady, finance.categories])
  const [filters, updateFilters] = useUrlFilters(parseFilters, dashboardSearch)
  const dateRange = useMemo(() => ({ startDate: filters.startDate, endDate: filters.endDate }), [filters.startDate, filters.endDate])
  const currentMonth = filters.range === 'allTime' ? new Date() : parseISO(filters.startDate)
  const isTransactionCalendarOpen = filters.view === 'calendar'
  const [showNetWorth, setShowNetWorth] = useState(false)
  const { privacyMode, shouldHideNetWorth } = usePrivacy()
  const {
    netWorth,
    investmentValue,
    investmentError,
    accounts,
    transactions,
    upcomingTransactions,
    transactionsLoading,
    usableExchangeRates: exchangeRates,
    netWorthMissingCurrencies,
    investmentMissingCurrencies,
    handleDataChange,
    dataStatus,
  } = finance

  const dataset = (key: keyof typeof dataStatus, label: string) => ({ label, status: dataStatus[key] })
  const accountData = [dataset('accounts', 'Accounts')]
  const transactionData = [...accountData, dataset('transactions', 'Period transactions'), dataset('upcoming', 'Upcoming transactions')]
  const summaryData = [...accountData, dataset('transactions', 'Period transactions')]
  const netWorthData = [...accountData, dataset('netWorth', 'Net worth'), dataset('investment', 'Investment value')]
  const visibleData = [...transactionData, dataset('categories', 'Categories'), dataset('netWorth', 'Net worth'),
    dataset('investment', 'Investment value'), dataset('exchangeRates', 'Exchange rates')]
  const missingCurrencies = new Set([...netWorthMissingCurrencies, ...investmentMissingCurrencies])
  const convertToMasterCurrency = (amount: number, accountId: string, absolute = false): number | null => {
    const account = accounts.find(a => a.id === accountId)
    if (!account) return null
    const result = convertCurrency(amount, account.currency, masterCurrency, exchangeRates)
    result.missingCurrencies.forEach(currency => missingCurrencies.add(currency))
    return absolute && result.value !== null ? Math.abs(result.value) : result.value
  }

  const totalIncome = sumAvailable(transactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      const isExcluded = account?.exclude_from_cash_balance && account?.exclude_from_net_worth
      return t.amount > 0 && !t.linked_transaction_id && account?.type !== 'investment' && !isExcluded
    })
    .map(t => convertToMasterCurrency(t.amount, t.account_id)))

  const totalExpenses = sumAvailable(transactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      const isExcluded = account?.exclude_from_cash_balance && account?.exclude_from_net_worth
      return t.amount < 0 && !t.linked_transaction_id && account?.type !== 'investment' && !isExcluded
    })
    .map(t => convertToMasterCurrency(t.amount, t.account_id, true)))

  const cashBalance = sumAvailable(accounts
    .filter(a => a.archived_at == null && a.type === 'cash' && !(a.exclude_from_cash_balance && a.exclude_from_net_worth))
    .map(account => convertToMasterCurrency(account.balance, account.id)))

  const projectableUpcomingTransactions = upcomingTransactions.filter(isUpcomingProjectionTransaction)

  const pendingPeriodTransactions = projectableUpcomingTransactions.filter(t =>
    t.date >= dateRange.startDate && t.date <= dateRange.endDate
  )

  const pendingIncome = sumAvailable(pendingPeriodTransactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      const isExcluded = account?.exclude_from_cash_balance && account?.exclude_from_net_worth
      return t.amount > 0 && !t.linked_transaction_id && account?.type !== 'investment' && !isExcluded
    })
    .map(t => convertToMasterCurrency(t.amount, t.account_id)))

  const pendingExpenses = sumAvailable(pendingPeriodTransactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      const isExcluded = account?.exclude_from_cash_balance && account?.exclude_from_net_worth
      return t.amount < 0 && !t.linked_transaction_id && account?.type !== 'investment' && !isExcluded
    })
    .map(t => convertToMasterCurrency(t.amount, t.account_id, true)))

  const pendingCashDelta = sumAvailable(projectableUpcomingTransactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      return account?.type === 'cash' && !(account.exclude_from_cash_balance && account.exclude_from_net_worth)
    })
    .map(t => convertToMasterCurrency(t.amount, t.account_id)))

  const pendingNetWorthDelta = sumAvailable(projectableUpcomingTransactions
    .filter(t => {
      const account = accounts.find(a => a.id === t.account_id)
      return account?.type !== 'investment' && !account?.exclude_from_net_worth
    })
    .map(t => convertToMasterCurrency(t.amount, t.account_id)))

  const totalNetWorth = netWorth !== null && investmentValue !== null && dataStatus.investment.loaded && !dataStatus.netWorth.error && !dataStatus.investment.error ? netWorth + investmentValue : null
  const projectedNetWorth = sumAvailable([totalNetWorth, pendingNetWorthDelta])
  const projectedCashBalance = sumAvailable([cashBalance, pendingCashDelta])
  const hasInvestmentAccounts = accounts.some(a => a.type === 'investment')
  const showSeparateCashCard = hasInvestmentAccounts

  return (<>
          {dataStatus.accounts.loaded && !dataStatus.exchangeRates.loading && (
            <div className="mb-4"><MissingExchangeRates currencies={[...missingCurrencies].sort()} targetCurrency={masterCurrency}
              onRetry={() => { void handleDataChange() }} retrying={visibleData.some(({ status }) => status.loading)} /></div>
          )}
            <div className={`grid gap-3 sm:gap-4 grid-cols-2 ${showSeparateCashCard ? 'min-[1440px]:grid-cols-4' : 'min-[1440px]:grid-cols-3'} mb-4 sm:mb-6`}>
              {/* Net Worth Card */}
              <FinanceDataBoundary label="Net Worth" datasets={netWorthData}>
              <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-gradient-to-br from-card to-card/80 p-4 sm:p-6 shadow-xl">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">Net Worth</span>
                    <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Activity className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="text-lg sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
                      {investmentError && !dataStatus.investment.loaded ? (
                        <span className="text-xs sm:text-lg text-destructive">Error loading data</span>
                      ) : totalNetWorth !== null ? (
                        <>
                          <span className={shouldHideNetWorth() ? 'select-none' : ''}>
                            {shouldHideNetWorth() && !showNetWorth
                              ? '••••••'
                              : totalNetWorth.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                          <span className="text-muted-foreground text-xs sm:text-2xl ml-0.5 sm:ml-1">{masterCurrency}</span>
                        </>
                      ) : (
                        <span className="text-xs sm:text-lg text-muted-foreground">Unavailable</span>
                      )}
                    </div>
                    {shouldHideNetWorth() && totalNetWorth !== null && (
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
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                    {investmentError ? investmentError : !dataStatus.upcoming.loaded ? 'Upcoming data unavailable' : projectedNetWorth === null ? 'Projection unavailable' : projectedNetWorth !== null && pendingNetWorthDelta !== 0 ? (
                      <>
                        After all upcoming{' '}
                        <span className={shouldHideNetWorth() ? 'select-none' : ''}>
                          {shouldHideNetWorth() && !showNetWorth
                            ? '••••••'
                            : projectedNetWorth.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>{' '}
                        {masterCurrency}
                      </>
                    ) : 'Total value'}
                  </p>
                </div>
              </div>

              </FinanceDataBoundary>

              {/* Cash Balance Card */}
              {showSeparateCashCard && (
                <FinanceDataBoundary label="Cash" datasets={accountData}>
                <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-xl hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">Cash</span>
                    <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                    </div>
                  </div>
                  <div className="text-lg sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
                    {cashBalance !== null ? (
                      <>
                        <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                          {privacyMode === 'hidden'
                            ? '••••••'
                            : cashBalance.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-muted-foreground text-xs sm:text-2xl ml-0.5 sm:ml-1">{masterCurrency}</span>
                      </>
                    ) : (
                      <span className="text-xs sm:text-lg text-muted-foreground">Unavailable</span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                    {!dataStatus.upcoming.loaded ? 'Upcoming data unavailable' : projectedCashBalance === null ? 'Projection unavailable' : pendingCashDelta !== 0 ? (
                      <>
                        After all upcoming{' '}
                        <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                          {privacyMode === 'hidden'
                            ? '••••••'
                            : projectedCashBalance.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>{' '}
                        {masterCurrency}
                      </>
                    ) : (
                      <>
                        {accounts.filter(a => a.archived_at == null && a.type === 'cash').length} account{accounts.filter(a => a.archived_at == null && a.type === 'cash').length !== 1 ? 's' : ''}
                      </>
                    )}
                  </p>
                </div>
                </FinanceDataBoundary>
              )}

              {/* Income Card */}
              <FinanceDataBoundary label="Income" datasets={summaryData}>
              <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-xl hover:border-success/30 transition-colors">
                <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Income</span>
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-success/10 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
                  </div>
                </div>
                <div className="text-lg sm:text-3xl font-bold tracking-tight text-success leading-tight">
                  {!dataStatus.transactions.loaded && transactionsLoading ? (
                    <div className="h-5 sm:h-9 w-20 sm:w-32 bg-muted animate-pulse rounded" />
                  ) : totalIncome === null ? <span className="text-xs sm:text-lg text-muted-foreground">Unavailable</span> : (
                    <>
                      <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        +{privacyMode === 'hidden' ? '••••••' : totalIncome.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>{' '}
                      <span className="text-[10px] sm:text-base">{masterCurrency}</span>
                    </>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                  {!dataStatus.upcoming.loaded ? 'Upcoming data unavailable' : pendingIncome === null ? 'Pending total unavailable' : pendingIncome > 0 ? (
                    <>
                      +{privacyMode === 'hidden' ? '••••••' : pendingIncome.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {masterCurrency} pending
                    </>
                  ) : 'This period'}
                </p>
              </div>

              </FinanceDataBoundary>

              {/* Expenses Card */}
              <FinanceDataBoundary label="Expenses" datasets={summaryData}>
              <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-xl hover:border-destructive/30 transition-colors">
                <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Expenses</span>
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
                  </div>
                </div>
                <div className="text-lg sm:text-3xl font-bold tracking-tight text-destructive leading-tight">
                  {!dataStatus.transactions.loaded && transactionsLoading ? (
                    <div className="h-5 sm:h-9 w-20 sm:w-32 bg-muted animate-pulse rounded" />
                  ) : totalExpenses === null ? <span className="text-xs sm:text-lg text-muted-foreground">Unavailable</span> : (
                    <>
                      <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        <span className="mr-0.5">−</span>
                        {privacyMode === 'hidden' ? '••••••' : totalExpenses.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>{' '}
                      <span className="text-[10px] sm:text-base">{masterCurrency}</span>
                    </>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                  {!dataStatus.upcoming.loaded ? 'Upcoming data unavailable' : pendingExpenses === null ? 'Pending total unavailable' : pendingExpenses > 0 ? (
                    <>
                      −{privacyMode === 'hidden' ? '••••••' : pendingExpenses.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {masterCurrency} pending
                    </>
                  ) : 'This period'}
                </p>
              </div>
              </FinanceDataBoundary>
            </div>
            <div className="grid gap-3 sm:gap-6 grid-cols-1 lg:grid-cols-12">
              {!isTransactionCalendarOpen && (
                <div className="lg:hidden">
                  <Link to="/accounts" className="mb-2 block text-right text-xs font-medium text-primary">Manage accounts →</Link>
                  <FinanceDataBoundary label="Accounts" datasets={accountData}>
                    <AccountList sortValues={finance.accountSortValues} accounts={accounts.filter(account => account.archived_at == null)} onAccountAdded={handleDataChange} loading={!dataStatus.accounts.loaded && dataStatus.accounts.loading} />
                  </FinanceDataBoundary>
                </div>
              )}
              <div className={isTransactionCalendarOpen ? 'lg:col-span-12' : 'lg:col-span-12'}>
                <FinanceDataBoundary label="Transactions" datasets={transactionData}>
                <TransactionList
                  transactions={transactions}
                  upcomingTransactions={upcomingTransactions}
                  accounts={accounts}
                  availableCategories={finance.categories}
                  onTransactionAdded={handleDataChange}
                  loading={!dataStatus.transactions.loaded && transactionsLoading}
                  dateRange={dateRange}
                  onDateRangeChange={(newRange) => updateFilters({ ...newRange, range: newRange.startDate === '1900-01-01' && newRange.endDate === '2100-12-31' ? 'allTime' : 'custom' })}
                  currentMonth={currentMonth}
                  onMonthChange={(newMonth) => {
                    updateFilters({
                      range: 'custom',
                      startDate: format(startOfMonth(newMonth), 'yyyy-MM-dd'),
                      endDate: format(endOfMonth(newMonth), 'yyyy-MM-dd'),
                    })
                  }}
                  convertToMasterCurrency={convertToMasterCurrency}
                  masterCurrency={masterCurrency}
                  filters={filters}
                  onFiltersChange={updateFilters}
                />
                </FinanceDataBoundary>
              </div>
            </div>
  </>)
}
