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
      is_recurring: transaction.is_recurring,
      linked_transaction_id: transaction.linked_transaction_id
    }
  }
}
