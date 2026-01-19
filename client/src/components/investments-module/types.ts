export type Account = {
  id: string
  name: string
  type: 'cash' | 'investment' | 'credit'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  updated_at: number
}

export type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  quantity?: number
  description?: string
  date: string
  is_recurring: boolean
  linked_transaction_id?: string
}

export type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

export type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

export type Position = {
  account: Account
  netInvested: number
  currentValue: number
  displayValue: number
  currentPrice: number
  gainLoss: number
  gainLossPercent: number
  transactions: Transaction[]
  actualQuantity: number
  priceFetchError: boolean
}

export type PortfolioStats = {
  totalValue: number
  totalInvested: number
  totalGainLoss: number
  totalGainLossPercent: number
  positions: Position[]
}
