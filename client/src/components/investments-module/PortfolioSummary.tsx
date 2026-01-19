import { Wallet, Target, TrendingUp, TrendingDown } from 'lucide-react'
import type { PortfolioStats } from './types'
import { formatDisplayCurrency } from './utils'

type Props = {
  stats: PortfolioStats
  loading: boolean
  privacyMode: string
  displayCurrency: 'HUF' | 'USD'
  convertToDisplayCurrency: (value: number) => number
  investmentAccountsCount: number
}

export function PortfolioSummary({
  stats,
  loading,
  privacyMode,
  displayCurrency,
  convertToDisplayCurrency,
  investmentAccountsCount
}: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
            <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
            <div className="h-10 w-40 bg-muted animate-pulse rounded mb-2" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">Total Portfolio Value</h3>
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div className={`text-4xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
          {privacyMode === 'hidden' ? '••••••' : formatDisplayCurrency(convertToDisplayCurrency(stats.totalValue), displayCurrency)}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {investmentAccountsCount} investment{investmentAccountsCount !== 1 ? 's' : ''}
        </p>
      </div>
      
      <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">Total Invested</h3>
          <Target className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className={`text-4xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
          {privacyMode === 'hidden' ? '••••••' : formatDisplayCurrency(convertToDisplayCurrency(stats.totalInvested), displayCurrency)}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Net deposited</p>
      </div>
      
      <div className={`p-6 rounded-2xl border shadow-sm ${stats.totalGainLoss >= 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">Total Return</h3>
          {stats.totalGainLoss >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
        </div>
        <div className={`text-4xl font-bold ${stats.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
          {privacyMode === 'hidden' ? '••••••' : `${stats.totalGainLoss >= 0 ? '+' : '-'}${formatDisplayCurrency(convertToDisplayCurrency(Math.abs(stats.totalGainLoss)), displayCurrency)}`}
        </div>
        <div className={`text-sm font-medium mt-2 ${stats.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
          {privacyMode === 'hidden' ? '••••' : `${stats.totalGainLossPercent >= 0 ? '+' : ''}${stats.totalGainLossPercent.toFixed(2)}%`}
        </div>
      </div>
    </div>
  )
}
