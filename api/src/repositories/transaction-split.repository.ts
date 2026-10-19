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

/** Review provenance kept by a pending split: its lines stay pending and never touch the balance. */
export interface PendingSplitReview {
  pending_kind: 'upcoming' | 'mcp_review'
  review_source: 'manual' | 'chatgpt_mcp'
  review_batch_id: string | null
  review_flags: string[]
}

export interface SplitWrite {
  id: string
  account_id: string
  date: string
  description: string | null
  exclude_from_estimate: boolean
  lines: SplitLineWrite[]
  total: number
  pending?: PendingSplitReview
}

type LoadedSplit = { split: TransactionSplit; lines: Transaction[]; total: number }

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

  async findTransaction(id: string): Promise<Transaction | null> {
    const row = await this.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<RawTransactionRow>()
    return row ? TransactionRepository.mapRow(row) : null
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
    // A single remaining line is an ordinary transaction, not a split.
    const splitId = split.lines.length > 1 ? split.id : null
    const pending = split.pending
    return split.lines.map(line => this.db.prepare(
      `INSERT INTO transactions (id, account_id, category_id, amount, description, date, exclude_from_estimate,
         status, pending_kind, review_source, review_batch_id, review_flags, confirmed_at, created_at, updated_at, split_id)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${ready.sql} AND ${claimedSql}`
    ).bind(line.id, split.account_id, line.category_id, line.amount, line.description, split.date,
      split.exclude_from_estimate ? 1 : 0, pending ? 'pending' : 'posted', pending?.pending_kind ?? 'upcoming',
      pending?.review_source ?? 'manual', pending?.review_batch_id ?? null, JSON.stringify(pending?.review_flags ?? []),
      pending ? null : now, now, now, splitId, ...ready.values, ...claimedValues))
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
  async replace(previous: LoadedSplit, next: SplitWrite, now: number, expectedBalance?: number): Promise<boolean> {
    const oldAccountId = previous.lines[0].account_id
    const ready = accountReady(next.account_id, expectedBalance)
    const oldReady = accountReady(oldAccountId, oldAccountId === next.account_id ? expectedBalance : undefined)
    const claimed = { sql: 'EXISTS (SELECT 1 FROM transaction_splits WHERE id = ? AND updated_at = ?)', values: [next.id, now] }
    const oldIds = previous.lines.map(line => line.id)
    const placeholders = oldIds.map(() => '?').join(', ')
    const status = next.pending ? 'pending' : 'posted'
    // A pending split never touched the balance, so replacing it changes no balance either.
    const balanced = !next.pending
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `UPDATE transaction_splits SET description = ?, updated_at = ?
         WHERE id = ? AND updated_at IS ? AND (SELECT COUNT(*) FROM transactions WHERE split_id = ? AND status = ?) = ?
         AND ${oldReady.sql} AND ${ready.sql}`
      ).bind(next.description, now, next.id, previous.split.updated_at, next.id, status, oldIds.length, ...oldReady.values, ...ready.values),
      ...(balanced ? [this.db.prepare(
        `UPDATE accounts SET balance = balance - (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE split_id = ?), updated_at = ?
         WHERE id = ? AND ${claimed.sql}`
      ).bind(next.id, now, oldAccountId, ...claimed.values)] : []),
      this.db.prepare(`UPDATE transactions SET split_id = NULL WHERE split_id = ? AND ${claimed.sql}`).bind(next.id, ...claimed.values),
      ...this.insertLines(next, now, accountReady(next.account_id), claimed.sql, claimed.values),
      this.audit('UPDATE', next.id, { account_id: next.account_id, lines: next.lines.length, total: next.total, previous_total: previous.total, status }, now, claimed.sql, claimed.values),
      this.db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders}) AND split_id IS NULL AND ${claimed.sql}`).bind(...oldIds, ...claimed.values),
      ...(balanced ? [this.db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND ${claimed.sql}`)
        .bind(next.total, now, next.account_id, ...claimed.values)] : []),
      // Last, because it removes the claim row: an undone split leaves no split-linked lines.
      this.db.prepare('DELETE FROM transaction_splits WHERE id = ? AND NOT EXISTS (SELECT 1 FROM transactions WHERE split_id = ?)')
        .bind(next.id, next.id),
    ]
    const results = await this.db.batch(statements)
    return results[0].meta.changes === 1
  }

  /** Reverts the balance and deletes every line; the cleanup trigger removes the split row. */
  async remove(previous: LoadedSplit, now: number): Promise<boolean> {
    const accountId = previous.lines[0].account_id
    const status = previous.lines[0].status ?? 'posted'
    const ready = accountReady(accountId)
    const claimed = { sql: 'EXISTS (SELECT 1 FROM transaction_splits WHERE id = ? AND updated_at = ?)', values: [previous.split.id, now] }
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE transaction_splits SET updated_at = ?
         WHERE id = ? AND updated_at IS ? AND (SELECT COUNT(*) FROM transactions WHERE split_id = ? AND status = ?) = ? AND ${ready.sql}`
      ).bind(now, previous.split.id, previous.split.updated_at, previous.split.id, status, previous.lines.length, ...ready.values),
      // Only posted lines are in the balance; deleting a pending split changes none.
      ...(status === 'posted' ? [this.db.prepare(
        `UPDATE accounts SET balance = balance - (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE split_id = ?), updated_at = ?
         WHERE id = ? AND ${claimed.sql}`
      ).bind(previous.split.id, now, accountId, ...claimed.values)] : []),
      this.audit('DELETE', previous.split.id, { account_id: accountId, lines: previous.lines.length, total: previous.total }, now, claimed.sql, claimed.values),
      this.db.prepare(`DELETE FROM transactions WHERE split_id = ? AND ${claimed.sql}`).bind(previous.split.id, ...claimed.values),
    ])
    return results[0].meta.changes === 1
  }

  /**
   * Confirms (posts every line and applies the total once) or declines (cancels
   * every line, no balance change) a pending split. The split's updated_at,
   * the pending line count and their total guard against concurrent changes.
   */
  async resolve(previous: LoadedSplit, action: 'confirm' | 'decline', now: number, today: string): Promise<boolean> {
    const accountId = previous.lines[0].account_id
    const ready = accountReady(accountId)
    const id = previous.split.id
    const claimed = { sql: 'EXISTS (SELECT 1 FROM transaction_splits WHERE id = ? AND updated_at = ?)', values: [id, now] }
    const status = action === 'confirm' ? 'posted' : 'cancelled'
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE transaction_splits SET updated_at = ?
         WHERE id = ? AND updated_at IS ?
         AND (SELECT COUNT(*) FROM transactions WHERE split_id = ?) = ?
         AND (SELECT COUNT(*) FROM transactions WHERE split_id = ? AND status = 'pending' AND account_id = ? AND date = ?${action === 'confirm' ? ' AND date <= ?' : ''}) = ?
         AND ABS((SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE split_id = ?) - ?) < 0.000000001
         AND ${ready.sql}`
      ).bind(now, id, previous.split.updated_at, id, previous.lines.length, id, accountId, previous.lines[0].date,
        ...(action === 'confirm' ? [today] : []), previous.lines.length, id, previous.total, ...ready.values),
      ...(action === 'confirm' ? [this.db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND ${claimed.sql}`)
        .bind(previous.total, now, accountId, ...claimed.values)] : []),
      this.audit('UPDATE', id, { account_id: accountId, lines: previous.lines.length, total: previous.total, status }, now, claimed.sql, claimed.values),
      this.db.prepare(
        `UPDATE transactions SET status = ?, confirmed_at = ?, cancelled_at = ?, updated_at = ?
         WHERE split_id = ? AND status = 'pending' AND ${claimed.sql}`
      ).bind(status, action === 'confirm' ? now : null, action === 'decline' ? now : null, now, id, ...claimed.values),
    ])
    return results[0].meta.changes === 1
  }
}
