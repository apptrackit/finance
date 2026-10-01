import { convertCurrency } from '../../../../shared/currency'
import type { Account, Transaction, Position } from './types'

export const formatValue = (value: number, account?: Account, currency?: string) => {
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
  const formatted = Math.abs(value).toLocaleString('hu-HU', {
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
  const formatted = Math.abs(value).toLocaleString('hu-HU', {
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
  exchangeRates: Record<string, number>
): Position => {
  // Calculate actual quantity from transactions (don't trust account.balance)
  const actualQuantity = transactions.reduce((sum, tx) => sum + (tx.quantity || 0), 0)
  
  // Get current market price if available
  let currentPrice = 0
  let priceFetchError = false
  let quoteCurrency = (account.asset_type === 'manual' ? account.currency : account.quote_currency || 'USD').toUpperCase()
  if (account.asset_type !== 'manual' && account.symbol) {
    if (quotes[account.symbol]) {
      currentPrice = quotes[account.symbol].regularMarketPrice || 0
      quoteCurrency = (quotes[account.symbol].currency || quoteCurrency).toUpperCase()
    } else {
      // Symbol exists but no quote data - price fetch failed
      priceFetchError = true
    }
  }
  
  const missingCurrencies = new Set<string>()
  const convertToUsd = (value: number, currency: string) => {
    const result = convertCurrency(value, currency, 'USD', exchangeRates)
    result.missingCurrencies.forEach(item => missingCurrencies.add(item))
    return result.value
  }

  // Keep native values available even when the portfolio conversion fails.
  const displayValue = account.asset_type === 'manual' ? account.balance : actualQuantity * currentPrice
  const currentValue = priceFetchError ? null : convertToUsd(displayValue, quoteCurrency)
  const transactionNet = transactions.reduce((sum, tx) => sum + tx.amount, 0)
  const nativeInvested = account.asset_type === 'manual' ? account.balance : transactionNet
  const netInvested = convertToUsd(nativeInvested, account.asset_type === 'manual' ? account.currency : account.quote_currency || quoteCurrency)
  const gainLoss = account.asset_type === 'manual'
    ? convertToUsd(transactionNet, account.currency)
    : currentValue === null || netInvested === null ? null : currentValue - netInvested
  const gainLossPercent = gainLoss === null || netInvested === null ? null : netInvested > 0 ? gainLoss / netInvested * 100 : 0

  return {
    account,
    netInvested,
    currentValue, // USD value for portfolio totals
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
