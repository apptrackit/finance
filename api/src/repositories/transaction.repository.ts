import {
  Transaction,
  TransactionPendingKind,
  TransactionReviewSource,
  TransactionStatus,
} from '../models/Transaction'

type RawTransactionRow = Omit<Transaction, 'exclude_from_estimate' | 'pending_kind' | 'review_source' | 'review_flags'> & {
  exclude_from_estimate: number
  status?: TransactionStatus | null
  pending_kind?: TransactionPendingKind | null
  review_source?: TransactionReviewSource | null
  review_flags?: string | null
}

type D1Value = string | number | null

export class TransactionRepository {
  constructor(private db: D1Database) {}

  private parseReviewFlags(value?: string | null): string[] {
    if (!value) return []

    try {
      const parsed: unknown = JSON.parse(value)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((flag): flag is string => typeof flag === 'string')
    } catch {
      return []
    }
  }

  private mapTransaction(raw: RawTransactionRow): Transaction {
    return {
      ...raw,
      exclude_from_estimate: raw.exclude_from_estimate === 1,
      status: raw.status || 'posted',
      pending_kind: raw.pending_kind || 'upcoming',
      review_source: raw.review_source || 'manual',
      review_flags: this.parseReviewFlags(raw.review_flags),
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
      'INSERT INTO transactions (id, account_id, category_id, amount, description, date, linked_transaction_id, exclude_from_estimate, status, pending_kind, review_source, review_batch_id, review_flags, confirmed_at, cancelled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
      transaction.pending_kind || 'upcoming',
      transaction.review_source || 'manual',
      transaction.review_batch_id ?? null,
      JSON.stringify(transaction.review_flags || []),
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
    if (updates.pending_kind !== undefined) {
      fields.push('pending_kind = ?')
      values.push(updates.pending_kind)
    }
    if (updates.review_source !== undefined) {
      fields.push('review_source = ?')
      values.push(updates.review_source)
    }
    if (updates.review_batch_id !== undefined) {
      fields.push('review_batch_id = ?')
      values.push(updates.review_batch_id)
    }
    if (updates.review_flags !== undefined) {
      fields.push('review_flags = ?')
      values.push(JSON.stringify(updates.review_flags))
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

  async deleteInvestmentTransferAndRevertBalances(id: string, investmentId: string, now: number): Promise<void> {
    // Read deltas from rows still present inside the batch. Concurrent/repeated
    // deletion cannot apply a stale balance delta, and a failed statement rolls
    // back both balances and both ledger records.
    await this.db.batch([
      this.db.prepare(`UPDATE accounts SET
        balance = balance - (SELECT amount FROM transactions WHERE id = ?), updated_at = ?
        WHERE id = (SELECT account_id FROM transactions WHERE id = ? AND linked_transaction_id = ? AND status = 'posted')`
      ).bind(id, now, id, investmentId),
      this.db.prepare(`UPDATE accounts SET balance = balance - (
          SELECT CASE WHEN type = 'buy' THEN quantity ELSE -quantity END
          FROM investment_transactions WHERE id = ?
        ), updated_at = ?
        WHERE id = (SELECT account_id FROM investment_transactions WHERE id = ?)
        AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND linked_transaction_id = ?)`
      ).bind(investmentId, now, investmentId, id, investmentId),
      this.db.prepare(`DELETE FROM investment_transactions WHERE id = ?
        AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND linked_transaction_id = ?)`
      ).bind(investmentId, id, investmentId),
      this.db.prepare('DELETE FROM transactions WHERE id = ? AND linked_transaction_id = ?').bind(id, investmentId),
    ])
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

  async resolvePendingTransferPair(outgoing: Transaction, incoming: Transaction, action: 'confirm' | 'decline', now: number, today: string): Promise<boolean> {
    const token = `resolving:${crypto.randomUUID()}`
    const validPair = `SELECT COUNT(*) FROM transactions debit JOIN transactions credit ON credit.id = debit.linked_transaction_id
      JOIN accounts source ON source.id = debit.account_id JOIN accounts destination ON destination.id = credit.account_id
      WHERE debit.id = ? AND credit.id = ? AND credit.linked_transaction_id = debit.id
      AND debit.status = 'pending' AND credit.status = 'pending'
      AND debit.pending_kind = 'mcp_review' AND credit.pending_kind = 'mcp_review'
      AND debit.review_source = 'chatgpt_mcp' AND credit.review_source = 'chatgpt_mcp'
      AND debit.review_batch_id = credit.review_batch_id AND debit.review_batch_id IS NOT NULL
      AND debit.account_id != credit.account_id
      AND debit.amount < 0 AND credit.amount > 0 AND debit.amount + credit.amount = 0
      AND debit.date = credit.date AND source.type IN ('cash', 'checking', 'savings') AND destination.type IN ('cash', 'checking', 'savings')
      AND source.currency = destination.currency AND source.is_locked = 0 AND destination.is_locked = 0
      ${action === 'confirm' ? 'AND debit.date <= ?' : ''}`
    const guard = action === 'confirm' ? [outgoing.id, incoming.id, today] : [outgoing.id, incoming.id]
    const status = action === 'confirm' ? 'posted' : 'cancelled'
    const statements: D1PreparedStatement[] = [this.db.prepare(
      `UPDATE transactions SET status = ?, updated_at = ?
       WHERE id IN (?, ?) AND 1 = (${validPair})`
    ).bind(token, now, outgoing.id, incoming.id, ...guard)]
    if (action === 'confirm') {
      for (const tx of [outgoing, incoming]) {
        statements.push(this.db.prepare(
          'UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND 2 = (SELECT COUNT(*) FROM transactions WHERE id IN (?, ?) AND status = ?)'
        ).bind(tx.amount, now, tx.account_id, outgoing.id, incoming.id, token))
      }
    }
    for (const tx of [outgoing, incoming]) {
      statements.push(this.db.prepare(
        "INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) SELECT ?, 'UPDATE', 'transaction', id, ?, ? FROM transactions WHERE id = ? AND status = ?"
      ).bind(crypto.randomUUID(), JSON.stringify({ status, transfer_pair_id: outgoing.id }), now, tx.id, token))
    }
    statements.push(this.db.prepare(
      'UPDATE transactions SET status = ?, confirmed_at = ?, cancelled_at = ?, updated_at = ? WHERE id IN (?, ?) AND status = ?'
    ).bind(status, action === 'confirm' ? now : null, action === 'decline' ? now : null, now, outgoing.id, incoming.id, token))
    const results = await this.db.batch(statements)
    return results[0].meta.changes === 2 && results.at(-1)?.meta.changes === 2
      && results.slice(1, -1).every(result => result.meta.changes === 1)
  }

}
