import { InvestmentTransaction } from '../models/InvestmentTransaction'
import { InvestmentTransactionResponseDto } from '../dtos/investment-transaction.dto'
import { tradeCoverage } from '../../../shared/investment-trade'

export class InvestmentTransactionMapper {
  static toResponseDto(transaction: InvestmentTransaction): InvestmentTransactionResponseDto {
    return {
      coverage:tradeCoverage(transaction),
      asset_event:transaction.asset_event ?? null,
      trade_version:transaction.trade_version ?? 0,
      execution_currency: transaction.execution_currency ?? null, gross_amount: transaction.gross_amount ?? null,
      fee_amount: transaction.fee_amount ?? null, fee_currency: transaction.fee_currency ?? null, fee_status: transaction.fee_status ?? null,
      cash_amount: transaction.cash_amount ?? null, cash_currency: transaction.cash_currency ?? null, effective_order: transaction.effective_order ?? null,
      id: transaction.id,
      account_id: transaction.account_id,
      type: transaction.type,
      quantity: transaction.quantity,
      price: transaction.price,
      total_amount: transaction.total_amount,
      date: transaction.date,
      notes: transaction.notes,
      linked_transaction_id: transaction.linked_transaction_id ?? null,
      created_at: transaction.created_at
    }
  }
}
