import { Transaction } from '../models/Transaction'

export class TransactionRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions ORDER BY date DESC').all<Transaction>()
    return results
  }

  async findById(id: string): Promise<Transaction | null> {
    return await this.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<Transaction>()
  }

  async findRecurring(): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions WHERE is_recurring = 1').all<Transaction>()
    return results
  }

  async findByAccountAndDatePattern(accountId: string, amount: number, description: string | undefined, datePattern: string): Promise<Transaction | null> {
    return await this.db.prepare(
      'SELECT id FROM transactions WHERE account_id = ? AND amount = ? AND description = ? AND date LIKE ?'
    ).bind(accountId, amount, description, datePattern).first<Transaction>()
  }

  async create(transaction: Transaction): Promise<void> {
    await this.db.prepare(
      'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring, linked_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      transaction.id,
      transaction.account_id,
      transaction.category_id || null,
      transaction.amount,
      transaction.description || null,
      transaction.date,
      transaction.is_recurring ? 1 : 0,
      transaction.linked_transaction_id || null
    ).run()
  }

  async update(id: string, updates: Partial<Transaction>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.account_id !== undefined) {
      fields.push('account_id = ?')
      values.push(updates.account_id)
    }
    if (updates.category_id !== undefined) {
      fields.push('category_id = ?')
      values.push(updates.category_id)
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?')
      values.push(updates.amount)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    if (updates.date !== undefined) {
      fields.push('date = ?')
      values.push(updates.date)
    }
    if (updates.is_recurring !== undefined) {
      fields.push('is_recurring = ?')
      values.push(updates.is_recurring ? 1 : 0)
    }

    values.push(id)

    await this.db.prepare(
      `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
  }

  async deleteByAccountId(accountId: string): Promise<void> {
    await this.db.prepare('DELETE FROM transactions WHERE account_id = ?').bind(accountId).run()
  }
}
