import { CashLedgerRepository } from './cash-ledger.repository'
import { AccountRepository } from './account.repository'
import { AppError } from '../errors/codes'
import {
  Transaction,
  TransactionPendingKind,
  TransactionReviewSource,
  TransactionStatus,
} from '../models/Transaction'

export type RawTransactionRow = Omit<Transaction, 'exclude_from_estimate' | 'pending_kind' | 'review_source' | 'review_flags'> & {
  exclude_from_estimate: number
  status?: TransactionStatus | null
  pending_kind?: TransactionPendingKind | null
  review_source?: TransactionReviewSource | null
  review_flags?: string | null
}

type D1Value = string | number | null

export class TransactionRepository {
  readonly cashLedger: CashLedgerRepository
  constructor(private db: D1Database) {
    this.cashLedger = new CashLedgerRepository(db)
  }

  private static parseReviewFlags(value?: string | null): string[] {
    if (!value) return []

    try {
      const parsed: unknown = JSON.parse(value)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((flag): flag is string => typeof flag === 'string')
    } catch {
      return []
    }
  }

  static mapRow(raw: RawTransactionRow): Transaction {
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
    return results.map(r => TransactionRepository.mapRow(r))
  }

  async findById(id: string): Promise<Transaction | null> {
    const result = await this.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<RawTransactionRow>()
    return result ? TransactionRepository.mapRow(result) : null
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
    return results.map(r => TransactionRepository.mapRow(r))
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
    return results.map(r => TransactionRepository.mapRow(r))
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
    return results.map(r => TransactionRepository.mapRow(r))
  }

  async findRecurring(): Promise<Transaction[]> {
    const { results } = await this.db.prepare("SELECT * FROM transactions WHERE status = 'posted' AND is_recurring = 1").all<RawTransactionRow>()
    return results.map(r => TransactionRepository.mapRow(r))
  }

  async findByAccountAndDatePattern(accountId: string, amount: number, description: string, datePattern: string): Promise<Transaction | null> {
    const result = await this.db.prepare(
      "SELECT * FROM transactions WHERE status = 'posted' AND account_id = ? AND amount = ? AND description = ? AND date LIKE ?"
    ).bind(accountId, amount, description, datePattern).first<RawTransactionRow>()
    return result ? TransactionRepository.mapRow(result) : null
  }

  async findUpcoming(): Promise<Transaction[]> {
    const { results } = await this.db.prepare(
      "SELECT * FROM transactions WHERE status = 'pending' ORDER BY date ASC, rowid DESC"
    ).all<RawTransactionRow>()
    return results.map(r => TransactionRepository.mapRow(r))
  }

  async confirmPendingAndApplyBalance(transaction: Transaction, now: number, today: string): Promise<boolean> {
    if (transaction.status !== 'pending' || transaction.linked_transaction_id || transaction.date > today) return false
    const account = await new AccountRepository(this.db).findById(transaction.account_id)
    if (!account || account.type === 'investment') return false
    try {
      await this.cashLedger.commit({ before:[transaction], after:[{...transaction,status:'posted',confirmed_at:now,cancelled_at:null,updated_at:now}], accounts:[account], now })
      return true
    } catch(error) {
      if (error instanceof AppError && error.code === 'HISTORY_CHANGED') return false
      throw error
    }
  }

  async resolvePendingTransferPair(outgoing: Transaction, incoming: Transaction, action: 'confirm' | 'decline', now: number, today: string): Promise<boolean> {
    if (outgoing.id === incoming.id || outgoing.linked_transaction_id !== incoming.id || incoming.linked_transaction_id !== outgoing.id
      || outgoing.status !== 'pending' || incoming.status !== 'pending' || outgoing.pending_kind !== 'mcp_review' || incoming.pending_kind !== 'mcp_review'
      || outgoing.review_source !== 'chatgpt_mcp' || incoming.review_source !== 'chatgpt_mcp' || !outgoing.review_batch_id || outgoing.review_batch_id !== incoming.review_batch_id
      || outgoing.account_id === incoming.account_id || outgoing.amount >= 0 || incoming.amount <= 0 || outgoing.date !== incoming.date
      || (action === 'confirm' && outgoing.date > today)) return false
    const repo = new AccountRepository(this.db)
    const source = await repo.findById(outgoing.account_id), destination = await repo.findById(incoming.account_id)
    if (!source || !destination || !['cash','checking','savings'].includes(source.type) || !['cash','checking','savings'].includes(destination.type)
      || (source.currency.toUpperCase() === destination.currency.toUpperCase() && -outgoing.amount !== incoming.amount)) return false
    const status = action === 'confirm' ? 'posted' : 'cancelled'
    try {
      await this.cashLedger.commit({ before:[outgoing,incoming], after:[outgoing,incoming].map(t => ({...t,status,confirmed_at:action==='confirm'?now:null,cancelled_at:action==='decline'?now:null,updated_at:now})),
        accounts:[source,destination], now, transfer_pair_id:outgoing.id })
      return true
    } catch(error) {
      if (error instanceof AppError && error.code === 'HISTORY_CHANGED') return false
      throw error
    }
  }

  async updatePendingTransferReviewPair(
    outgoing: Transaction,
    incoming: Transaction,
    next: { fromAccountId: string; toAccountId: string; amountFrom: number; amountTo: number; date: string; description: string | null },
    now: number,
  ): Promise<boolean> {
    const token = `editing:${crypto.randomUUID()}`
    const validPair = `SELECT COUNT(*) FROM transactions debit JOIN transactions credit ON credit.id = debit.linked_transaction_id
      JOIN accounts source ON source.id = debit.account_id JOIN accounts destination ON destination.id = credit.account_id
      JOIN accounts new_source ON new_source.id = ? JOIN accounts new_destination ON new_destination.id = ?
      WHERE debit.id = ? AND credit.id = ? AND credit.linked_transaction_id = debit.id
      AND debit.status = 'pending' AND credit.status = 'pending'
      AND debit.pending_kind = 'mcp_review' AND credit.pending_kind = 'mcp_review'
      AND debit.review_source = 'chatgpt_mcp' AND credit.review_source = 'chatgpt_mcp'
      AND debit.review_batch_id = credit.review_batch_id AND debit.review_batch_id IS NOT NULL
      AND debit.review_batch_id = ?
      AND debit.account_id = ? AND credit.account_id = ? AND debit.amount = ? AND credit.amount = ?
      AND debit.date = ? AND credit.date = debit.date
      AND debit.description IS ? AND credit.description IS ?
      AND debit.updated_at IS ? AND credit.updated_at IS ?
      AND source.type IN ('cash', 'checking', 'savings') AND destination.type IN ('cash', 'checking', 'savings')
      AND new_source.type IN ('cash', 'checking', 'savings') AND new_destination.type IN ('cash', 'checking', 'savings')
      AND source.is_locked = 0 AND destination.is_locked = 0 AND new_source.is_locked = 0 AND new_destination.is_locked = 0
      AND new_source.id != new_destination.id AND ? > 0 AND ? > 0
      AND (UPPER(new_source.currency) != UPPER(new_destination.currency) OR ? = ?)`
    const claim = this.db.prepare(`UPDATE transactions SET status = ?,
      account_id = CASE id WHEN ? THEN ? ELSE ? END,
      amount = CASE id WHEN ? THEN ? ELSE ? END,
      description = ?, date = ?, updated_at = ?
      WHERE id IN (?, ?) AND 1 = (${validPair})`).bind(
      token,
      outgoing.id, next.fromAccountId, next.toAccountId,
      outgoing.id, -next.amountFrom, next.amountTo,
      next.description, next.date, now,
      outgoing.id, incoming.id,
      next.fromAccountId, next.toAccountId,
      outgoing.id, incoming.id,
      outgoing.review_batch_id ?? null,
      outgoing.account_id, incoming.account_id, outgoing.amount, incoming.amount,
      outgoing.date, outgoing.description ?? null, incoming.description ?? null,
      outgoing.updated_at ?? null, incoming.updated_at ?? null,
      next.amountFrom, next.amountTo, next.amountFrom, next.amountTo,
    )
    const statements: D1PreparedStatement[] = [claim]
    for (const tx of [outgoing, incoming]) {
      statements.push(this.db.prepare(
        "INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) SELECT ?, 'UPDATE', 'transaction', id, ?, ? FROM transactions WHERE id = ? AND status = ?"
      ).bind(crypto.randomUUID(), JSON.stringify({ origin: 'chatgpt_mcp', transfer_pair_id: outgoing.id, change: 'review_edit' }), now, tx.id, token))
    }
    statements.push(this.db.prepare('UPDATE transactions SET status = ? WHERE id IN (?, ?) AND status = ?')
      .bind('pending', outgoing.id, incoming.id, token))
    const results = await this.db.batch(statements)
    return results[0].meta.changes === 2 && results[1].meta.changes === 1
      && results[2].meta.changes === 1 && results[3].meta.changes === 2
  }

}
