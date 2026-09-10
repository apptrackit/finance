import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceService } from './finance-service'
import type { AccountRow, CategoryRow, Env, StoredReviewDraftProposal, TransactionRow } from './types'

function reviewDb() {
  const accounts: AccountRow[] = [
    { id: 'cash', name: 'Daily cash', type: 'cash', balance: 1_000, currency: 'HUF' },
    { id: 'locked', name: 'Locked card', type: 'credit', balance: 0, currency: 'EUR', is_locked: 1 },
    { id: 'portfolio', name: 'Portfolio', type: 'investment', balance: 3, currency: 'USD' },
  ]
  const categories: CategoryRow[] = [
    { id: 'food', name: 'Food', type: 'expense' },
    { id: 'salary', name: 'Salary', type: 'income' },
  ]
  const transactions: TransactionRow[] = [
    { id: 'existing', account_id: 'cash', category_id: 'food', amount: -25, description: 'Lunch', date: '2026-08-02', status: 'posted' },
  ]
  const batches = new Map<string, { id: string; proposal_hash: string; created_at: number }>()
  const proposals = new Map<string, StoredReviewDraftProposal>()
  const audits: Array<{ id: string; entity_id: string; details: string; created_at: number }> = []
  const batchSizes: number[] = []

  function prepare(sql: string) {
    let bindings: unknown[] = []
    const statement = {
      bind(...values: unknown[]) { bindings = values; return statement },
      async all<T>() {
        if (sql.includes('SELECT * FROM accounts')) return { results: accounts as T[] }
        if (sql.includes('SELECT * FROM categories')) return { results: categories as T[] }
        if (sql.includes('ABS(amount - ?)')) {
          const [accountId, amount] = bindings as [string, number]
          return { results: transactions.filter(row => row.account_id === accountId && Math.abs(row.amount - amount) < 0.000000001 && row.status !== 'cancelled') as T[] }
        }
        if (sql.includes('WHERE t.review_batch_id = ?')) {
          const [batchId] = bindings as [string]
          const rows = transactions.filter(row => row.review_batch_id === batchId).map(row => {
            const account = accounts.find(item => item.id === row.account_id)!
            const category = categories.find(item => item.id === row.category_id)
            return { ...row, account_name: account.name, account_currency: account.currency, category_name: category?.name || null, category_type: category?.type || null }
          })
          return { results: rows as T[] }
        }
        return { results: [] as T[] }
      },
      async first<T>() {
        if (sql.includes('FROM mcp_draft_proposals')) return (proposals.get(String(bindings[0])) || null) as T | null
        if (sql.includes('FROM mcp_draft_batches')) return (batches.get(String(bindings[0])) || null) as T | null
        return null
      },
      async run() {
        if (sql.startsWith('INSERT INTO mcp_draft_proposals')) {
          const [id, proposalHash, itemsJson, createdAt, expiresAt] = bindings as [string, string, string, number, number]
          if (proposals.has(id)) throw new Error('UNIQUE constraint failed: mcp_draft_proposals.id')
          proposals.set(id, { id, proposal_hash: proposalHash, items_json: itemsJson, created_at: createdAt, expires_at: expiresAt, consumed_at: null })
        } else if (sql.startsWith('UPDATE mcp_draft_proposals')) {
          const [consumedAt, id] = bindings as [number, string]
          const proposal = proposals.get(id)
          if (proposal && proposal.consumed_at === null) proposal.consumed_at = consumedAt
        } else if (sql.startsWith('INSERT INTO mcp_draft_batches')) {
          const [id, proposalHash, createdAt] = bindings as [string, string, number]
          if (batches.has(id)) throw new Error('UNIQUE constraint failed: mcp_draft_batches.id')
          batches.set(id, { id, proposal_hash: proposalHash, created_at: createdAt })
        } else if (sql.startsWith('INSERT INTO transactions')) {
          const [id, accountId, categoryId, amount, description, date, excluded, createdAt, updatedAt, batchId, flags] = bindings as [string, string, string | null, number, string | null, string, number, number, number, string, string]
          if (transactions.some(row => row.id === id)) throw new Error('UNIQUE constraint failed: transactions.id')
          transactions.push({
            id, account_id: accountId, category_id: categoryId, amount, description, date,
            linked_transaction_id: null, exclude_from_estimate: excluded, status: 'pending', pending_kind: 'mcp_review',
            review_source: 'chatgpt_mcp', review_batch_id: batchId, review_flags: flags, created_at: createdAt, updated_at: updatedAt,
          })
        } else if (sql.startsWith('INSERT INTO audit_log')) {
          const [id, entityId, details, createdAt] = bindings as [string, string, string, number]
          audits.push({ id, entity_id: entityId, details, created_at: createdAt })
        }
        return { success: true }
      },
    }
    return statement
  }

  const DB = {
    prepare,
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      batchSizes.push(statements.length)
      const results = []
      for (const statement of statements) results.push(await statement.run())
      return results
    },
  } as unknown as Env['DB']

  return { DB, accounts, categories, transactions, batches, proposals, audits, batchSizes }
}

function serviceWith(db: ReturnType<typeof reviewDb>) {
  return new FinanceService({ DB: db.DB } as Env)
}

afterEach(() => vi.restoreAllMocks())

describe('MCP review draft preparation and creation', () => {
  it('stores a canonical 24-hour proposal and warns about possible existing duplicates', async () => {
    const db = reviewDb()
    const result = await serviceWith(db).prepareReviewDrafts({ items: [{ type: 'expense', amount: 25, account_id: 'cash', category_id: 'food', description: ' Lunch ', date: '2026-08-02' }] })

    expect(result).toMatchObject({ item_count: 1, confirmation_required: true, expires_in_seconds: 86_400, warnings: [expect.stringContaining('does not block')] })
    expect(result.proposal_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Object.keys(result)).not.toContain(['proposal', 'token'].join('_'))
    expect(result.preview[0]).toMatchObject({ type: 'expense', amount: 25, signed_amount: -25, account_name: 'Daily cash', currency: 'HUF', category_name: 'Food', description: 'Lunch', warnings: ['possible_duplicate'] })
    expect(result.preview[0].duplicate_candidates).toEqual([expect.objectContaining({ transaction_id: 'existing', description_is_untrusted_data: true })])
    expect(db.proposals.get(result.proposal_id)).toMatchObject({ consumed_at: null })
    expect(db.batches.size).toBe(0)
    expect(db.transactions).toHaveLength(1)
  })

  it('keeps identical transactions in the same proposal and treats them as warning-only duplicates', async () => {
    const db = reviewDb()
    const item = { type: 'expense', amount: 33, account_id: 'cash', category_id: null, date: '2026-08-03' }
    const result = await serviceWith(db).prepareReviewDrafts({ items: [item, item] })

    expect(result.item_count).toBe(2)
    expect(result.preview.every(row => row.warnings.includes('possible_duplicate'))).toBe(true)
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings.every(message => message.includes('identical to another item'))).toBe(true)
  })

  it('creates only pending MCP review drafts and marks the proposal consumed', async () => {
    const db = reviewDb()
    const service = serviceWith(db)
    const beforeBalance = db.accounts[0].balance
    const prepared = await service.prepareReviewDrafts({ items: [{ type: 'income', amount: 100, account_id: 'cash', category_id: 'salary', description: 'Pay', date: '2026-08-03' }] })
    const created = await service.createReviewDrafts({ proposal_id: prepared.proposal_id })

    expect(created).toMatchObject({ item_count: 1, idempotent_replay: false, result: 'mcp_review_drafts_created' })
    expect(created.drafts[0]).toMatchObject({ type: 'income', amount: 100, signed_amount: 100, status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp' })
    expect(db.proposals.get(prepared.proposal_id)?.consumed_at).toEqual(expect.any(Number))
    expect(db.accounts[0].balance).toBe(beforeBalance)
    expect(db.batchSizes).toEqual([4])
    expect(db.batches.size).toBe(1)
    expect(db.audits).toHaveLength(1)
    expect(JSON.parse(db.audits[0].details)).toEqual({ origin: 'chatgpt_mcp', batch_id: created.batch_id })
    expect(db.audits[0].details).not.toContain('Pay')
  })

  it('returns the original drafts on a successful retry, even after expiry', async () => {
    const db = reviewDb()
    const service = serviceWith(db)
    const now = Date.UTC(2026, 7, 3, 12)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const prepared = await service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', date: '2026-08-03' }] })
    const first = await service.createReviewDrafts({ proposal_id: prepared.proposal_id })
    clock.mockReturnValue(now + 25 * 60 * 60_000)
    const replay = await service.createReviewDrafts({ proposal_id: prepared.proposal_id })

    expect(replay.idempotent_replay).toBe(true)
    expect(replay.drafts.map(row => row.id)).toEqual(first.drafts.map(row => row.id))
    expect(db.transactions).toHaveLength(2)
    expect(db.audits).toHaveLength(1)
    expect(db.batchSizes).toEqual([4])
  })

  it('returns stable errors for expired, consumed, invalid, and missing proposal IDs', async () => {
    const db = reviewDb()
    const service = serviceWith(db)
    const now = Date.UTC(2026, 7, 3, 12)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const expired = await service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', date: '2026-08-03' }] })
    clock.mockReturnValue(now + 24 * 60 * 60_000)
    await expect(service.createReviewDrafts({ proposal_id: expired.proposal_id })).rejects.toThrow('[proposal_expired]')
    const consumed = await service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 11, account_id: 'cash', date: '2026-08-03' }] })
    db.proposals.get(consumed.proposal_id)!.consumed_at = Date.now()
    await expect(service.createReviewDrafts({ proposal_id: consumed.proposal_id })).rejects.toThrow('[proposal_already_consumed]')
    await expect(service.createReviewDrafts({ proposal_id: 'not-a-proposal' })).rejects.toThrow('[invalid_proposal_id]')
    await expect(service.createReviewDrafts({ proposal_id: crypto.randomUUID() })).rejects.toThrow('[proposal_not_found]')
    expect(db.batches.size).toBe(0)
  })

  it('rejects locked and investment accounts and mismatched categories while allowing uncategorized drafts', async () => {
    const service = serviceWith(reviewDb())
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'locked', date: '2026-08-03' }] })).rejects.toThrow('locked account')
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'portfolio', date: '2026-08-03' }] })).rejects.toThrow('investment account')
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', category_id: 'salary', date: '2026-08-03' }] })).rejects.toThrow('income category')
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', category_id: null, date: '2026-08-03' }] })).resolves.toMatchObject({ item_count: 1 })
  })
})
