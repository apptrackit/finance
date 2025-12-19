import { Account } from '../models/Account'
import { AccountResponseDto, CreateAccountDto } from '../dtos/account.dto'

export class AccountMapper {
  static toResponseDto(account: Account): AccountResponseDto {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      symbol: account.symbol,
      asset_type: account.asset_type,
      updated_at: account.updated_at
    }
  }

  static toEntity(dto: CreateAccountDto, id: string, updated_at: number): Account {
    return {
      id,
      name: dto.name,
      type: dto.type,
      balance: dto.balance,
      currency: dto.currency || 'HUF',
      symbol: dto.symbol,
      asset_type: dto.asset_type,
      updated_at
    }
  }
}
