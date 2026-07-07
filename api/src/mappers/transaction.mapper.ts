import { Transaction } from '../models/Transaction'
import { TransactionResponseDto } from '../dtos/transaction.dto'

export class TransactionMapper {
  static toResponseDto(transaction: Transaction): TransactionResponseDto {
    return {
      id: transaction.id,
      account_id: transaction.account_id,
      category_id: transaction.category_id,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date,
      price: transaction.price,
      linked_transaction_id: transaction.linked_transaction_id,
      exclude_from_estimate: transaction.exclude_from_estimate,
      is_recurring: transaction.is_recurring,
      status: transaction.status || 'posted',
      confirmed_at: transaction.confirmed_at,
      cancelled_at: transaction.cancelled_at,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at
    }
  }
}
