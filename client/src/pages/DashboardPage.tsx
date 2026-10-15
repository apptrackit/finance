import { useCallback, useMemo, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router'
import { startOfMonth, endOfMonth, format, parseISO, differenceInCalendarDays } from 'date-fns'
import { Eye, EyeOff } from 'lucide-react'
import { convertCurrency, sumAvailable } from '../../../shared/currency'
import { MissingExchangeRates } from '../components/common/MissingExchangeRates'
import { FinanceDataBoundary } from '../components/common/FinanceDataStatus'
import { DashboardPeriodPicker } from '../components/dashboard-module/DashboardPeriodPicker'
import { TransactionList } from '../components/dashboard-module/TransactionList'
import { usePrivacy } from '../context/PrivacyContext'
import { formatCalculatedAmount } from '../lib/amount'
import { isUpcomingProjectionTransaction } from '../lib/transaction-review'
import { parseDashboardFilters, dashboardSearch } from '../navigation/filters'
import { useUrlFilters } from '../navigation/useUrlFilters'
import type { FinancePageContext } from '../App'

export function DashboardPage() {
  const location = useLocation()
  const searchRequest = location.state as { transactionSearch?: string } | null
  const { finance, masterCurrency } = useOutletContext<FinancePageContext>()
  const categoriesReady = finance.dataStatus.categories.loaded && !finance.dataStatus.categories.loading && !finance.dataStatus.categories.error
  const parseFilters = useCallback((params: URLSearchParams) => parseDashboardFilters(params, new Date(), categoriesReady ? finance.categories : undefined), [categoriesReady, finance.categories])
  const [filters, updateFilters] = useUrlFilters(parseFilters, dashboardSearch)
  const dateRange = useMemo(() => ({ startDate: filters.startDate, endDate: filters.endDate }), [filters.startDate, filters.endDate])
  const currentMonth = filters.range === 'allTime' ? new Date() : parseISO(filters.startDate)
  const [showNetWorth, setShowNetWorth] = useState(false)
  const { privacyMode, shouldHideNetWorth } = usePrivacy()
  const {
    netWorth,
    investmentValue,
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

  const totalNetWorth = netWorth !== null && investmentValue !== null && dataStatus.investment.loaded && !dataStatus.netWorth.error && !dataStatus.investment.error ? netWorth + investmentValue : null
  const cashAccounts = accounts.filter(a => a.archived_at == null && a.type === 'cash' && !(a.exclude_from_cash_balance && a.exclude_from_net_worth))
  const cashUpcoming = projectableUpcomingTransactions.filter(t => cashAccounts.some(a => a.id === t.account_id))
  const hidden = privacyMode === 'hidden'
  const hideNetWorth = hidden || (shouldHideNetWorth() && !showNetWorth)
  const amount = (value: number | null, hide = hidden) => value === null ? 'Unavailable' : hide ? '••••••' : formatCalculatedAmount(value, { maximumFractionDigits: 0 })
  const signed = (value: number | null) => value === null ? 'Unavailable' : hidden ? '••••••' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${amount(Math.abs(value))}`
  const today = format(new Date(), 'yyyy-MM-dd')
  const wholeMonth = dateRange.startDate === format(startOfMonth(currentMonth), 'yyyy-MM-dd') && dateRange.endDate === format(endOfMonth(currentMonth), 'yyyy-MM-dd')
  const periodLabel = filters.range === 'allTime' ? 'All time' : wholeMonth ? `${format(currentMonth, 'MMMM')}${today >= dateRange.startDate && today <= dateRange.endDate ? ' so far' : ' activity'}` : 'Period activity'
  const daysLeft = differenceInCalendarDays(parseISO(dateRange.endDate), new Date())
  const ratio = totalIncome !== null && totalExpenses !== null && totalIncome > 0 ? totalExpenses / totalIncome * 100 : null
  const barSpent = hidden || ratio === null ? 0 : Math.min(100, ratio)
  const barUpcoming = hidden || ratio === null || pendingExpenses === null || !dataStatus.upcoming.loaded ? 0 : Math.min(100 - barSpent, pendingExpenses / totalIncome! * 100)
  const leftover = totalIncome !== null && totalExpenses !== null ? totalIncome - totalExpenses : null

  return (<>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="hidden text-2xl font-semibold tracking-tight lg:block">Dashboard</h1>
            <DashboardPeriodPicker filters={filters} onChange={updateFilters} />
          </div>
          {dataStatus.accounts.loaded && !dataStatus.exchangeRates.loading && (
            <div className="mb-4"><MissingExchangeRates compact currencies={[...missingCurrencies].sort()} targetCurrency={masterCurrency}
              onRetry={() => { void handleDataChange() }} retrying={visibleData.some(({ status }) => status.loading)} /></div>
          )}
          <section aria-label="Dashboard summary" className="mb-5 grid grid-cols-1 overflow-hidden rounded-[14px] border border-border bg-card lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="min-w-0 border-b border-border p-4 sm:p-5 lg:col-start-1 lg:row-start-1 lg:py-4">
              <FinanceDataBoundary label="Net worth" datasets={netWorthData}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
                <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">Net worth
                  {shouldHideNetWorth() && !hidden && <button type="button" onClick={() => setShowNetWorth(!showNetWorth)} aria-label={showNetWorth ? 'Hide net worth' : 'Show net worth'} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary">
                    {showNetWorth ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>}
                </div>
                <p className="min-w-0 break-words text-right text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{amount(totalNetWorth, hideNetWorth)} <span className="text-xs font-medium text-muted-foreground sm:text-sm">{masterCurrency}</span></p>
                {investmentValue !== 0 && <p className="mt-2 text-xs text-muted-foreground sm:text-[13px] col-start-2 text-right">Incl. {amount(investmentValue, hideNetWorth || hidden)} {masterCurrency} investments</p>}
                </div>
              </FinanceDataBoundary>
            </div>
            <div className="min-w-0 p-4 sm:p-5 lg:col-start-1 lg:row-start-2 lg:py-4">
              <FinanceDataBoundary label="Cash" datasets={accountData}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
                <div className="flex flex-col items-start gap-1 text-[13px] text-muted-foreground"><span className="font-medium">Cash</span><span className="text-xs">{cashAccounts.length} account{cashAccounts.length === 1 ? '' : 's'}</span></div>
                <p className="min-w-0 break-words text-right text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{amount(cashBalance)} <span className="text-xs font-medium text-muted-foreground sm:text-sm">{masterCurrency}</span></p>
                {(!dataStatus.upcoming.loaded || cashUpcoming.length > 0) && <p className="mt-2 text-xs text-muted-foreground sm:text-[13px] col-start-2 text-right">{!dataStatus.upcoming.loaded ? 'Upcoming data unavailable' : pendingCashDelta === null ? 'Projection unavailable' : <><span className={hidden ? '' : pendingCashDelta >= 0 ? 'font-semibold text-success' : 'font-semibold text-destructive'}>{signed(pendingCashDelta)} {masterCurrency}</span> after {cashUpcoming.length} upcoming</>}</p>}
                </div>
              </FinanceDataBoundary>
            </div>
            <div className="min-w-0 border-t border-border p-4 sm:p-5 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:border-t-0 lg:border-l">
              <FinanceDataBoundary label="Period activity" datasets={summaryData}>
                <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-border/60 pb-3"><h2 className="text-xs font-medium tracking-wide text-muted-foreground">{periodLabel}</h2>{filters.range !== 'allTime' && today >= dateRange.startDate && today <= dateRange.endDate && <span className="shrink-0 text-xs text-muted-foreground">{daysLeft} days left</span>}</div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-sm tabular-nums lg:grid-cols-[auto_1fr_auto]">
                  <span className="text-muted-foreground">Income</span><span className={`text-right font-semibold ${totalIncome === null ? 'text-muted-foreground' : 'text-success'}`}>{signed(totalIncome)} <span className="text-xs font-normal text-muted-foreground">{masterCurrency}</span></span><span className={`col-start-2 text-right text-xs text-muted-foreground lg:col-auto ${dataStatus.upcoming.loaded && pendingIncome === 0 ? 'hidden lg:block' : '-mt-1 lg:mt-0'}`}>{!dataStatus.upcoming.loaded || pendingIncome === null ? 'Upcoming unavailable' : pendingIncome > 0 ? `${signed(pendingIncome)} upcoming` : null}</span>
                  <span className="text-muted-foreground">Expense</span><span className={`text-right font-semibold ${totalExpenses === null ? 'text-muted-foreground' : 'text-destructive'}`}>{signed(totalExpenses === null ? null : -totalExpenses)} <span className="text-xs font-normal text-muted-foreground">{masterCurrency}</span></span><span className={`col-start-2 text-right text-xs text-muted-foreground lg:col-auto ${dataStatus.upcoming.loaded && pendingExpenses === 0 ? 'hidden lg:block' : '-mt-1 lg:mt-0'}`}>{!dataStatus.upcoming.loaded || pendingExpenses === null ? 'Upcoming unavailable' : pendingExpenses > 0 ? `${signed(-pendingExpenses)} upcoming` : null}</span>
                </div>
                <div aria-hidden="true" className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-secondary"><div className="bg-primary" style={{ width: `${barSpent}%` }} /><div className="bg-primary/35" style={{ width: `${barUpcoming}%` }} /></div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{hidden ? '••%' : ratio === null ? 'Ratio unavailable' : `${Math.round(ratio)}% of income spent`}</span><span><span className="font-medium lg:font-semibold lg:text-foreground">{amount(leftover)} {masterCurrency}</span> left over</span></div>
              </FinanceDataBoundary>
            </div>
          </section>
          <FinanceDataBoundary label="Transactions" datasets={transactionData}>
                <TransactionList
                  searchRequest={searchRequest?.transactionSearch} searchRequestKey={location.key}
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
  </>)
}
