import type { ManualValuation } from '../../../shared/manual-valuation'
import type { Account } from '../models/Account'
import { AccountRepository } from './account.repository'

export class ManualValuationRepository {
  constructor(private db: D1Database) {}
  async revision() { return (await this.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision'))! }
  account(id: string) { return new AccountRepository(this.db).findById(id) }
  observation(id: string, date: string) {
    return this.db.prepare('SELECT * FROM investment_valuations WHERE account_id = ? AND effective_date = ?').bind(id,date).first<ManualValuation>()
  }
  async history(id: string, at: string, before: string, limit: number) {
    const [rows, effective] = await Promise.all([
      this.db.prepare('SELECT * FROM investment_valuations WHERE account_id = ? AND effective_date <= ? AND effective_date < ? ORDER BY effective_date DESC LIMIT ?')
        .bind(id,at,before,limit+1).all<ManualValuation>(),
      this.db.prepare('SELECT * FROM investment_valuations WHERE account_id = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1')
        .bind(id,at).first<ManualValuation>(),
    ])
    return { observations: rows.results.slice(0,limit), valuation_at: effective,
      next_cursor: rows.results.length > limit ? rows.results[limit-1].effective_date : null }
  }
  async save(revision: number, a: Account, before: ManualValuation | null, after: ManualValuation): Promise<boolean> {
    const audit = crypto.randomUUID()
    const guard = 'EXISTS (SELECT 1 FROM audit_log WHERE id = ?)'
    const claim = this.db.prepare(`INSERT INTO audit_log (id,action,entity,entity_id,details,created_at)
      SELECT ?,?,'investment_valuation',?,?,? WHERE (SELECT revision FROM financial_data_revision WHERE id = 1) = ?
      AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND COALESCE(is_locked,0) = 0 AND archived_at IS NULL)
      AND COALESCE((SELECT version FROM investment_valuations WHERE account_id = ? AND effective_date = ?),0) = ?`)
      .bind(audit,before?'UPDATE':'CREATE',after.id,JSON.stringify({before,after}),after.updated_at,revision,a.id,a.id,after.effective_date,before?.version??0)
    const write = before
      ? this.db.prepare(`UPDATE investment_valuations SET amount = ?,source = 'user',version = ?,updated_at = ? WHERE id = ? AND ${guard}`)
        .bind(after.amount,after.version,after.updated_at,after.id,audit)
      : this.db.prepare(`INSERT INTO investment_valuations (id,account_id,effective_date,kind,amount,currency,source,version,created_at,updated_at)
          SELECT ?,?,?,?,?,?,'user',1,?,? WHERE ${guard}`)
        .bind(after.id,a.id,after.effective_date,after.kind,after.amount,after.currency,after.created_at,after.updated_at,audit)
    const latest = '(SELECT amount FROM investment_valuations WHERE account_id = accounts.id ORDER BY effective_date DESC LIMIT 1)'
    const mirror = a.asset_type === 'manual'
      ? `balance = ${a.manual_ownership === 'owned' ? latest : '0'}`
      : `manual_price = ${latest}, manual_price_date = (SELECT effective_date FROM investment_valuations WHERE account_id = accounts.id ORDER BY effective_date DESC LIMIT 1)`
    const result = await this.db.batch([claim,write,
      this.db.prepare(`UPDATE accounts SET ${mirror},updated_at = ? WHERE id = ? AND ${guard}`).bind(after.updated_at,a.id,audit)])
    return (result[0].meta.changes??0)>0
  }
}
