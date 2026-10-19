import { TransactionResponseDto } from './transaction.dto'

export interface SplitLineDto {
  category_id: string | null
  amount: number
  note?: string | null
}

export interface BalanceAdjustmentDto {
  expected_balance: number
  new_balance: number
}

export interface SaveSplitDto {
  account_id: string
  date: string
  description?: string | null
  exclude_from_estimate?: boolean
  lines: SplitLineDto[]
  balance_adjustment?: BalanceAdjustmentDto
}

export interface TransactionSplitResponseDto {
  id: string
  description: string | null
  account_id: string
  date: string
  exclude_from_estimate: boolean
  total: number
  lines: TransactionResponseDto[]
}
