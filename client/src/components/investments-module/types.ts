export type Account = {
  id: string
  name: string
  type: 'cash' | 'investment' | 'credit'
  balance: number
  currency: string
  quote_currency?: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  archived_at?: number | null
  is_locked?: boolean
  updated_at: number
}

export type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  quantity?: number
  price?: number
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
  netInvested: number | null
  currentValue: number | null
  displayValue: number
  currentPrice: number
  quoteCurrency: string
  nativeInvested: number
  gainLoss: number | null
  gainLossPercent: number | null
  transactions: Transaction[]
  actualQuantity: number
  priceFetchError: boolean
  missingCurrencies: string[]
}

export type PortfolioStats = {
  totalValue: number | null
  totalInvested: number | null
  totalGainLoss: number | null
  totalGainLossPercent: number | null
  positions: Position[]
}
