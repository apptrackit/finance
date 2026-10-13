import { TransactionRepository, type RawTransactionRow } from './transaction.repository'
import type { InvestmentTransaction } from '../models/InvestmentTransaction'

export type HistoryPosition = { date: string; kind: 'cash' | 'investment'; sequence: number }
export type HistoryQuery = { limit: number; startDate?: string; endDate?: string; after?: HistoryPosition }
type HistoryRow = HistoryPosition & { payload: string }

// Column names are fixed application constants, never request input.
const cashColumns = ['id', 'account_id', 'category_id', 'amount', 'description', 'date',
  'linked_transaction_id', 'exclude_from_estimate', 'status', 'pending_kind', 'review_source',
  'review_batch_id', 'review_flags', 'confirmed_at', 'cancelled_at', 'created_at', 'updated_at']
const investmentColumns = ['id', 'account_id', 'type', 'quantity', 'price', 'total_amount', 'date', 'notes', 'created_at']
const jsonColumns = (columns: string[]) => columns.map(column => `'${column}', t.${column}`).join(', ')

export class TransactionHistoryRepository {
  constructor(private db: D1Database) {}

  async readPage({ limit, startDate, endDate, after }: HistoryQuery) {
    const conditions: string[] = []
    const values: (string | number)[] = []
    if (startDate) { conditions.push('t.date >= ?'); values.push(startDate) }
    if (endDate) { conditions.push('t.date <= ?'); values.push(endDate) }
    // Push the range into both indexed table reads, including investment rows.
    const range = conditions.length ? ` AND ${conditions.join(' AND ')}` : ''
    const cursor = after ? 'WHERE date < ? OR (date = ? AND (kind > ? OR (kind = ? AND sequence < ?)))' : ''
    const sql = `SELECT * FROM (
      SELECT t.date, 'cash' AS kind, t.rowid AS sequence, json_object(${jsonColumns(cashColumns)}) AS payload
      FROM transactions t WHERE t.status = 'posted'${range}
      UNION ALL
      SELECT t.date, 'investment' AS kind, t.rowid AS sequence, json_object(${jsonColumns(investmentColumns)}) AS payload
      FROM investment_transactions t JOIN accounts a ON a.id = t.account_id
      WHERE a.type = 'investment'${range}
    ) ${cursor} ORDER BY date DESC, kind ASC, sequence DESC LIMIT ?`
    const bindings = [...values, ...values, ...(after ? [after.date, after.date, after.kind, after.kind, after.sequence] : []), limit + 1]
    // D1 batches are transactions: the revision and page describe one snapshot.
    const [revisionResult, pageResult] = await this.db.batch([
      this.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1'),
      this.db.prepare(sql).bind(...bindings),
    ])
    const revision = (revisionResult.results[0] as { revision: number }).revision
    const rows = pageResult.results as HistoryRow[]
    const page = rows.slice(0, limit)
    return {
      revision,
      transactions: page.filter(row => row.kind === 'cash').map(row =>
        TransactionRepository.mapRow(JSON.parse(row.payload) as RawTransactionRow)),
      investments: page.filter(row => row.kind === 'investment').map(row =>
        JSON.parse(row.payload) as InvestmentTransaction),
      next: rows.length > limit ? page.at(-1)! : null,
    }
  }
}
