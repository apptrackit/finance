import type { Account, Transaction, Position } from './types'

export const formatValue = (value: number, account?: Account) => {
  if (!account || account.asset_type !== 'manual') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  // For manual assets, use their currency
  const currencySymbols: Record<string, string> = {
    HUF: 'Ft',
    EUR: '€',
    USD: '$',
    GBP: '£',
    CHF: 'CHF'
  }
  const symbol = currencySymbols[account.currency] || account.currency
  const decimals = account.currency === 'HUF' ? 0 : 2
  const formatted = Math.abs(value).toLocaleString('hu-HU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  return account.currency === 'HUF' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
}

export const formatDisplayCurrency = (value: number, displayCurrency: 'HUF' | 'USD') => {
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

export const convertToDisplayCurrency = (usdValue: number, displayCurrency: 'HUF' | 'USD', exchangeRates: Record<string, number>, masterCurrency: string) => {
  if (displayCurrency === 'USD') return usdValue
  const rate = exchangeRates[masterCurrency]
  return rate ? usdValue * rate : usdValue
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
  if (account.asset_type !== 'manual' && account.symbol) {
    if (quotes[account.symbol]) {
      currentPrice = quotes[account.symbol].regularMarketPrice || 0
    } else {
      // Symbol exists but no quote data - price fetch failed
      priceFetchError = true
    }
  }
  
  // Calculate current value in USD
  let currentValue = 0
  if (account.asset_type === 'manual') {
    // For manual: balance is in account's currency, convert to USD
    const balanceInAccountCurrency = account.balance
    if (account.currency === 'USD') {
      currentValue = balanceInAccountCurrency
    } else {
      const rate = exchangeRates[account.currency]
      if (rate) {
        currentValue = balanceInAccountCurrency / rate
      } else {
        console.warn(`No exchange rate for ${account.currency}, using raw value`)
        currentValue = balanceInAccountCurrency
      }
    }
  } else {
    // For crypto/stock: use calculated quantity, multiply by USD price
    currentValue = actualQuantity * currentPrice
  }
  
  // Calculate invested amount from investment transactions
  let netInvested = 0
  let initialInvestment = 0
  
  if (account.asset_type === 'manual') {
    // For manual: need to get initial balance from account creation
    const totalAdded = transactions
      .filter(tx => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0)
    
    const totalWithdrawn = transactions
      .filter(tx => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    
    const transactionNet = totalAdded - totalWithdrawn
    
    // Initial investment = current balance - transaction gains
    if (account.currency === 'USD') {
      initialInvestment = account.balance - transactionNet
    } else {
      const rate = exchangeRates[account.currency]
      if (rate) {
        initialInvestment = (account.balance - transactionNet) / rate
      } else {
        initialInvestment = account.balance - transactionNet
      }
    }
    
    netInvested = initialInvestment + transactionNet
  } else {
    // For stock/crypto: count all transactions as invested
    const totalInvested = transactions
      .filter(tx => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0)
    
    const totalWithdrawn = transactions
      .filter(tx => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    
    netInvested = totalInvested - totalWithdrawn
  }
  
  // For manual assets, gain/loss should only be from transactions
  // For stock/crypto, gain/loss is current value - invested
  const gainLoss = account.asset_type === 'manual' 
    ? (transactions.reduce((sum, tx) => sum + tx.amount, 0)) 
    : (currentValue - netInvested)
  const gainLossPercent = netInvested > 0 ? (gainLoss / netInvested) * 100 : 0
  
  // For display purposes, store the value in the original currency for manual assets
  const displayValue = account.asset_type === 'manual' ? account.balance : currentValue
  
  return {
    account,
    netInvested,
    currentValue, // USD value for portfolio totals
    displayValue, // Original currency value for display
    currentPrice,
    gainLoss,
    gainLossPercent,
    transactions,
    actualQuantity,
    priceFetchError
  }
}
