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

export interface InvestmentTransactionResponseDto {
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
