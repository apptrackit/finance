import { AppError } from '../errors/codes'
import type { Account } from '../models/Account'
import { CashLedgerRepository } from './cash-ledger.repository'
import { Transaction } from '../models/Transaction'
import {
  RawTransactionRow,
  TransactionRepository,
} from './transaction.repository'

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

type LoadedSplit = {
  split: TransactionSplit
  lines: Transaction[]
  total: number
}

export class TransactionSplitRepository {
  constructor(private db: D1Database) {}
  async findById(id: string): Promise<TransactionSplit | null> {
    return await this.db
      .prepare(
        'SELECT id, description, created_at, updated_at FROM transaction_splits WHERE id = ?',
      )
      .bind(id)
      .first<TransactionSplit>()
  }

  async findTransaction(id: string): Promise<Transaction | null> {
    const row = await this.db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .bind(id)
      .first<RawTransactionRow>()
    return row ? TransactionRepository.mapRow(row) : null
  }

  async findLines(splitId: string): Promise<Transaction[]> {
    const { results } = await this.db
      .prepare(
        `SELECT t.*, s.description AS split_description FROM transactions t
       JOIN transaction_splits s ON s.id = t.split_id WHERE t.split_id = ? ORDER BY t.rowid ASC`,
      )
      .bind(splitId)
      .all<RawTransactionRow>()
    return results.map((row) => TransactionRepository.mapRow(row))
  }

  private rows(split: SplitWrite, now: number): Transaction[] {
    const pending = split.pending
    return split.lines.map((line) => ({
      id: line.id,
      account_id: split.account_id,
      category_id: line.category_id,
      amount: line.amount,
      description: line.description,
      date: split.date,
      exclude_from_estimate: split.exclude_from_estimate,
      status: pending ? 'pending' : 'posted',
      pending_kind: pending?.pending_kind ?? 'upcoming',
      review_source: pending?.review_source ?? 'manual',
      review_batch_id: pending?.review_batch_id ?? null,
      review_flags: pending?.review_flags ?? [],
      confirmed_at: pending ? null : now,
      created_at: now,
      updated_at: now,
      split_id: split.lines.length > 1 ? split.id : null,
    }))
  }
  private async commit(
    before: Transaction[],
    after: Transaction[],
    previous: TransactionSplit | null,
    next: TransactionSplit | null,
    now: number,
    expectedBalance?: number,
  ): Promise<boolean> {
    const ids = [...new Set([...before, ...after].map((t) => t.account_id))]
    const accounts: Account[] = []
    for (const id of ids) {
      const account = await this.db
        .prepare('SELECT * FROM accounts WHERE id=?')
        .bind(id)
        .first<Account>()
      if (
        !account ||
        account.type === 'investment' ||
        account.is_locked ||
        account.archived_at != null
      )
        return false
      accounts.push(account)
    }
    try {
      await new CashLedgerRepository(this.db).commit({
        before,
        after,
        accounts,
        now,
        split: {
          before: previous,
          after: next,
          ...(expectedBalance === undefined
            ? {}
            : {
                expected_balance: {
                  account_id: after[0].account_id,
                  balance: expectedBalance,
                },
              }),
        },
      })
      return true
    } catch (error) {
      if (error instanceof AppError && error.code === 'HISTORY_CHANGED')
        return false
      throw error
    }
  }
  async create(
    split: SplitWrite,
    now: number,
    expectedBalance?: number,
  ): Promise<boolean> {
    return this.commit(
      [],
      this.rows(split, now),
      null,
      {
        id: split.id,
        description: split.description,
        created_at: now,
        updated_at: now,
      },
      now,
      expectedBalance,
    )
  }
  async replace(
    previous: LoadedSplit,
    next: SplitWrite,
    now: number,
    expectedBalance?: number,
  ): Promise<boolean> {
    return this.commit(
      previous.lines,
      this.rows(next, now),
      previous.split,
      next.lines.length > 1
        ? { ...previous.split, description: next.description, updated_at: now }
        : null,
      now,
      expectedBalance,
    )
  }
  async remove(previous: LoadedSplit, now: number): Promise<boolean> {
    return this.commit(previous.lines, [], previous.split, null, now)
  }
  async resolve(
    previous: LoadedSplit,
    action: 'confirm' | 'decline',
    now: number,
    today: string,
  ): Promise<boolean> {
    if (
      previous.lines.some(
        (t) =>
          t.status !== 'pending' || (action === 'confirm' && t.date > today),
      )
    )
      return false
    const after = previous.lines.map((t) => ({
      ...t,
      status:
        action === 'confirm' ? ('posted' as const) : ('cancelled' as const),
      confirmed_at: action === 'confirm' ? now : null,
      cancelled_at: action === 'decline' ? now : null,
      updated_at: now,
    }))
    return this.commit(
      previous.lines,
      after,
      previous.split,
      { ...previous.split, updated_at: now },
      now,
    )
  }
}
