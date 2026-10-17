import { HOLDING_ACCOUNT_SELECT, mapHoldingAccount } from '../../../shared/holding'
import type { PositionAnchor } from '../../../shared/holding'
import type { Account } from '../models/Account'

type D1Value = string | number | null

export class AccountRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<Account[]> {
    const { results } = await this.db.prepare(`${HOLDING_ACCOUNT_SELECT} ORDER BY a.name, a.id`).all<Account>()
    return results.map(row => mapHoldingAccount(row))
  }

  async findById(id: string): Promise<Account | null> {
    const row = await this.db.prepare(`${HOLDING_ACCOUNT_SELECT} WHERE a.id = ?`).bind(id).first<Account>()
    return row ? mapHoldingAccount(row) : null
  }

  async create(account: Account): Promise<void> {
    await this.db.prepare(
      'INSERT INTO accounts (id, name, type, balance, currency, quote_currency, symbol, asset_type, exclude_from_net_worth, exclude_from_cash_balance, is_locked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      account.id,
      account.name,
      account.type,
      account.balance,
      account.currency,
      account.quote_currency || null,
      account.symbol || null,
      account.asset_type || null,
      account.exclude_from_net_worth ? 1 : 0,
      account.exclude_from_cash_balance ? 1 : 0,
      account.is_locked ? 1 : 0,
      account.updated_at
    ).run()
  }

  async update(id: string, updates: Partial<Account>): Promise<void> {
    await this.db.prepare(
      'UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), balance = COALESCE(?, balance), currency = COALESCE(?, currency), quote_currency = COALESCE(?, quote_currency), symbol = COALESCE(?, symbol), asset_type = COALESCE(?, asset_type), exclude_from_net_worth = COALESCE(?, exclude_from_net_worth), exclude_from_cash_balance = COALESCE(?, exclude_from_cash_balance), updated_at = ? WHERE id = ?'
    ).bind(
      updates.name || null,
      updates.type || null,
      updates.balance ?? null,
      updates.currency || null,
      updates.quote_currency || null,
      updates.symbol !== undefined ? updates.symbol : null,
      updates.asset_type !== undefined ? updates.asset_type : null,
      updates.exclude_from_net_worth !== undefined ? (updates.exclude_from_net_worth ? 1 : 0) : null,
      updates.exclude_from_cash_balance !== undefined ? (updates.exclude_from_cash_balance ? 1 : 0) : null,
      updates.updated_at || Date.now(),
      id
    ).run()
  }

  async hasFutureInvestmentActivity(id: string, today: string): Promise<boolean> {
    return Boolean(await this.db.prepare('SELECT 1 AS found FROM investment_transactions WHERE account_id = ? AND date > ? LIMIT 1').bind(id, today).first())
  }

  private holdingValues(a: Account): D1Value[] {
    return [a.name, a.type, a.balance, a.currency, a.quote_currency ?? null, a.symbol ?? null, a.asset_type ?? null,
      a.pricing_method ?? null, a.unit ?? null, a.provider ?? null, a.exchange ?? null, a.manual_price ?? null,
      a.manual_price_date ?? null, a.exclude_from_net_worth ? 1 : 0, a.exclude_from_cash_balance ? 1 : 0, a.updated_at]
  }

  private anchorStatement(a: Account, anchor: PositionAnchor, auditId?: string): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO investment_position_anchors
      (id, account_id, kind, effective_date, balance, cost_amount, cost_currency, trade_rowid_boundary, created_at, trade_order_boundary)
      SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(rowid) FROM investment_transactions WHERE account_id = ?), 0), ?, COALESCE((SELECT MAX(effective_order) FROM investment_transactions WHERE account_id = ?), 0)
      ${auditId ? 'WHERE EXISTS (SELECT 1 FROM audit_log WHERE id = ?)' : ''}`)
      .bind(anchor.id, a.id, anchor.kind, anchor.effective_date, anchor.balance, anchor.cost_amount, anchor.cost_currency,
        a.id, anchor.created_at, a.id, ...(auditId ? [auditId] : []))
  }

  async createHolding(a: Account, anchor: PositionAnchor): Promise<void> {
    await this.db.batch([
      this.db.prepare(`INSERT INTO accounts
        (id, name, type, balance, currency, quote_currency, symbol, asset_type, pricing_method, unit, provider, exchange,
         manual_price, manual_price_date, exclude_from_net_worth, exclude_from_cash_balance, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(a.id, ...this.holdingValues(a)),
      this.anchorStatement(a, anchor),
      this.db.prepare("INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) VALUES (?, 'CREATE', 'account', ?, ?, ?)")
        .bind(crypto.randomUUID(), a.id, JSON.stringify({ name: a.name, asset_type: a.asset_type, opening: anchor }), a.updated_at),
    ])
  }

  async updateHolding(before: Account, after: Account, anchor: PositionAnchor | null): Promise<boolean> {
    const auditId = crypto.randomUUID()
    // The audit insertion claims the complete account snapshot. All following
    // writes depend on that unique claim, so a stale/locked request changes none.
    const fields = ['name', 'type', 'balance', 'currency', 'quote_currency', 'symbol', 'asset_type', 'pricing_method',
      'unit', 'provider', 'exchange', 'manual_price', 'manual_price_date', 'exclude_from_net_worth', 'exclude_from_cash_balance', 'updated_at']
    const snapshot = this.holdingValues(before)
    snapshot[13] = before.exclude_from_net_worth == null ? null : before.exclude_from_net_worth ? 1 : 0
    snapshot[14] = before.exclude_from_cash_balance == null ? null : before.exclude_from_cash_balance ? 1 : 0
    const statements = [
      this.db.prepare(`INSERT INTO audit_log (id, action, entity, entity_id, details, created_at)
        SELECT ?, 'UPDATE', 'account', a.id, ?, ? FROM accounts a
        WHERE a.id = ? AND COALESCE(a.is_locked, 0) = 0 AND a.archived_at IS NULL
        AND ${fields.map(f => `a.${f} IS ?`).join(' AND ')}`)
        .bind(auditId, JSON.stringify({ before: Object.fromEntries(fields.map(field => [field, before[field as keyof Account]])),
          after: Object.fromEntries(fields.map(field => [field, after[field as keyof Account]])), anchor }),
          after.updated_at, before.id, ...snapshot),
      this.db.prepare(`UPDATE accounts SET ${fields.map(f => `${f} = ?`).join(', ')}
        WHERE id = ? AND EXISTS (SELECT 1 FROM audit_log WHERE id = ?)`)
        .bind(...this.holdingValues(after), after.id, auditId),
    ]
    if (anchor) statements.push(this.anchorStatement(after, anchor, auditId))
    const results = await this.db.batch(statements)
    return (results[0].meta.changes ?? 0) > 0
  }

  async updateBalance(id: string, balance: number, updated_at: number): Promise<void> {
    await this.db.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?')
      .bind(balance, updated_at, id).run()
  }

  async setLocked(id: string, locked: boolean): Promise<void> {
    await this.db.prepare('UPDATE accounts SET is_locked = ? WHERE id = ?')
      .bind(locked ? 1 : 0, id).run()
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const now = Date.now()
    await this.db.prepare(archived
      ? 'UPDATE accounts SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL'
      : 'UPDATE accounts SET archived_at = NULL, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL')
      .bind(...(archived ? [now, now, id] : [now, id])).run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run()
  }
}
