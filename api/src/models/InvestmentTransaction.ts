export type InvestmentTransactionType = 'buy' | 'sell'

export interface InvestmentTransaction {
  id: string
  account_id: string
  type: InvestmentTransactionType
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
  created_at: number
}
