import { Transaction, TransactionStatus } from '../models/Transaction'

type RawTransactionRow = Omit<Transaction, 'exclude_from_estimate'> & {
  exclude_from_estimate: number
  status?: TransactionStatus | null
}

type D1Value = string | number | null

export class TransactionRepository {
  constructor(private db: D1Database) {}

  private mapTransaction(raw: RawTransactionRow): Transaction {
    return {
      ...raw,
      exclude_from_estimate: raw.exclude_from_estimate === 1,
      status: raw.status || 'posted'
    }
  }

  async findAll(): Promise<Transaction[]> {
    const { results } = await this.db.prepare("SELECT * FROM transactions WHERE status = 'posted' ORDER BY date DESC, rowid DESC").all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findById(id: string): Promise<Transaction | null> {
    const result = await this.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<RawTransactionRow>()
    return result ? this.mapTransaction(result) : null
  }

  async create(transaction: Transaction): Promise<void> {
    await this.db.prepare(
      'INSERT INTO transactions (id, account_id, category_id, amount, description, date, linked_transaction_id, exclude_from_estimate, status, confirmed_at, cancelled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      transaction.id,
      transaction.account_id,
      transaction.category_id || null,
      transaction.amount,
      transaction.description || null,
      transaction.date,
      transaction.linked_transaction_id || null,
      transaction.exclude_from_estimate ? 1 : 0,
      transaction.status || 'posted',
      transaction.confirmed_at ?? null,
      transaction.cancelled_at ?? null,
      transaction.created_at ?? Date.now(),
      transaction.updated_at ?? Date.now()
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
    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    if (updates.confirmed_at !== undefined) {
      fields.push('confirmed_at = ?')
      values.push(updates.confirmed_at)
    }
    if (updates.cancelled_at !== undefined) {
      fields.push('cancelled_at = ?')
      values.push(updates.cancelled_at)
    }
    if (updates.created_at !== undefined) {
      fields.push('created_at = ?')
      values.push(updates.created_at)
    }
    if (updates.updated_at !== undefined) {
      fields.push('updated_at = ?')
      values.push(updates.updated_at)
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
      `SELECT * FROM transactions WHERE status = 'posted' ORDER BY ${field} ${order}, rowid DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async count(): Promise<number> {
    const result = await this.db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status = 'posted'").first<{ count: number }>()
    return result?.count || 0
  }

  async findByDateRange(startDate: string, endDate: string, accountId?: string, categoryId?: string): Promise<Transaction[]> {
    let query = "SELECT * FROM transactions WHERE status = 'posted' AND date >= ? AND date <= ?"
    const params: D1Value[] = [startDate, endDate]

    if (accountId) {
      query += ' AND account_id = ?'
      params.push(accountId)
    }

    if (categoryId) {
      query += ' AND category_id = ?'
      params.push(categoryId)
    }

    query += ' ORDER BY date DESC, rowid DESC'

    const { results } = await this.db.prepare(query).bind(...params).all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findFromDate(startDate: string, accountId?: string, categoryId?: string): Promise<Transaction[]> {
    let query = "SELECT * FROM transactions WHERE status = 'posted' AND date >= ?"
    const params: D1Value[] = [startDate]

    if (accountId) {
      query += ' AND account_id = ?'
      params.push(accountId)
    }

    if (categoryId) {
      query += ' AND category_id = ?'
      params.push(categoryId)
    }

    query += ' ORDER BY date DESC, rowid DESC'

    const { results } = await this.db.prepare(query).bind(...params).all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findRecurring(): Promise<Transaction[]> {
    const { results } = await this.db.prepare("SELECT * FROM transactions WHERE status = 'posted' AND is_recurring = 1").all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async findByAccountAndDatePattern(accountId: string, amount: number, description: string, datePattern: string): Promise<Transaction | null> {
    const result = await this.db.prepare(
      "SELECT * FROM transactions WHERE status = 'posted' AND account_id = ? AND amount = ? AND description = ? AND date LIKE ?"
    ).bind(accountId, amount, description, datePattern).first<RawTransactionRow>()
    return result ? this.mapTransaction(result) : null
  }

  async findUpcoming(): Promise<Transaction[]> {
    const { results } = await this.db.prepare(
      "SELECT * FROM transactions WHERE status = 'pending' ORDER BY date ASC, rowid DESC"
    ).all<RawTransactionRow>()
    return results.map(r => this.mapTransaction(r))
  }

  async confirmPendingAndApplyBalance(transaction: Transaction, now: number, today: string): Promise<boolean> {
    const confirmationToken = `confirming:${crypto.randomUUID()}`

    const [claimResult, balanceResult, postResult, cleanupResult] = await this.db.batch([
      this.db.prepare(
        "UPDATE transactions SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND linked_transaction_id IS NULL AND date <= ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ?)"
      ).bind(confirmationToken, now, transaction.id, today, transaction.account_id),
      this.db.prepare(
        'UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND status = ?)'
      ).bind(transaction.amount, now, transaction.account_id, transaction.id, confirmationToken),
      this.db.prepare(
        "UPDATE transactions SET status = 'posted', confirmed_at = ?, cancelled_at = NULL, updated_at = ? WHERE id = ? AND status = ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND updated_at = ?)"
      ).bind(now, now, transaction.id, confirmationToken, transaction.account_id, now),
      this.db.prepare(
        "UPDATE transactions SET status = 'pending', updated_at = ? WHERE id = ? AND status = ? AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = ? AND updated_at = ?)"
      ).bind(now, transaction.id, confirmationToken, transaction.account_id, now),
    ])

    return claimResult.meta.changes === 1
      && balanceResult.meta.changes === 1
      && postResult.meta.changes === 1
      && cleanupResult.meta.changes === 0
  }

}
