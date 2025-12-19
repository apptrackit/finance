import { InvestmentTransaction } from '../models/InvestmentTransaction'

export class InvestmentTransactionRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<InvestmentTransaction[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM investment_transactions ORDER BY date DESC'
    ).all<InvestmentTransaction>()
    return results
  }

  async findByAccountId(accountId: string): Promise<InvestmentTransaction[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM investment_transactions WHERE account_id = ? ORDER BY date DESC'
    ).bind(accountId).all<InvestmentTransaction>()
    return results
  }

  async findById(id: string): Promise<InvestmentTransaction | null> {
    return await this.db.prepare('SELECT * FROM investment_transactions WHERE id = ?')
      .bind(id).first<InvestmentTransaction>()
  }

  async create(transaction: InvestmentTransaction): Promise<void> {
    await this.db.prepare(
      'INSERT INTO investment_transactions (id, account_id, type, quantity, price, total_amount, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      transaction.id,
      transaction.account_id,
      transaction.type,
      transaction.quantity,
      transaction.price,
      transaction.total_amount,
      transaction.date,
      transaction.notes || null,
      transaction.created_at
    ).run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM investment_transactions WHERE id = ?').bind(id).run()
  }
}
