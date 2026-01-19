import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import type { Account, Position, MarketQuote } from './types'
import { formatValue } from './utils'

type Props = {
  positions: Position[]
  quotes: Record<string, MarketQuote>
  loading: boolean
  refreshing: boolean
  privacyMode: string
  onRefresh: () => void
  onOpenDetail: (account: Account) => void
}

export function HoldingsList({
  positions,
  quotes,
  loading,
  refreshing,
  privacyMode,
  onRefresh,
  onOpenDetail
}: Props) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold text-lg">Your Holdings</h3>
        <button 
          onClick={onRefresh} 
          disabled={refreshing}
          className={`p-2 rounded-lg hover:bg-secondary/50 transition-colors ${refreshing ? 'animate-spin' : ''}`}
          title="Refresh prices"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      
      <div className="divide-y divide-border/50">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted/50 mb-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">No investment accounts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create an investment account to start tracking your portfolio
            </p>
            <p className="text-xs text-muted-foreground">
              Go to Dashboard → Accounts → Add Account → Choose "Investment" type
            </p>
          </div>
        ) : (
          positions.map(position => {
            const quote = position.account.symbol ? quotes[position.account.symbol] : null
            const priceChange = quote?.regularMarketChangePercent || 0
            
            return (
              <div 
                key={position.account.id} 
                className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors cursor-pointer group"
                onClick={() => onOpenDetail(position.account)}
              >
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm ${
                    position.account.asset_type === 'crypto' 
                      ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' 
                      : position.account.asset_type === 'manual' 
                      ? 'bg-gradient-to-br from-gray-400 to-gray-600 text-white' 
                      : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'
                  }`}>
                    {position.account.symbol?.slice(0, 3).toUpperCase() || position.account.name.slice(0, 3).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-lg flex items-center gap-2">
                      {position.account.symbol || position.account.name}
                      {position.account.asset_type !== 'manual' && !position.priceFetchError && quote && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${priceChange >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '•••• invested' : `${formatValue(position.netInvested, position.account)} invested`}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                    {privacyMode === 'hidden' ? '••••••' : formatValue(position.displayValue, position.account)}
                  </div>
                  {position.account.asset_type !== 'manual' && (
                    <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '•••• ' : `${position.actualQuantity > 0 ? '+' : ''}${position.actualQuantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} `}
                      {position.account.currency}
                    </div>
                  )}
                  <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                    {privacyMode === 'hidden' ? '•••• ' : `${position.account.symbol || position.account.name}`} {position.currentPrice > 0 && `@ $${position.currentPrice.toLocaleString()}`}
                  </div>
                  <div className={`text-sm font-semibold mt-1 flex items-center justify-end gap-1 ${position.priceFetchError ? 'text-yellow-600 dark:text-yellow-400' : position.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                    {position.priceFetchError ? (
                      <span className="text-xs">⚠️ Error fetching price</span>
                    ) : (
                      <>
                        {position.gainLoss >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {privacyMode === 'hidden' ? '••••' : `${position.gainLoss >= 0 ? '+' : ''}${formatValue(Math.abs(position.gainLoss), position.account)} (${position.gainLossPercent >= 0 ? '+' : ''}${position.gainLossPercent.toFixed(2)}%)`}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
