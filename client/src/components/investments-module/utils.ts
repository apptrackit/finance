import { holdingMetrics } from '../../../../shared/investment-metrics'
import type { HoldingMetrics, MetricTrade } from '../../../../shared/investment-metrics'
import { usesMarketPricing } from '../../../../shared/holding'
import { convertCurrency } from '../../../../shared/currency'
import type { Account, Transaction, Position } from './types'

export const formatValue = (value: number | null, account?: Account, currency?: string) => {
  const valueCurrency = currency || (account?.asset_type === 'manual' ? account.currency : 'USD')
  if (value === null) return 'Unavailable'
  const currencySymbols: Record<string, string> = {
    HUF: 'Ft',
    EUR: '€',
    USD: '$',
    GBP: '£',
    CHF: 'CHF'
  }
  const symbol = currencySymbols[valueCurrency] || valueCurrency
  const decimals = valueCurrency === 'HUF' ? 0 : 2
  const formatted = value.toLocaleString('hu-HU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  return valueCurrency === 'HUF' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
}

export const formatDisplayCurrency = (value: number | null, displayCurrency: 'HUF' | 'USD') => {
  if (value === null) return 'Unavailable'
  const currencySymbols: Record<string, string> = {
    HUF: 'Ft',
    EUR: '€',
    USD: '$',
    GBP: '£',
    CHF: 'CHF'
  }
  const symbol = currencySymbols[displayCurrency] || displayCurrency
  const decimals = displayCurrency === 'HUF' ? 0 : 2
  const formatted = value.toLocaleString('hu-HU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  return displayCurrency === 'HUF' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
}

export const convertToDisplayCurrency = (usdValue: number | null, displayCurrency: 'HUF' | 'USD', exchangeRates: Record<string, number>): number | null => {
  if (usdValue === null) return null
  return convertCurrency(usdValue, 'USD', displayCurrency, exchangeRates, 'USD').value
}

export const calculatePosition = (
  account: Account,
  transactions: Transaction[],
  quotes: Record<string, any>,
  exchangeRates: Record<string, number>,
  metrics?: HoldingMetrics,
  reportingCurrency = 'USD'
): Position => {
  // Stored units include openings and corrections that legacy activity may omit.
  const actualQuantity = account.balance
  
  // Get current market price if available
  let currentPrice = 0
  let priceFetchError = false
  let quoteCurrency = (account.asset_type === 'manual' ? account.currency : account.quote_currency || 'USD').toUpperCase()
  if (usesMarketPricing(account) && account.symbol) {
    if (quotes[account.symbol.trim().toUpperCase()]) {
      currentPrice = quotes[account.symbol.trim().toUpperCase()].regularMarketPrice || 0
      quoteCurrency = (quotes[account.symbol.trim().toUpperCase()].currency || quoteCurrency).toUpperCase()
    } else {
      // Symbol exists but no quote data - price fetch failed
      priceFetchError = true
    }
  }
  
  const missingCurrencies = new Set<string>()
  const facts: MetricTrade[]=transactions.filter(t=>t.quantity!==undefined && t.price!==undefined).map(t=>({...t,
    type:t.quantity!<0?'sell':'buy',quantity:Math.abs(t.quantity!),price:t.price!,total_amount:Math.abs(t.amount)}))
  const metric=metrics??holdingMetrics(account,facts,reportingCurrency,account.symbol?quotes[account.symbol.trim().toUpperCase()]:undefined,
    (amount,source,target)=>convertCurrency(amount,source,target,exchangeRates,'USD').value,
    (amount,source,target)=>source===target?amount:null,new Date().toISOString().slice(0,10))
  const displayValue=metric.native_value
  quoteCurrency=metric.native_currency||quoteCurrency
  priceFetchError=displayValue===null
  if (!usesMarketPricing(account)) currentPrice = account.manual_price ?? 0
  if(metric.value===null && displayValue!==null) convertCurrency(displayValue,quoteCurrency,reportingCurrency,exchangeRates,'USD').missingCurrencies.forEach(c=>missingCurrencies.add(c))
  const currentValue=metric.value,netInvested=metric.net_invested,nativeInvested=metric.native.net_invested
  const gainLoss=metric.total_gain,gainLossPercent=metric.estimated_return_percent

  return {
    account,metrics:metric,reportingCurrency,
    netInvested,
    currentValue, // Selected reporting-currency value
    displayValue, // Original currency value for display
    currentPrice,
    quoteCurrency,
    nativeInvested,
    gainLoss,
    gainLossPercent,
    transactions,
    actualQuantity,
    priceFetchError,
    missingCurrencies: [...missingCurrencies],
  }
}
