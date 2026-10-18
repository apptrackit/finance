import { AppError } from '../errors/codes'
import type { Account } from '../models/Account'
import type { Transaction } from '../models/Transaction'
import type { RecurringSchedule } from '../models/RecurringSchedule'

type Value = string | number | null
const columns = [
  'id',
  'account_id',
  'category_id',
  'amount',
  'description',
  'date',
  'linked_transaction_id',
  'exclude_from_estimate',
  'status',
  'pending_kind',
  'review_source',
  'review_batch_id',
  'review_flags',
  'confirmed_at',
  'cancelled_at',
  'created_at',
  'updated_at',
] as const
function values(t: Transaction, now: number): Value[] {
  return [
    t.id,
    t.account_id,
    t.category_id ?? null,
    t.amount,
    t.description ?? null,
    t.date,
    t.linked_transaction_id ?? null,
    t.exclude_from_estimate ? 1 : 0,
    t.status ?? 'posted',
    t.pending_kind ?? 'upcoming',
    t.review_source ?? 'manual',
    t.review_batch_id ?? null,
    JSON.stringify(t.review_flags ?? []),
    t.confirmed_at ?? null,
    t.cancelled_at ?? null,
    t.created_at ?? now,
    t.updated_at ?? now,
  ]
}
export type CashMutation = {
  before: Transaction[]
  after: Transaction[]
  accounts: Account[]
  now: number
  correction?: { before: Account; after: Account; revision: number }
  schedule?: RecurringSchedule
}
/** Cash rows, their balance deltas, audit and optional schedule consumption are
 * one D1 batch. Relative deltas commute with trades; row/identity guards reject
 * stale editors without overwriting the other writer's balance. */
export class CashLedgerRepository {
  constructor(private db: D1Database) {}
  async commit(op: CashMutation): Promise<void> {
    const claim = crypto.randomUUID(),
      guard = 'EXISTS (SELECT 1 FROM audit_log WHERE id = ?)'
    const conditions: string[] = [],
      bindings: Value[] = []
    const accounts = [...new Map(op.accounts.map((a) => [a.id, a])).values()]
    if (
      [...op.before, ...op.after].some((t) => !accounts.some((a) => a.id === t.account_id)) ||
      new Set(op.before.map((t) => t.id)).size !== op.before.length ||
      new Set(op.after.map((t) => t.id)).size !== op.after.length
    ) throw AppError.validation('Cash mutations require distinct rows and every affected account snapshot')
    for (const a of accounts) {
      conditions.push(
        "EXISTS (SELECT 1 FROM accounts WHERE id=? AND type=? AND currency=? AND type IN ('cash','checking','savings','credit') AND COALESCE(is_locked,0)=0 AND archived_at IS NULL)",
      )
      bindings.push(a.id, a.type, a.currency)
    }
    for (const t of op.before) {
      const expected = values(t, op.now)
      // MapRow normalizes nullable legacy booleans/defaults and JSON flags.
      const expression = (c: (typeof columns)[number]) =>
        c === 'exclude_from_estimate'
          ? `COALESCE(${c},0)`
          : c === 'status'
            ? "COALESCE(status,'posted')"
            : c === 'pending_kind'
              ? "COALESCE(pending_kind,'upcoming')"
              : c === 'review_source'
                ? "COALESCE(review_source,'manual')"
                : c === 'review_flags'
                  ? "CASE WHEN json_valid(review_flags) THEN json(review_flags) ELSE '[]' END"
                  : c
      conditions.push(
        `EXISTS (SELECT 1 FROM transactions WHERE ${columns.map((c) => `${expression(c)} IS ?`).join(' AND ')})`,
      )
      // Preserve an actual null legacy timestamp in snapshot guards.
      expected[15] = t.created_at ?? null
      expected[16] = t.updated_at ?? null
      bindings.push(...expected)
    }
    // New row IDs are protected by their primary key. A duplicate insert aborts
    // the complete batch, including this claim and all balance changes.
    if (op.correction) {
      conditions.push('(SELECT revision FROM financial_data_revision WHERE id=1)=?')
      bindings.push(op.correction.revision)
    }
    if (op.schedule) {
      const s = op.schedule
      const fields = [
        'id',
        'type',
        'frequency',
        'day_of_week',
        'day_of_month',
        'month',
        'account_id',
        'to_account_id',
        'category_id',
        'amount',
        'amount_to',
        'description',
        'is_active',
        'created_at',
        'last_processed_date',
        'remaining_occurrences',
        'end_date',
      ] as const
      conditions.push(
        `EXISTS (SELECT 1 FROM recurring_schedules WHERE ${fields.map((f) => `${f} IS ?`).join(' AND ')})`,
      )
      bindings.push(...fields.map((f) => (f === 'is_active' ? (s.is_active ? 1 : 0) : (s[f] ?? null))))
    }
    const entity = op.correction ? 'account' : 'transaction',
      entityId = op.correction?.before.id ?? op.after[0]?.id ?? op.before[0]?.id
    if (!entityId || !accounts.length)
      throw AppError.validation('A cash mutation requires its account and ledger facts')
    const action =
      op.correction || (op.before.length && op.after.length)
        ? 'UPDATE'
        : op.after.length
          ? 'CREATE'
          : 'DELETE'
    const statements = [
      this.db
        .prepare(
          `INSERT INTO audit_log(id,action,entity,entity_id,details,created_at) SELECT ?,?,?,?,?,? WHERE ${conditions.join(' AND ')}`,
        )
        .bind(
          claim,
          action,
          entity,
          entityId,
          JSON.stringify({
            before: op.before,
            after: op.after,
            account: op.correction,
            schedule_id: op.schedule?.id,
          }),
          op.now,
          ...bindings,
        ),
    ]
    const deltas = new Map<string, number>()
    for (const [rows, sign] of [
      [op.before, -1],
      [op.after, 1],
    ] as const)
      for (const t of rows)
        if ((t.status ?? 'posted') === 'posted')
          deltas.set(t.account_id, (deltas.get(t.account_id) ?? 0) + sign * t.amount)
    for (const [id, delta] of deltas)
      if (delta !== 0 && id !== op.correction?.before.id)
        statements.push(
          this.db
            .prepare(`UPDATE accounts SET balance=balance+?,updated_at=? WHERE id=? AND ${guard}`)
            .bind(delta, op.now, id, claim),
        )
    if (op.correction) {
      const a = op.correction.after
      const fields = [
        'name',
        'type',
        'balance',
        'currency',
        'quote_currency',
        'symbol',
        'asset_type',
        'exclude_from_net_worth',
        'exclude_from_cash_balance',
        'updated_at',
      ] as const
      statements.push(
        this.db
          .prepare(`UPDATE accounts SET ${fields.map((f) => `${f}=?`).join(',')} WHERE id=? AND ${guard}`)
          .bind(
            ...fields.map((f) =>
              f === 'exclude_from_net_worth' || f === 'exclude_from_cash_balance'
                ? a[f]
                  ? 1
                  : 0
                : (a[f] ?? null),
            ),
            a.id,
            claim,
          ),
      )
    }
    for (const t of op.before.filter((t) => !op.after.some((a) => a.id === t.id)))
      statements.push(this.db.prepare(`DELETE FROM transactions WHERE id=? AND ${guard}`).bind(t.id, claim))
    for (const t of op.after) {
      if (op.before.some((b) => b.id === t.id))
        statements.push(
          this.db
            .prepare(
              `UPDATE transactions SET ${columns
                .slice(1)
                .map((c) => `${c}=?`)
                .join(',')} WHERE id=? AND ${guard}`,
            )
            .bind(...values(t, op.now).slice(1), t.id, claim),
        )
      else
        statements.push(
          this.db
            .prepare(
              `INSERT INTO transactions(${columns.join(',')}) SELECT ${columns.map(() => '?').join(',')} WHERE ${guard}`,
            )
            .bind(...values(t, op.now), claim),
        )
    }
    const otherIds = new Set([...op.before, ...op.after].map((t) => t.id))
    if (entity === 'transaction') otherIds.delete(entityId)
    for (const id of otherIds) {
      const before = op.before.find((t) => t.id === id),
        after = op.after.find((t) => t.id === id)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO audit_log(id,action,entity,entity_id,details,created_at) SELECT ?,?,'transaction',?,?,? WHERE ${guard}`,
          )
          .bind(
            crypto.randomUUID(),
            before && after ? 'UPDATE' : after ? 'CREATE' : 'DELETE',
            id,
            JSON.stringify({ before, after }),
            op.now,
            claim,
          ),
      )
    }
    if (op.schedule) {
      const s = op.schedule,
        remaining = s.remaining_occurrences == null ? null : s.remaining_occurrences - 1
      statements.push(
        this.db
          .prepare(
            `UPDATE recurring_schedules SET last_processed_date=?,remaining_occurrences=?,is_active=? WHERE id=? AND ${guard}`,
          )
          .bind(op.after[0].date, remaining, remaining === 0 ? 0 : 1, s.id, claim),
      )
    }
    const result = await this.db.batch(statements)
    if (!result[0].meta.changes)
      throw new AppError(
        'HISTORY_CHANGED',
        'Cash records changed or became protected; refresh before saving.',
        409,
      )
  }
}
