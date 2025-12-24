import { Account } from '../models/Account'

export class AccountRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<Account[]> {
    const { results } = await this.db.prepare('SELECT * FROM accounts').all<Account>()
    return results
  }

  async findById(id: string): Promise<Account | null> {
    return await this.db.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<Account>()
  }

  async create(account: Account): Promise<void> {
    await this.db.prepare(
      'INSERT INTO accounts (id, name, type, balance, currency, symbol, asset_type, exclude_from_net_worth, exclude_from_cash_balance, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      account.id,
      account.name,
      account.type,
      account.balance,
      account.currency,
      account.symbol || null,
      account.asset_type || null,
      account.exclude_from_net_worth ? 1 : 0,
      account.exclude_from_cash_balance ? 1 : 0,
      account.updated_at
    ).run()
  }

  async update(id: string, updates: Partial<Account>): Promise<void> {
    await this.db.prepare(
      'UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), balance = COALESCE(?, balance), currency = COALESCE(?, currency), symbol = COALESCE(?, symbol), asset_type = COALESCE(?, asset_type), exclude_from_net_worth = COALESCE(?, exclude_from_net_worth), exclude_from_cash_balance = COALESCE(?, exclude_from_cash_balance), updated_at = ? WHERE id = ?'
    ).bind(
      updates.name || null,
      updates.type || null,
      updates.balance ?? null,
      updates.currency || null,
      updates.symbol !== undefined ? updates.symbol : null,
      updates.asset_type !== undefined ? updates.asset_type : null,
      updates.exclude_from_net_worth !== undefined ? (updates.exclude_from_net_worth ? 1 : 0) : null,
      updates.exclude_from_cash_balance !== undefined ? (updates.exclude_from_cash_balance ? 1 : 0) : null,
      updates.updated_at || Date.now(),
      id
    ).run()
  }

  async updateBalance(id: string, balance: number, updated_at: number): Promise<void> {
    await this.db.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?')
      .bind(balance, updated_at, id).run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run()
  }
}
