import { sumAvailable } from '../../../../shared/currency'
import { MissingExchangeRates } from '../common/MissingExchangeRates'
import { useState } from 'react'
import { useOutletContext } from 'react-router'
import type { FinancePageContext } from '../../App'
import { FinanceDataBoundary } from '../common/FinanceDataStatus'
import { usePrivacy } from '../../context/PrivacyContext'
import type { PortfolioStats } from './types'
import { calculatePosition } from './utils'
import { PortfolioSummary } from './PortfolioSummary'
import { HoldingsList } from './HoldingsList'
import { InvestmentDetailModal } from './InvestmentDetailModal'

export function Investments() {
  const { investments, finance } = useOutletContext<FinancePageContext>()
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
  const metrics=data?.metrics[currencyDisplay]

  const getAccountTransactions = (accountId: string) => {
    return allTransactions.filter(tx => tx.account_id === accountId)
  }

  const calculatePortfolioStats = (): PortfolioStats => {
    const positions = investmentAccounts.map(acc => 
      calculatePosition(acc, getAccountTransactions(acc.id), quotes, exchangeRates,metrics?.holdings.find(h=>h.account_id===acc.id),currencyDisplay)
    )
    
    // Sort positions by current value (descending, most to least)
    const sortedPositions = [...positions].sort((a, b) => (b.currentValue ?? -Infinity) - (a.currentValue ?? -Infinity))
    
    const totalValue = sumAvailable(positions.map(pos => pos.currentValue))
    const totalInvested = sumAvailable(positions.map(pos => pos.netInvested))
    const totalGainLoss = metrics?.total_gain ?? sumAvailable(positions.map(p=>p.gainLoss))
    const totalGainLossPercent = metrics?.estimated_return_percent ?? null
    
    return { totalValue, totalInvested, totalGainLoss, totalGainLossPercent, positions: sortedPositions }
  }

  const stats = calculatePortfolioStats()

  const convertDisplayCurrency = (value: number | null) => value

  const missingCurrencies = [...new Set([
    ...stats.positions.flatMap(position => position.missingCurrencies),
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

      {metrics && <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-2">
        <p>All active investment holdings · {currencyDisplay}. Net-worth exclusions apply on Dashboard and MCP.</p>
        <p title={metrics.market_today.boundary}>Market Today: {privacyMode==='hidden'?'••••••':`${metrics.market_today.gain===null?'Unavailable':metrics.market_today.gain.toLocaleString(undefined,{maximumFractionDigits:2})} ${currencyDisplay}`} · {metrics.market_today.covered_holdings}/{metrics.market_today.total_holdings} holdings covered.</p>
        <p className="text-xs text-muted-foreground">Flow-adjusted estimate from the prior daily close, including FX movement. Manual values, stale quotes and missing inputs are omitted.</p>
        {metrics.market_today.excluded.length>0 && <details><summary>Market Today coverage</summary><ul>{metrics.market_today.excluded.map(e=><li key={e.account_id}>{investmentAccounts.find(a=>a.id===e.account_id)?.name}: {e.reasons.join(', ').replaceAll('_',' ')}</li>)}</ul></details>}
      </div>}
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
        metrics={metrics?.holdings.find(h=>h.account_id===selectedAccountId)}
        reportingCurrency={currencyDisplay}
        onValuationSaved={() => { void finance.handleDataChange() }}
      />
    </div>
    </FinanceDataBoundary>
  )
}
