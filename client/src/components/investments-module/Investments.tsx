import { sumAvailable, convertCurrency } from '../../../../shared/currency'
import { MissingExchangeRates } from '../common/MissingExchangeRates'
import { useState } from 'react'
import { useOutletContext } from 'react-router'
import type { FinancePageContext } from '../../App'
import { FinanceDataBoundary } from '../common/FinanceDataStatus'
import { usePrivacy } from '../../context/PrivacyContext'
import type { PortfolioStats } from './types'
import { calculatePosition, convertToDisplayCurrency } from './utils'
import { PortfolioSummary } from './PortfolioSummary'
import { HoldingsList } from './HoldingsList'
import { InvestmentDetailModal } from './InvestmentDetailModal'

export function Investments() {
  const { investments } = useOutletContext<FinancePageContext>()
  const { data, status, refresh: fetchData, currencyDisplay, setCurrencyDisplay } = investments
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const { privacyMode } = usePrivacy()
  const investmentAccounts = data?.accounts ?? []
  const selectedAccount = investmentAccounts.find(account => account.id === selectedAccountId) ?? null
  const allTransactions = data?.transactions ?? []
  const categories = data?.categories ?? []
  const quotes = data?.quotes ?? {}
  const exchangeRates = data?.exchangeRates ?? {}
  const refreshing = status.loading

  const getAccountTransactions = (accountId: string) => {
    return allTransactions.filter(tx => tx.account_id === accountId)
  }

  const calculatePortfolioStats = (): PortfolioStats => {
    const positions = investmentAccounts.map(acc => 
      calculatePosition(acc, getAccountTransactions(acc.id), quotes, exchangeRates)
    )
    
    // Sort positions by current value (descending, most to least)
    const sortedPositions = [...positions].sort((a, b) => (b.currentValue ?? -Infinity) - (a.currentValue ?? -Infinity))
    
    const totalValue = sumAvailable(positions.map(pos => pos.currentValue))
    const totalInvested = sumAvailable(positions.map(pos => pos.netInvested))
    const totalGainLoss = totalValue === null || totalInvested === null ? null : totalValue - totalInvested
    const totalGainLossPercent = totalInvested === null || totalGainLoss === null ? null : totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
    
    return { totalValue, totalInvested, totalGainLoss, totalGainLossPercent, positions: sortedPositions }
  }

  const stats = calculatePortfolioStats()

  const convertDisplayCurrency = (usdValue: number | null) =>
    convertToDisplayCurrency(usdValue, currencyDisplay, exchangeRates)

  const missingCurrencies = [...new Set([
    ...stats.positions.flatMap(position => position.missingCurrencies),
    ...convertCurrency(1, 'USD', currencyDisplay, exchangeRates, 'USD').missingCurrencies,
  ])].sort()

  return (
    <FinanceDataBoundary label="Investments" datasets={[{ label: 'Investment portfolio', status }]}>
    <div className="space-y-6">
      <MissingExchangeRates currencies={missingCurrencies} targetCurrency={currencyDisplay}
        onRetry={() => { void fetchData() }} retrying={refreshing} />
      {/* Currency Toggle */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setCurrencyDisplay('HUF')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            currencyDisplay === 'HUF'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
          }`}
        >
          HUF
        </button>
        <button
          onClick={() => setCurrencyDisplay('USD')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            currencyDisplay === 'USD'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
          }`}
        >
          USD
        </button>
      </div>

      {/* Portfolio Summary */}
      <PortfolioSummary
        stats={stats}
        loading={false}
        privacyMode={privacyMode}
        displayCurrency={currencyDisplay}
        convertToDisplayCurrency={convertDisplayCurrency}
        investmentAccountsCount={investmentAccounts.length}
      />

      {/* Holdings List */}
      <HoldingsList
        positions={stats.positions}
        quotes={quotes}
        loading={false}
        refreshing={refreshing}
        privacyMode={privacyMode}
        onRefresh={fetchData}
        onOpenDetail={account => setSelectedAccountId(account.id)}
      />

      {/* Investment Detail Modal */}
      <InvestmentDetailModal
        account={selectedAccount}
        categories={categories}
        allTransactions={allTransactions}
        quotes={quotes}
        exchangeRates={exchangeRates}
        privacyMode={privacyMode}
        onClose={() => setSelectedAccountId(null)}
      />
    </div>
    </FinanceDataBoundary>
  )
}
