import { recoverLedgerResidue } from '../../../shared/decimal-balance'
import type { DecimalRecovery } from '../../../shared/decimal-balance'
/** Bounded posted evidence only; pending/MCP review rows cannot repair cash. */
export async function recoverCashBalance(
  db: D1Database,
  id: string,
  balance: number,
): Promise<DecimalRecovery> {
  // Valid recorded decimal precision (including sub-cent openings) stays intact.
  if (Number(balance.toPrecision(15)) === balance) return null
  const rows = await db
    .prepare(
      "SELECT amount FROM transactions WHERE account_id=? AND status='posted' ORDER BY rowid LIMIT 10001",
    )
    .bind(id)
    .all<{ amount: number }>()
  const flows = rows.results.map((r) => r.amount)
  // Cash recovery needs stronger evidence than numerical proximity: complete
  // cent-valued ledger facts must reproduce the raw balance under the old fold.
  if (
    flows.length > 10000 ||
    flows.some((n) => Number(n.toFixed(2)) !== n) ||
    flows.reduce((sum, n) => sum + n, 0) !== balance
  )
    return null
  return recoverLedgerResidue(balance, flows, 0.01)
}
