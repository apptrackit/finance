import type { Transaction } from '../models/Transaction'
import { TransactionRepository, type RawTransactionRow } from './transaction.repository'

// Read-only compatibility lookup. All pair writes use InvestmentTradeRepository.
export class InvestmentTransferRepository {
  constructor(private db: D1Database) {}

  async findCashLinks(investmentId: string): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions WHERE linked_transaction_id = ?')
      .bind(investmentId).all<RawTransactionRow>()
    return results.map(row => TransactionRepository.mapRow(row))
  }

}
