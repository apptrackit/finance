import type { InvestmentTransaction } from '../models/InvestmentTransaction'
import type { Transaction } from '../models/Transaction'
import { TransactionRepository, type RawTransactionRow } from './transaction.repository'

export type InvestmentTransferUpdate = {
  cashAccountId: string; investmentAccountId: string; cashAmount: number
  quantity: number; price: number; date: string
  description: string | null; notes: string | null
}

// Every statement after the claim is conditional on its unique token. D1 runs
// the batch as one transaction: failures roll back the claim, balances, records,
// and audit together; concurrent edits cannot apply a stale pair snapshot.
export class InvestmentTransferRepository {
  constructor(private db: D1Database) {}

  async findCashLinks(investmentId: string): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions WHERE linked_transaction_id = ?')
      .bind(investmentId).all<RawTransactionRow>()
    return results.map(row => TransactionRepository.mapRow(row))
  }

  private audit(action: 'CREATE' | 'UPDATE' | 'DELETE', cashId: string, investmentId: string, now: number,
    guard: string, values: (string | number)[], details: Record<string, unknown>) {
    return [['transaction', cashId], ['investment_transaction', investmentId]].map(([entity, id]) =>
      this.db.prepare(`INSERT INTO audit_log (id, action, entity, entity_id, details, created_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE ${guard}`)
        .bind(crypto.randomUUID(), action, entity, id,
          JSON.stringify({ ...details, cash_transaction_id: cashId, investment_transaction_id: investmentId }), now, ...values))
  }

  private snapshot(cash: Transaction, trade: InvestmentTransaction) {
    return { cash_account_id: cash.account_id, cash_amount: cash.amount, investment_account_id: trade.account_id,
      type: trade.type, quantity: trade.quantity, price: trade.price, total_amount: trade.total_amount,
      date: trade.date, description: cash.description ?? null, notes: trade.notes ?? null }
  }

  async create(cash: Transaction, trade: InvestmentTransaction, now: number): Promise<boolean> {
    const exists = 'EXISTS (SELECT 1 FROM transactions WHERE id = ? AND linked_transaction_id = ?)'
    const guard = [cash.id, trade.id]
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO transactions
        (id, account_id, amount, description, date, linked_transaction_id, status, confirmed_at, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM accounts c JOIN accounts i ON i.id = ?
          WHERE c.id = ? AND c.type != 'investment' AND i.type = 'investment'
          AND COALESCE(c.is_locked, 0) = 0 AND COALESCE(i.is_locked, 0) = 0
          AND c.archived_at IS NULL AND i.archived_at IS NULL)`)
        .bind(cash.id, cash.account_id, cash.amount, cash.description ?? null, cash.date, trade.id, now, now, now, trade.account_id, cash.account_id),
      this.db.prepare(`INSERT INTO investment_transactions
        (id, account_id, type, quantity, price, total_amount, date, notes, created_at, linked_transaction_id)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${exists}`)
        .bind(trade.id, trade.account_id, trade.type, trade.quantity, trade.price, trade.total_amount, trade.date, trade.notes ?? null, now, cash.id, ...guard),
      this.db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND ${exists}`)
        .bind(cash.amount, now, cash.account_id, ...guard),
      this.db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND ${exists}`)
        .bind(trade.type === 'buy' ? trade.quantity : -trade.quantity, now, trade.account_id, ...guard),
      ...this.audit('CREATE', cash.id, trade.id, now, exists, guard, { after: this.snapshot(cash, trade) }),
    ])
    // D1 counts trigger writes too (for example the source revision update).
    return results[0].meta.changes > 0
  }

  private claim(cash: Transaction, trade: InvestmentTransaction, token: string, next: Pick<InvestmentTransferUpdate, 'cashAccountId' | 'investmentAccountId'>) {
    return this.db.prepare(`UPDATE transactions SET status = ? WHERE id = ? AND status = 'posted'
      AND account_id = ? AND amount = ? AND date = ? AND description IS ? AND updated_at IS ?
      AND linked_transaction_id = ?
      AND EXISTS (SELECT 1 FROM investment_transactions i
        JOIN accounts old_cash ON old_cash.id = transactions.account_id
        JOIN accounts old_investment ON old_investment.id = i.account_id
        JOIN accounts new_cash ON new_cash.id = ?
        JOIN accounts new_investment ON new_investment.id = ?
        WHERE i.id = ? AND i.linked_transaction_id = transactions.id AND i.account_id = ?
        AND i.type = ? AND i.quantity = ? AND i.price = ? AND i.total_amount = ? AND i.date = ? AND i.notes IS ?
        AND i.date = transactions.date
        AND ((i.type = 'buy' AND transactions.amount < 0) OR (i.type = 'sell' AND transactions.amount > 0))
        AND old_cash.type != 'investment' AND new_cash.type != 'investment'
        AND old_investment.type = 'investment' AND new_investment.type = 'investment'
        AND old_cash.archived_at IS NULL AND old_investment.archived_at IS NULL
        AND new_cash.archived_at IS NULL AND new_investment.archived_at IS NULL
        AND COALESCE(old_cash.is_locked, 0) = 0 AND COALESCE(old_investment.is_locked, 0) = 0
        AND COALESCE(new_cash.is_locked, 0) = 0 AND COALESCE(new_investment.is_locked, 0) = 0)
      AND 1 = (SELECT COUNT(*) FROM transactions other WHERE other.linked_transaction_id = ?)`)
      .bind(token, cash.id, cash.account_id, cash.amount, cash.date, cash.description ?? null, cash.updated_at ?? null,
        trade.id, next.cashAccountId, next.investmentAccountId, trade.id, trade.account_id,
        trade.type, trade.quantity, trade.price, trade.total_amount, trade.date, trade.notes ?? null, trade.id)
  }

  async update(cash: Transaction, trade: InvestmentTransaction, next: InvestmentTransferUpdate, now: number): Promise<boolean> {
    const token = `investment-edit:${crypto.randomUUID()}`
    const exists = 'EXISTS (SELECT 1 FROM transactions WHERE id = ? AND status = ?)'
    const guard = [cash.id, token]
    const sign = trade.type === 'buy' ? 1 : -1
    const deltas = new Map<string, number>()
    const add = (id: string, amount: number) => deltas.set(id, (deltas.get(id) ?? 0) + amount)
    add(cash.account_id, -cash.amount)
    add(trade.account_id, -sign * trade.quantity)
    add(next.cashAccountId, next.cashAmount)
    add(next.investmentAccountId, sign * next.quantity)
    const results = await this.db.batch([
      this.claim(cash, trade, token, next),
      ...[...deltas].filter(([, delta]) => delta !== 0).map(([id, delta]) =>
        this.db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND ${exists}`)
          .bind(delta, now, id, ...guard)),
      this.db.prepare(`UPDATE investment_transactions SET account_id = ?, quantity = ?, price = ?, total_amount = ?, date = ?, notes = ?
        WHERE id = ? AND linked_transaction_id = ? AND ${exists}`)
        .bind(next.investmentAccountId, next.quantity, next.price, next.quantity * next.price, next.date, next.notes, trade.id, cash.id, ...guard),
      ...this.audit('UPDATE', cash.id, trade.id, now, exists, guard, {
        before: this.snapshot(cash, trade),
        after: { cash_account_id: next.cashAccountId, cash_amount: next.cashAmount, investment_account_id: next.investmentAccountId,
          type: trade.type, quantity: next.quantity, price: next.price, total_amount: next.quantity * next.price,
          date: next.date, description: next.description, notes: next.notes },
      }),
      this.db.prepare(`UPDATE transactions SET account_id = ?, amount = ?, description = ?, date = ?,
        category_id = NULL, exclude_from_estimate = 0, updated_at = ?, status = 'posted'
        WHERE id = ? AND status = ?`)
        .bind(next.cashAccountId, next.cashAmount, next.description, next.date, now, ...guard),
    ])
    return results[0].meta.changes > 0
  }

  async delete(cash: Transaction, trade: InvestmentTransaction, now: number): Promise<boolean> {
    const token = `investment-delete:${crypto.randomUUID()}`
    const exists = 'EXISTS (SELECT 1 FROM transactions WHERE id = ? AND status = ?)'
    const guard = [cash.id, token]
    const results = await this.db.batch([
      this.claim(cash, trade, token, { cashAccountId: cash.account_id, investmentAccountId: trade.account_id }),
      this.db.prepare(`UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ? AND ${exists}`)
        .bind(cash.amount, now, cash.account_id, ...guard),
      this.db.prepare(`UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ? AND ${exists}`)
        .bind(trade.type === 'buy' ? trade.quantity : -trade.quantity, now, trade.account_id, ...guard),
      ...this.audit('DELETE', cash.id, trade.id, now, exists, guard, { before: this.snapshot(cash, trade) }),
      this.db.prepare(`DELETE FROM investment_transactions WHERE id = ? AND linked_transaction_id = ? AND ${exists}`)
        .bind(trade.id, cash.id, ...guard),
      this.db.prepare('DELETE FROM transactions WHERE id = ? AND status = ?').bind(...guard),
    ])
    return results[0].meta.changes > 0
  }
}
