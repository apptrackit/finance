import type { ManualValuation } from '../../../shared/manual-valuation'
import type { Account } from '../models/Account'
import type { InvestmentTransaction } from '../models/InvestmentTransaction'
import type { Transaction } from '../models/Transaction'
import type { PositionAnchor } from '../../../shared/holding'
import { AccountRepository } from './account.repository'
import { TransactionRepository } from './transaction.repository'
import { AppError } from '../errors/codes'

export type TradeState = { revision: number; accounts: Account[]; trades: InvestmentTransaction[]; valuations: ManualValuation[] }
export type TradeResult = { trade_id: string; cash_transaction_id: string; type: 'buy' | 'sell'; deleted?: boolean }
export type TradeOperation = {
  key: string; hash: string; now: number; state: TradeState; result: TradeResult
  before?: { trade: InvestmentTransaction; cash: Transaction }
  after?: { trade: InvestmentTransaction; cash: Transaction }
  removeValuations?: string[]; addValuations?: ManualValuation[]
  balances: Map<string, number>; anchors: { accountId: string; anchor: PositionAnchor }[]
}
export class InvestmentTradeRepository {
  constructor(private db: D1Database) {}
  async hasCapacity(now: number) {
    return (await this.db.prepare('SELECT COUNT(*) AS count FROM investment_trade_operations WHERE expires_at > ?').bind(now).first<number>('count'))! < 1000
  }
  async replay(key: string, now: number) {
    return this.db.prepare('SELECT request_hash, response_json FROM investment_trade_operations WHERE idempotency_key = ? AND expires_at > ?')
      .bind(key, now).first<{ request_hash: string; response_json: string }>()
  }
  async findTrade(id: string) {
    const {results} = await this.db.prepare('SELECT * FROM investment_transactions WHERE id = ? OR linked_transaction_id = ? LIMIT 2').bind(id, id).all<InvestmentTransaction>()
    if (results.length>1) throw new AppError('TRADE_RECONCILIATION_REQUIRED','This ID refers to ambiguous legacy cash/trade records; reconcile the links first.',409)
    return results[0] ?? null
  }
  async cash(id: string) { return new TransactionRepository(this.db).findById(id) }
  async cashLinks(id: string) {
    return (await this.db.prepare('SELECT * FROM transactions WHERE linked_transaction_id = ?').bind(id).all<Transaction>()).results
  }
  async state(holdingIds: string[]): Promise<TradeState> {
    // Read the revision first. The claim below rejects ANY intervening financial
    // mutation, including net-zero history edits and an anchor/lock change.
    const revision = await this.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')
    const accounts = await new AccountRepository(this.db).findAll()
    const trades = (await this.db.prepare(`SELECT * FROM investment_transactions WHERE account_id IN (${holdingIds.map(() => '?').join(',')}) ORDER BY date, effective_order, id LIMIT 10001`)
      .bind(...holdingIds).all<InvestmentTransaction>()).results
    if (trades.length > 10000) throw AppError.validation('Trade history exceeds the supported 10,000-row mutation limit')
    const valuations = (await this.db.prepare(`SELECT * FROM investment_valuations WHERE account_id IN (${holdingIds.map(() => '?').join(',')}) ORDER BY effective_date LIMIT 10001`).bind(...holdingIds).all<ManualValuation>()).results
    if (valuations.length > 10000) throw AppError.validation('Valuation history exceeds the supported 10,000-row mutation limit')
    return { revision: revision!, accounts, trades, valuations }
  }
  async commit(op: TradeOperation): Promise<boolean> {
    const token = crypto.randomUUID()
    const guard = 'EXISTS (SELECT 1 FROM investment_trade_operations WHERE claim_token = ?)'
    const statements = [
      this.db.prepare('DELETE FROM investment_trade_operations WHERE expires_at <= ?').bind(op.now),
      this.db.prepare(`INSERT OR IGNORE INTO investment_trade_operations
        (idempotency_key, claim_token, request_hash, response_json, created_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT revision FROM financial_data_revision WHERE id = 1) = ?
        AND (SELECT COUNT(*) FROM investment_trade_operations) < 1000`)
        .bind(op.key, token, op.hash, JSON.stringify(op.result), op.now, op.now + 86400000, op.state.revision),
    ]
    for (const { accountId, anchor } of op.anchors) statements.push(this.db.prepare(`INSERT INTO investment_position_anchors
      (id,account_id,kind,effective_date,balance,trade_rowid_boundary,trade_order_boundary,created_at)
      SELECT ?, ?, 'observed', ?, ?, COALESCE((SELECT MAX(rowid) FROM investment_transactions WHERE account_id = ?),0), ?, ? WHERE ${guard}`)
      .bind(anchor.id, accountId, anchor.effective_date, anchor.balance, accountId, anchor.trade_order_boundary ?? 0, op.now, token))
    for (const id of op.removeValuations ?? []) statements.push(this.db.prepare(`DELETE FROM investment_valuations WHERE id = ? AND source = 'acquisition' AND ${guard}`).bind(id,token))
    for (const v of op.addValuations ?? []) statements.push(this.db.prepare(`INSERT INTO investment_valuations (id,account_id,effective_date,kind,amount,currency,source,version,created_at,updated_at,source_trade_id)
      SELECT ?,?,?,?,?,?,'acquisition',1,?,?,? WHERE ${guard}`).bind(v.id,v.account_id,v.effective_date,v.kind,v.amount,v.currency,v.created_at,v.updated_at,v.source_trade_id??null,token))
    for (const [id, balance] of op.balances) statements.push(this.db.prepare(`UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ? AND ${guard}`)
      .bind(balance, op.now, id, token))
    if (op.after) {
      const { trade: t, cash: c } = op.after
      const tradeColumns = ['account_id','type','quantity','price','total_amount','date','notes','linked_transaction_id',
        'execution_currency','gross_amount','fee_amount','fee_currency','fee_status','cash_amount','cash_currency','trade_version','asset_event'] as const
      const values = tradeColumns.map(k => t[k] ?? null)
      if (op.before) {
        statements.push(this.db.prepare(`UPDATE investment_transactions SET ${tradeColumns.map(k => `${k} = ?`).join(',')} WHERE id = ? AND ${guard}`).bind(...values, t.id, token))
        statements.push(this.db.prepare(`UPDATE transactions SET account_id = ?, amount = ?, description = ?, date = ?, updated_at = ?, category_id = NULL, exclude_from_estimate = 0 WHERE id = ? AND ${guard}`)
          .bind(c.account_id, c.amount, c.description ?? null, c.date, op.now, c.id, token))
      } else {
        statements.push(this.db.prepare(`UPDATE investment_trade_sequence SET last_order = last_order + 1 WHERE id = 1 AND ${guard}`).bind(token))
        statements.push(this.db.prepare(`INSERT INTO transactions (id,account_id,amount,description,date,linked_transaction_id,status,confirmed_at,created_at,updated_at)
          SELECT ?,?,?,?,?,?,'posted',?,?,? WHERE ${guard}`).bind(c.id,c.account_id,c.amount,c.description??null,c.date,t.id,op.now,op.now,op.now,token))
        statements.push(this.db.prepare(`INSERT INTO investment_transactions (id,${tradeColumns.join(',')},created_at,effective_order)
          SELECT ?,${tradeColumns.map(() => '?').join(',')},?,(SELECT last_order FROM investment_trade_sequence WHERE id = 1) WHERE ${guard}`)
          .bind(t.id,...values,op.now,token))
      }
    } else if (op.before) {
      statements.push(this.db.prepare(`DELETE FROM investment_transactions WHERE id = ? AND ${guard}`).bind(op.before.trade.id,token))
      statements.push(this.db.prepare(`DELETE FROM transactions WHERE id = ? AND ${guard}`).bind(op.before.cash.id,token))
    }
    const action = !op.before ? 'CREATE' : !op.after ? 'DELETE' : 'UPDATE'
    const snapshot = (pair: TradeOperation['before']) => pair ? {
      cash_account_id:pair.cash.account_id, investment_account_id:pair.trade.account_id,
      cash_amount:pair.cash.amount, quantity:pair.trade.quantity, price:pair.trade.price,
      total_amount:pair.trade.total_amount, trade:pair.trade, cash:pair.cash,
    } : null
    for (const [entity,id] of [['transaction',op.result.cash_transaction_id],['investment_transaction',op.result.trade_id]]) {
      statements.push(this.db.prepare(`INSERT INTO audit_log (id,action,entity,entity_id,details,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`)
        .bind(crypto.randomUUID(),action,entity,id,JSON.stringify({ before:snapshot(op.before),after:snapshot(op.after), removed_valuations:op.state.valuations.filter(v => op.removeValuations?.includes(v.id)), added_valuations:op.addValuations }),op.now,token))
    }
    const results = await this.db.batch(statements)
    return (results[1].meta.changes ?? 0) > 0
  }
}
