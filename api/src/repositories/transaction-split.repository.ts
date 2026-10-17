import { Transaction } from '../models/Transaction'
import { RawTransactionRow, TransactionRepository } from './transaction.repository'

export interface TransactionSplit {
  id: string
  description: string | null
  created_at: number
  updated_at: number | null
}

export interface SplitLineWrite {
  id: string
  category_id: string | null
  amount: number
  description: string | null
}

export interface SplitWrite {
  id: string
  account_id: string
  date: string
  description: string | null
  exclude_from_estimate: boolean
  lines: SplitLineWrite[]
  total: number
}

type D1Value = string | number | null

// Every statement of a split write carries the same account predicate, so a
// lock, archive or concurrent balance change makes the whole batch a no-op
// instead of leaving some statements applied.
function accountReady(accountId: string, expectedBalance?: number): { sql: string; values: D1Value[] } {
  return {
    sql: `EXISTS (SELECT 1 FROM accounts WHERE id = ? AND type != 'investment' AND is_locked = 0 AND archived_at IS NULL${expectedBalance === undefined ? '' : ' AND balance = ?'})`,
    values: expectedBalance === undefined ? [accountId] : [accountId, expectedBalance],
  }
}

export class TransactionSplitRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<TransactionSplit | null> {
    return await this.db.prepare('SELECT id, description, created_at, updated_at FROM transaction_splits WHERE id = ?')
      .bind(id).first<TransactionSplit>()
  }

  async findLines(splitId: string): Promise<Transaction[]> {
    const { results } = await this.db.prepare(
      `SELECT t.*, s.description AS split_description FROM transactions t
       JOIN transaction_splits s ON s.id = t.split_id WHERE t.split_id = ? ORDER BY t.rowid ASC`
    ).bind(splitId).all<RawTransactionRow>()
    return results.map(row => TransactionRepository.mapRow(row))
  }

  private insertSplit(split: SplitWrite, now: number, ready: { sql: string; values: D1Value[] }): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO transaction_splits (id, description, created_at, updated_at) SELECT ?, ?, ?, ? WHERE ${ready.sql}`
    ).bind(split.id, split.description, now, now, ...ready.values)
  }

  private insertLines(split: SplitWrite, now: number, ready: { sql: string; values: D1Value[] }, claimedSql: string, claimedValues: D1Value[]): D1PreparedStatement[] {
    return split.lines.map(line => this.db.prepare(
      `INSERT INTO transactions (id, account_id, category_id, amount, description, date, exclude_from_estimate,
         status, pending_kind, review_source, review_flags, confirmed_at, created_at, updated_at, split_id)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'posted', 'upcoming', 'manual', '[]', ?, ?, ?, ?
       WHERE ${ready.sql} AND ${claimedSql}`
    ).bind(line.id, split.account_id, line.category_id, line.amount, line.description, split.date,
      split.exclude_from_estimate ? 1 : 0, now, now, now, split.id, ...ready.values, ...claimedValues))
  }

  private audit(action: 'CREATE' | 'UPDATE' | 'DELETE', splitId: string, details: Record<string, unknown>, now: number,
    claimedSql: string, claimedValues: D1Value[]): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) SELECT ?, ?, 'transaction_split', ?, ?, ? WHERE ${claimedSql}`
    ).bind(crypto.randomUUID(), action, splitId, JSON.stringify(details), now, ...claimedValues)
  }

  /** Inserts the split, its lines and the balance change in one batch. Returns false when the account guard rejected it. */
  async create(split: SplitWrite, now: number, expectedBalance?: number): Promise<boolean> {
    const ready = accountReady(split.account_id, expectedBalance)
    const claimed = { sql: 'EXISTS (SELECT 1 FROM transaction_splits WHERE id = ? AND updated_at = ?)', values: [split.id, now] }
    const results = await this.db.batch([
      this.insertSplit(split, now, ready),
      ...this.insertLines(split, now, ready, claimed.sql, claimed.values),
      this.audit('CREATE', split.id, { account_id: split.account_id, lines: split.lines.length, total: split.total }, now, claimed.sql, claimed.values),
      this.db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND ${claimed.sql} AND ${ready.sql}`)
        .bind(split.total, now, split.account_id, ...claimed.values, ...ready.values),
    ])
    // Every statement shares one guard, so the first (trigger-free) statement tells whether the batch applied.
    return results[0].meta.changes === 1
  }

  /**
   * Replaces the lines and shared fields. Old lines are detached before the new
   * ones are inserted so the last-line cleanup trigger never removes the split
   * row mid-batch. The split's updated_at is the optimistic lock.
   */
  async replace(previous: { split: TransactionSplit; lines: Transaction[]; total: number }, next: SplitWrite, now: number, expectedBalance?: number): Promise<boolean> {
    const oldAccountId = previous.lines[0].account_id
    const ready = accountReady(next.account_id, expectedBalance)
    const oldReady = accountReady(oldAccountId, oldAccountId === next.account_id ? expectedBalance : undefined)
    const claimed = { sql: 'EXISTS (SELECT 1 FROM transaction_splits WHERE id = ? AND updated_at = ?)', values: [next.id, now] }
    const oldIds = previous.lines.map(line => line.id)
    const placeholders = oldIds.map(() => '?').join(', ')
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `UPDATE transaction_splits SET description = ?, updated_at = ?
         WHERE id = ? AND updated_at IS ? AND (SELECT COUNT(*) FROM transactions WHERE split_id = ?) = ?
         AND ${oldReady.sql} AND ${ready.sql}`
      ).bind(next.description, now, next.id, previous.split.updated_at, next.id, oldIds.length, ...oldReady.values, ...ready.values),
      this.db.prepare(
        `UPDATE accounts SET balance = balance - (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE split_id = ?), updated_at = ?
         WHERE id = ? AND ${claimed.sql}`
      ).bind(next.id, now, oldAccountId, ...claimed.values),
      this.db.prepare(`UPDATE transactions SET split_id = NULL WHERE split_id = ? AND ${claimed.sql}`).bind(next.id, ...claimed.values),
      ...this.insertLines(next, now, accountReady(next.account_id), claimed.sql, claimed.values),
      this.audit('UPDATE', next.id, { account_id: next.account_id, lines: next.lines.length, total: next.total, previous_total: previous.total }, now, claimed.sql, claimed.values),
      this.db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders}) AND split_id IS NULL AND ${claimed.sql}`).bind(...oldIds, ...claimed.values),
      this.db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND ${claimed.sql}`)
        .bind(next.total, now, next.account_id, ...claimed.values),
    ]
    const results = await this.db.batch(statements)
    return results[0].meta.changes === 1
  }

  /** Reverts the balance and deletes every line; the cleanup trigger removes the split row. */
  async remove(previous: { split: TransactionSplit; lines: Transaction[]; total: number }, now: number): Promise<boolean> {
    const accountId = previous.lines[0].account_id
    const ready = accountReady(accountId)
    const claimed = { sql: 'EXISTS (SELECT 1 FROM transaction_splits WHERE id = ? AND updated_at = ?)', values: [previous.split.id, now] }
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE transaction_splits SET updated_at = ?
         WHERE id = ? AND updated_at IS ? AND (SELECT COUNT(*) FROM transactions WHERE split_id = ?) = ? AND ${ready.sql}`
      ).bind(now, previous.split.id, previous.split.updated_at, previous.split.id, previous.lines.length, ...ready.values),
      this.db.prepare(
        `UPDATE accounts SET balance = balance - (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE split_id = ?), updated_at = ?
         WHERE id = ? AND ${claimed.sql}`
      ).bind(previous.split.id, now, accountId, ...claimed.values),
      this.audit('DELETE', previous.split.id, { account_id: accountId, lines: previous.lines.length, total: previous.total }, now, claimed.sql, claimed.values),
      this.db.prepare(`DELETE FROM transactions WHERE split_id = ? AND ${claimed.sql}`).bind(previous.split.id, ...claimed.values),
    ])
    return results[0].meta.changes === 1
  }
}
