export interface NetWorthResponseDto {
  net_worth: number
  currency: string
  accounts: AccountNetWorth[]
  rates_fetched: boolean
}

export interface AccountNetWorth {
  id: string
  balance: number
  currency: string
  balance_in_master: number
}
