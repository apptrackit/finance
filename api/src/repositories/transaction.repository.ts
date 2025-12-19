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

  async findPaginated(offset: number, limit: number, sortBy: string = 'date', sortOrder: string = 'desc'): Promise<Transaction[]> {
    const allowedSortFields = ['date', 'amount', 'description']
    const field = allowedSortFields.includes(sortBy) ? sortBy : 'date'
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    
    const { results } = await this.db.prepare(
      `SELECT * FROM transactions ORDER BY ${field} ${order} LIMIT ? OFFSET ?`
    ).bind(limit, offset).all<Transaction>()
    return results
  }

  async count(): Promise<number> {
    const result = await this.db.prepare('SELECT COUNT(*) as count FROM transactions').first<{ count: number }>()
    return result?.count || 0
  }

  async findByDateRange(startDate: string, endDate: string, accountId?: string, categoryId?: string): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE date >= ? AND date <= ?'
    const params: any[] = [startDate, endDate]

    if (accountId) {
      query += ' AND account_id = ?'
      params.push(accountId)
    }

    if (categoryId) {
      query += ' AND category_id = ?'
      params.push(categoryId)
    }

    query += ' ORDER BY date DESC'

    const { results } = await this.db.prepare(query).bind(...params).all<Transaction>()
    return results
  }

  async findFromDate(startDate: string, accountId?: string, categoryId?: string): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE date >= ?'
    const params: any[] = [startDate]

    if (accountId) {
      query += ' AND account_id = ?'
      params.push(accountId)
    }

    if (categoryId) {
      query += ' AND category_id = ?'
      params.push(categoryId)
    }

    query += ' ORDER BY date DESC'

    const { results } = await this.db.prepare(query).bind(...params).all<Transaction>()
    return results
  }
}
