import { AccountType, AssetType } from '../models/Account'

export interface CreateAccountDto {
  name: string
  type: AccountType
  balance: number
  currency?: string
  symbol?: string
  asset_type?: AssetType
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
}

export interface UpdateAccountDto {
  name?: string
  type?: AccountType
  balance?: number
  currency?: string
  symbol?: string
  asset_type?: AssetType
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  adjustWithTransaction?: boolean
}

export interface AccountResponseDto {
  id: string
  name: string
  type: AccountType
  balance: number
  currency: string
  symbol?: string
  asset_type?: AssetType
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  updated_at: number
}
