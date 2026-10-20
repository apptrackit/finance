import type { TradeFacts } from '../../../shared/investment-trade'
import { InvestmentTransactionType } from '../models/InvestmentTransaction'

export interface CreateInvestmentTransactionDto {
  account_id: string
  type: InvestmentTransactionType
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
}

export interface InvestmentTransactionResponseDto extends TradeFacts {
  coverage?: { status:string;reasons:string[] }
  id: string
  account_id: string
  type: InvestmentTransactionType
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
  linked_transaction_id: string | null
  created_at: number
}
