import { Transaction } from '../models/Transaction'

type RawTransactionRow = Omit<Transaction, 'exclude_from_estimate'> & {
  exclude_from_estimate: number
}

type RawExpenseRow = RawTransactionRow & {
  account_name: string
  category_name: string | null
}

type D1Value = string | number | null

export class TransactionRepository {
  constructor(private db: D1Database) {}

  private mapTransaction(raw: RawTransactionRow): Transaction {
    return {
      ...raw,
      exclude_from_estimate: raw.exclude_from_estimate === 1
    }
  }

  async findAll(): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findById(id: string): Promise<Transaction | null> {
    const result = await this.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<RawTransactionRow>()
    return result ? this.mapTransaction(result) : null
  }

  async create(transaction: Transaction): Promise<void> {
    await this.db.prepare(
      'INSERT INTO transactions (id, account_id, category_id, amount, description, date, linked_transaction_id, exclude_from_estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      transaction.id,
      transaction.account_id,
      transaction.category_id || null,
      transaction.amount,
      transaction.description || null,
      transaction.date,
      transaction.linked_transaction_id || null,
      transaction.exclude_from_estimate ? 1 : 0
    ).run()
  }

  async update(id: string, updates: Partial<Transaction>): Promise<void> {
    const fields: string[] = []
    const values: D1Value[] = []

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
    if (updates.exclude_from_estimate !== undefined) {
      fields.push('exclude_from_estimate = ?')
      values.push(updates.exclude_from_estimate ? 1 : 0)
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
      `SELECT * FROM transactions ORDER BY ${field} ${order}, id DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async count(): Promise<number> {
    const result = await this.db.prepare('SELECT COUNT(*) as count FROM transactions').first<{ count: number }>()
    return result?.count || 0
  }

  async findByDateRange(startDate: string, endDate: string, accountId?: string, categoryId?: string): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE date >= ? AND date <= ?'
    const params: D1Value[] = [startDate, endDate]

    if (accountId) {
      query += ' AND account_id = ?'
      params.push(accountId)
    }

    if (categoryId) {
      query += ' AND category_id = ?'
      params.push(categoryId)
    }

    query += ' ORDER BY date DESC, id DESC'

    const { results } = await this.db.prepare(query).bind(...params).all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findFromDate(startDate: string, accountId?: string, categoryId?: string): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE date >= ?'
    const params: D1Value[] = [startDate]

    if (accountId) {
      query += ' AND account_id = ?'
      params.push(accountId)
    }

    if (categoryId) {
      query += ' AND category_id = ?'
      params.push(categoryId)
    }

    query += ' ORDER BY date DESC, id DESC'

    const { results } = await this.db.prepare(query).bind(...params).all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findRecurring(): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions WHERE is_recurring = 1').all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findByAccountAndDatePattern(accountId: string, amount: number, description: string, datePattern: string): Promise<Transaction | null> {
    const result = await this.db.prepare(
      'SELECT * FROM transactions WHERE account_id = ? AND amount = ? AND description = ? AND date LIKE ?'
    ).bind(accountId, amount, description, datePattern).first<RawTransactionRow>()
    return result ? this.mapTransaction(result) : null
  }

  async findRecentExpensesFromCashAccounts(startDate: string, endDate: string): Promise<(Transaction & { account_name: string; category_name?: string })[]> {
    const query = `
      SELECT t.*, a.name as account_name, c.name as category_name
      FROM transactions t
      INNER JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE a.type = 'cash'
        AND t.amount < 0
        AND t.date >= ?
        AND t.date <= ?
      ORDER BY t.date DESC
    `
    const { results } = await this.db.prepare(query).bind(startDate, endDate).all<RawExpenseRow>()
    return results.map(r => ({
      ...this.mapTransaction(r),
      account_name: r.account_name,
      category_name: r.category_name ?? undefined
    }))
  }
}
