import { InvestmentTransaction } from '../models/InvestmentTransaction'
import { InvestmentTransferRepository } from './investment-transfer.repository'
import { InvestmentTradeRepository } from './investment-trade.repository'

export class InvestmentTransactionRepository {
  readonly transfers: InvestmentTransferRepository
  readonly trades: InvestmentTradeRepository

  constructor(private db: D1Database) {
    this.transfers = new InvestmentTransferRepository(db)
    this.trades = new InvestmentTradeRepository(db)
  }

  async findAll(): Promise<InvestmentTransaction[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM investment_transactions ORDER BY date DESC, effective_order DESC, id DESC'
    ).all<InvestmentTransaction>()
    return results
  }

  async findByAccountId(accountId: string): Promise<InvestmentTransaction[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM investment_transactions WHERE account_id = ? ORDER BY date DESC, effective_order DESC, id DESC'
    ).bind(accountId).all<InvestmentTransaction>()
    return results
  }

  async findById(id: string): Promise<InvestmentTransaction | null> {
    return await this.db.prepare('SELECT * FROM investment_transactions WHERE id = ?')
      .bind(id).first<InvestmentTransaction>()
  }

  async findByCashTransactionId(id: string): Promise<InvestmentTransaction | null> {
    return this.db.prepare('SELECT * FROM investment_transactions WHERE linked_transaction_id = ?')
      .bind(id).first<InvestmentTransaction>()
  }

}
