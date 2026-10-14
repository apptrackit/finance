import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'
import type { TransactionResponseDto } from '../../api/src/dtos/transaction.dto'
import type { InvestmentTransactionResponseDto } from '../../api/src/dtos/investment-transaction.dto'

type Page = { transactions: TransactionResponseDto[]; investments: InvestmentTransactionResponseDto[]; revision: number; nextCursor: string | null }

describe('bounded cash and investment history', () => {
  const f = useFinanceWorkers()
  beforeEach(async () => {
    await f.seed()
    await f.db.batch([
      f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at, archived_at) VALUES ('investment', 'Old investment', 'investment', 0, 'USD', 1, NULL)"),
      f.db.prepare(`WITH RECURSIVE rows(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM rows WHERE n < 505)
        INSERT INTO transactions (id, account_id, amount, date, status, exclude_from_estimate, review_flags)
        SELECT printf('tx-%04d', n), 'cash', -n, CASE WHEN n <= 500 THEN '2026-01-15' ELSE '2025-12-31' END,
          'posted', n % 2, '["synthetic"]' FROM rows`),
      f.db.prepare("INSERT INTO transactions (id, account_id, amount, date, status, linked_transaction_id) VALUES ('debit', 'cash', -10, '2026-01-15', 'posted', 'credit'), ('credit', 'savings', 10, '2026-01-15', 'posted', 'debit')"),
      f.db.prepare("INSERT INTO transactions (id, account_id, amount, date, status, pending_kind, review_source) VALUES ('review', 'cash', -999, '2026-01-15', 'pending', 'mcp_review', 'chatgpt_mcp'), ('upcoming', 'cash', -888, '2026-01-16', 'pending', 'upcoming', 'manual'), ('cancelled', 'cash', -777, '2026-01-15', 'cancelled', 'upcoming', 'manual')"),
      // An ID shared across tables and identical dates must not lose a row.
      f.db.prepare("INSERT INTO investment_transactions (id, account_id, type, quantity, price, total_amount, date, notes, created_at) VALUES ('tx-0505', 'investment', 'buy', 0.1234567, 100, 12.34567, '2026-01-15', 'Synthetic purchase', 1), ('sale', 'investment', 'sell', 0.0234567, 100, 2.34567, '2025-12-31', 'Synthetic sale', 2)"),
      f.db.prepare("UPDATE accounts SET archived_at = 1 WHERE id = 'investment'"),
    ])
  })

  async function collect(range = '') {
    let nextCursor: string | null = null
    const transactions: TransactionResponseDto[] = []
    const investments: InvestmentTransactionResponseDto[] = []
    const revisions = new Set<number>()
    let pages = 0
    do {
      const response = await f.request(`/transactions/history?limit=100${range}${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''}`)
      expect(response.status, await response.clone().text()).toBe(200)
      const page = await response.json() as Page
      expect(page.transactions.length + page.investments.length).toBeLessThanOrEqual(100)
      transactions.push(...page.transactions)
      investments.push(...page.investments)
      revisions.add(page.revision)
      nextCursor = page.nextCursor
      expect(++pages).toBeLessThan(10)
    } while (nextCursor)
    expect(revisions.size).toBe(1)
    return { transactions, investments, pages }
  }

  it('keeps complete posted history, transfer links, flags, archived investments and fractional quantities across pages', async () => {
    const balances = await f.balances()
    const collected = await collect()
    const cash = await (await f.request('/transactions')).json() as TransactionResponseDto[]
    const investments = await (await f.request('/investment-transactions?account_id=investment')).json() as InvestmentTransactionResponseDto[]
    const sorted = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id))
    expect(sorted(collected.transactions)).toEqual(sorted(cash))
    expect(sorted(collected.investments)).toEqual(sorted(investments))
    expect(collected.pages).toBe(6)
    // Match the retained cash endpoint's date/rowid order, so newly saved
    // same-day transactions are not buried by random UUID ordering.
    const ordered = await collect()
    const legacy = await (await f.request('/transactions')).json() as TransactionResponseDto[]
    expect(ordered.transactions.map(row => row.id)).toEqual(legacy.map(row => row.id))
    expect(new Set(collected.transactions.map(row => row.id)).size).toBe(507)
    expect(collected.transactions.find(row => row.id === 'debit')?.linked_transaction_id).toBe('credit')
    expect(collected.transactions.find(row => row.id === 'tx-0001')).toMatchObject({ exclude_from_estimate: true, review_flags: ['synthetic'] })
    expect(await f.balances()).toEqual(balances)
  })

  it('filters both kinds by inclusive dates, including an exact full page and empty periods', async () => {
    const collected = await collect('&startDate=2026-01-15&endDate=2026-01-15')
    expect(collected.transactions).toHaveLength(502)
    expect(collected.investments.map(row => row.id)).toEqual(['tx-0505'])
    expect((await collect('&startDate=2024-01-01&endDate=2024-01-31')).transactions).toEqual([])
    const exact = await (await f.request('/transactions/history?limit=6&startDate=2025-12-31&endDate=2025-12-31')).json() as Page
    expect(exact.transactions.length + exact.investments.length).toBe(6)
    expect(exact.nextCursor).toBeNull()
    const december = await collect('&startDate=2025-12-31&endDate=2025-12-31')
    expect(december.transactions).toHaveLength(5)
    expect(december.investments[0]).toMatchObject({ type: 'sell', quantity: 0.0234567 })
  })

  it('rejects a changed ledger cursor and permits unresolved review edits without changing posted history', async () => {
    const first = await (await f.request('/transactions/history?limit=2')).json() as Page
    const path = `/transactions/history?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`
    await f.db.prepare("UPDATE transactions SET description = 'Corrected draft' WHERE id = 'review'").run()
    expect((await f.request(path)).status).toBe(200)
    await f.db.prepare("UPDATE transactions SET amount = -99 WHERE id = 'tx-0001'").run()
    const response = await f.request(path)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'HISTORY_CHANGED' })
    expect((await collect()).transactions.find(row => row.id === 'tx-0001')?.amount).toBe(-99)
  })

  it('validates calendar dates, bounds, unknown fields, malformed cursors, and range-bound cursors', async () => {
    for (const query of ['limit=0', 'limit=501', 'limit=1.5', 'limit=abc', 'startDate=2026-01-01',
      'startDate=2026-02-30&endDate=2026-03-01', 'startDate=2026-03-01&endDate=2026-02-01',
      'cursor=invalid', 'sql=DROP', 'cursor=']) {
      expect((await f.request(`/transactions/history?${query}`)).status, query).toBe(400)
    }
    const page = await (await f.request('/transactions/history?limit=2&startDate=2026-01-15&endDate=2026-01-15')).json() as Page
    expect((await f.request(`/transactions/history?cursor=${encodeURIComponent(page.nextCursor!)}`)).status).toBe(400)
    expect((await f.api.fetch('/transactions/history')).status).toBe(403)
  })
})
