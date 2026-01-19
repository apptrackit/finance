import type { Account, TrendDataPoint } from './types'

// Helper function to calculate Y-axis domain for charts
export const calculateYAxisDomain = (data: TrendDataPoint[]) => {
  if (data.length === 0) return [0, 100]
  
  const values = data.map(d => d.balance)
  const min = Math.min(...values)
  const max = Math.max(...values)
  
  // Add 25% padding above and below to show movement better
  const range = max - min
  const padding = range * 0.25
  
  // If the range is very small, use a minimum padding
  const minPadding = max * 0.1
  const actualPadding = Math.max(padding, minPadding)
  
  const domainMin = Math.max(0, min - actualPadding)
  const domainMax = max + actualPadding
  
  return [domainMin, domainMax]
}

// Convert amount to master currency
export const convertToMasterCurrency = (
  amount: number, 
  accountId: string, 
  accounts: Account[], 
  exchangeRates: Record<string, number>,
  masterCurrency: string
): number => {
  const account = accounts.find(a => a.id === accountId)
  if (!account || account.currency === masterCurrency) return amount
  
  const rate = exchangeRates[account.currency]
  if (!rate) return amount // Fallback to original if rate unavailable
  
  return amount / rate
}
