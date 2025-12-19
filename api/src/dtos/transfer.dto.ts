export interface CreateTransferDto {
  from_account_id: string
  to_account_id: string
  amount_from: number
  amount_to: number
  exchange_rate?: number
  description?: string
  date: string
  price?: number
}

export interface TransferResponseDto {
  id: string
  outgoing_transaction_id: string
  incoming_transaction_id: string
  amount_from: number
  amount_to: number
  exchange_rate: number
  from_account_id: string
  to_account_id: string
  is_investment_transfer: boolean
}

export interface ExchangeRateResponseDto {
  rate: number
  from: string
  to: string
}
