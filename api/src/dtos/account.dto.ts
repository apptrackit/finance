import { AccountType, AssetType } from '../models/Account'

export interface CreateAccountDto {
  name: string
  type: AccountType
  balance: number
  currency?: string
  symbol?: string
  asset_type?: AssetType
}

export interface UpdateAccountDto {
  name?: string
  type?: AccountType
  balance?: number
  currency?: string
  symbol?: string
  asset_type?: AssetType
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
  updated_at: number
}
