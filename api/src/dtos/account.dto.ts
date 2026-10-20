import type { HoldingFields } from '../../../shared/holding'
import { AccountType, AssetType } from '../models/Account'

export interface SplitTransactionDto {
  id: string
  description: string
  amount: number
  category_id: string
  date: string
}

export interface HoldingOpeningDto {
  owned?: boolean
  balance: number
  date: string
  cost_amount?: number | null
  cost_currency?: string | null
}

export interface HoldingWriteDto {
  pricing_method?: 'market' | 'manual'
  provider?: 'yahoo' | null
  exchange?: string | null
  manual_price?: number | null
  manual_price_date?: string | null
  opening?: HoldingOpeningDto
}

export interface CreateAccountDto extends HoldingWriteDto {
  name: string
  type: AccountType
  balance: number
  currency?: string
  quote_currency?: string
  symbol?: string
  asset_type?: AssetType
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
}

export interface UpdateAccountDto extends HoldingWriteDto {
  expected_balance?: number
  expected_updated_at?: number
  correction_date?: string

  name?: string
  type?: AccountType
  balance?: number
  currency?: string
  quote_currency?: string
  symbol?: string
  asset_type?: AssetType
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  adjustWithTransaction?: boolean
  splitTransactions?: SplitTransactionDto[]
}

export interface AccountResponseDto extends HoldingFields {
  id: string
  name: string
  type: AccountType
  balance: number
  currency: string
  quote_currency?: string
  symbol?: string
  asset_type?: AssetType
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  archived_at?: number | null
  is_locked?: boolean
  updated_at: number
}
