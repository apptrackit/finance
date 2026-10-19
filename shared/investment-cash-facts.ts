/** Read-only legacy settlement evidence. Never infer execution currency/fees or
 * attach a cash leg to a standalone trade. Existing saved cash facts win. */
export const INVESTMENT_CASH_FACTS_SELECT = `SELECT it.*,
  CASE WHEN it.cash_amount IS NULL AND it.cash_currency IS NULL AND c.id IS NOT NULL
    AND c.linked_transaction_id=it.id AND c.date=it.date AND c.status='posted'
    AND ca.type IN ('cash','checking','savings','credit')
    AND ((it.type='buy' AND c.amount<0) OR (it.type='sell' AND c.amount>0))
    AND (SELECT COUNT(*) FROM transactions x WHERE x.linked_transaction_id=it.id)=1
    THEN abs(c.amount) END AS _linked_cash_amount,
  ca.currency AS _linked_cash_currency
  FROM investment_transactions it JOIN accounts a ON a.id=it.account_id
  LEFT JOIN transactions c ON c.id=it.linked_transaction_id
  LEFT JOIN accounts ca ON ca.id=c.account_id`
export function mapInvestmentCashFacts<
  T extends { cash_amount?: number | null; cash_currency?: string | null; linked_transaction_id?: string | null; trade_version?: number },
>(
  row: T & {
    _linked_cash_amount?: number | null
    _linked_cash_currency?: string | null
  },
): T {
  const {
    _linked_cash_amount: amount,
    _linked_cash_currency: currency,
    ...trade
  } = row
  return {
    ...trade,
    ...(!trade.linked_transaction_id && (trade.trade_version??0)>0 && trade.cash_amount!=null && trade.cash_currency ? {cash_source: 'confirmed_legacy'} : {}),
    ...(amount != null && Number.isFinite(amount) && currency
      ? {
          cash_amount: amount,
          cash_currency: currency,
          cash_source: 'linked_transaction',
        }
      : {}),
  } as T
}
