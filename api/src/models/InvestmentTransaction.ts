import type { TradeFacts } from '../../../shared/investment-trade'
export type InvestmentTransactionType = 'buy' | 'sell'

export interface InvestmentTransaction extends TradeFacts {
  id: string
  account_id: string
  type: InvestmentTransactionType
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
  linked_transaction_id?: string | null
  created_at: number
}
