import type { InvestmentTransaction } from '../models/InvestmentTransaction'
import type { LegacyDetailsInput } from '../../../shared/legacy-investment-details'
import { AccountRepository } from './account.repository'
export class LegacyInvestmentDetailsRepository {
  constructor(private db: D1Database) {}
  async revision() {
    return this.db
      .prepare('SELECT revision FROM financial_data_revision WHERE id=1')
      .first<number>('revision')
  }
  async snapshot(id: string) {
    const revision = await this.revision()
    const trade = await this.db
      .prepare('SELECT * FROM investment_transactions WHERE id=?')
      .bind(id)
      .first<InvestmentTransaction>()
    const account = trade
      ? await new AccountRepository(this.db).findById(trade.account_id)
      : null
    const cash = await this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM transactions WHERE linked_transaction_id=? OR id=?',
      )
      .bind(id, id)
      .first<number>('n')
    return { revision, trade, account, cash }
  }
  async save(
    snapshot: Awaited<
      ReturnType<LegacyInvestmentDetailsRepository['snapshot']>
    >,
    input: LegacyDetailsInput,
  ) {
    const t = snapshot.trade!,
      now = Date.now()
    const after = {
      execution_currency: input.execution_currency,
      gross_amount: t.quantity * t.price,
      cash_amount: input.cash_amount,
      cash_currency: input.cash_currency,
      fee_status: input.fee_status,
      fee_amount: input.fee_status === 'known' ? input.fee_amount : null,
      fee_currency: input.fee_status === 'known' ? input.cash_currency : null,
      trade_version: (t.trade_version ?? 0) + 1,
    }
    // Keep the audit immediately after the guarded UPDATE: changes() reports
    // that top-level row change, while D1 meta.changes also counts triggers.
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE investment_transactions SET execution_currency=?,gross_amount=?,cash_amount=?,cash_currency=?,fee_status=?,fee_amount=?,fee_currency=?,trade_version=?
        WHERE id=? AND trade_version=? AND linked_transaction_id IS NULL
        AND (SELECT revision FROM financial_data_revision WHERE id=1)=?
        AND EXISTS(SELECT 1 FROM accounts WHERE id=investment_transactions.account_id AND type='investment' AND asset_type IS NOT 'manual' AND COALESCE(is_locked,0)=0 AND archived_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM transactions WHERE linked_transaction_id=? OR id=?)`,
        )
        .bind(
          after.execution_currency,
          after.gross_amount,
          after.cash_amount,
          after.cash_currency,
          after.fee_status,
          after.fee_amount ?? null,
          after.fee_currency,
          after.trade_version,
          t.id,
          input.expected_version,
          snapshot.revision,
          t.id,
          t.id,
        ),
      this.db
        .prepare(
          `INSERT INTO audit_log(id,action,entity,entity_id,details,created_at)
        SELECT ?,'UPDATE','investment_transaction',?,?,? WHERE changes()=1`,
        )
        .bind(
          crypto.randomUUID(),
          t.id,
          JSON.stringify({
            source: 'confirmed_legacy_details',
            before: t,
            after: { ...t, ...after },
            cash_and_units_unchanged: true,
          }),
          now,
        ),
    ])
    return (result[0].meta.changes ?? 0) > 0
  }
}
