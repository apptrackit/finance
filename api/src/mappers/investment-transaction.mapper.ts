import { InvestmentTransaction } from '../models/InvestmentTransaction'
import { InvestmentTransactionResponseDto } from '../dtos/investment-transaction.dto'

export class InvestmentTransactionMapper {
  static toResponseDto(transaction: InvestmentTransaction): InvestmentTransactionResponseDto {
    return {
      id: transaction.id,
      account_id: transaction.account_id,
      type: transaction.type,
      quantity: transaction.quantity,
      price: transaction.price,
      total_amount: transaction.total_amount,
      date: transaction.date,
      notes: transaction.notes,
      created_at: transaction.created_at
    }
  }
}
