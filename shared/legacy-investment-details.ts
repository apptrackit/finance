import type { TradeFacts } from './investment-trade'
export type LegacyDetailsInput = {
  expected_version: number
  execution_currency: string
  cash_currency: string
  cash_amount: number
  fee_status: 'known' | 'unknown'
  fee_amount?: number | null
}
export type LegacyDetails = {
  trade: TradeFacts & {
    id: string
    account_id: string
    type: 'buy' | 'sell'
    date: string
    quantity: number
    price: number
    total_amount: number
  }
  account: {
    name: string
    currency: string
    is_locked: boolean
    archived_at: number | null
  }
}
