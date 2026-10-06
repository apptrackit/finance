import { useCallback } from 'react'
import { useOutletContext } from 'react-router'
import { Analytics } from '../components/analytics-module/Analytics'
import { FinanceDataBoundary } from '../components/common/FinanceDataStatus'
import type { FinancePageContext } from '../App'
import { analyticsSearch, parseAnalyticsFilters } from '../navigation/filters'
import { useUrlFilters } from '../navigation/useUrlFilters'

export function AnalyticsPage() {
  const { finance, masterCurrency } = useOutletContext<FinancePageContext>()
  const { dataStatus } = finance
  const categoriesReady = dataStatus.categories.loaded && !dataStatus.categories.loading && !dataStatus.categories.error
  const parseFilters = useCallback((params: URLSearchParams) => parseAnalyticsFilters(params, new Date(), categoriesReady ? finance.categories : undefined), [categoriesReady, finance.categories])
  const [filters, updateFilters] = useUrlFilters(parseFilters, analyticsSearch)
  const projectionReady = dataStatus.upcoming.loaded && !dataStatus.upcoming.loading && !dataStatus.upcoming.error
  const datasets = [
    { label: 'Accounts', status: dataStatus.accounts }, { label: 'Transaction history', status: dataStatus.history },
    { label: 'Upcoming transactions', status: dataStatus.upcoming }, { label: 'Categories', status: dataStatus.categories },
  ]
  return <FinanceDataBoundary label="Analytics" datasets={datasets}>
    <Analytics transactions={finance.allTransactions} upcomingTransactions={finance.upcomingTransactions}
      categories={finance.categories} accounts={finance.accounts} masterCurrency={masterCurrency}
      exchangeRates={finance.usableExchangeRates} onRetryRates={() => { void finance.handleDataChange() }}
      loading={(!dataStatus.history.loaded && finance.allTransactionsLoading) || (!dataStatus.exchangeRates.loaded && finance.exchangeRatesLoading)}
      filters={filters} onFiltersChange={updateFilters} projectionReady={projectionReady} />
  </FinanceDataBoundary>
}
