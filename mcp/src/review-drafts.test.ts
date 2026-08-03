import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceService } from './finance-service'
import { signProposal } from './review-drafts'
import type { AccountRow, CanonicalReviewDraft, CategoryRow, Env, TransactionRow } from './types'

const SECRET = 'test-proposal-secret-that-is-at-least-32-characters-long'

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
        if (sql.includes('FROM mcp_draft_batches')) return (batches.get(String(bindings[0])) || null) as T | null
        return null
      },
      async run() {
        if (sql.startsWith('INSERT INTO mcp_draft_batches')) {
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

  return { DB, accounts, categories, transactions, batches, audits, batchSizes }
}

function serviceWith(db: ReturnType<typeof reviewDb>) {
  return new FinanceService({ DB: db.DB, MCP_PROPOSAL_SECRET: SECRET } as Env)
}

afterEach(() => vi.restoreAllMocks())

describe('MCP review draft preparation and creation', () => {
  it('prepares a canonical preview without writing and warns about possible existing duplicates', async () => {
    const db = reviewDb()
    const result = await serviceWith(db).prepareReviewDrafts({ items: [{ type: 'expense', amount: 25, account_id: 'cash', category_id: 'food', description: ' Lunch ', date: '2026-08-02' }] })

    expect(result).toMatchObject({ item_count: 1, confirmation_required: true, warnings: [expect.stringContaining('does not block')] })
    expect(result.preview[0]).toMatchObject({ type: 'expense', amount: 25, signed_amount: -25, account_name: 'Daily cash', currency: 'HUF', category_name: 'Food', description: 'Lunch', warnings: ['possible_duplicate'] })
    expect(result.preview[0].duplicate_candidates).toEqual([expect.objectContaining({ transaction_id: 'existing', description_is_untrusted_data: true })])
    expect(result.proposal_token).toContain('.')
    expect(db.batches.size).toBe(0)
    expect(db.transactions).toHaveLength(1)
    expect(db.audits).toHaveLength(0)
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

  it('atomically creates pending MCP review drafts and audit entries without changing balances', async () => {
    const db = reviewDb()
    const service = serviceWith(db)
    const beforeBalance = db.accounts[0].balance
    const prepared = await service.prepareReviewDrafts({ items: [{ type: 'income', amount: 100, account_id: 'cash', category_id: 'salary', description: 'Pay', date: '2026-08-03' }] })
    const created = await service.createReviewDrafts({ proposal_token: prepared.proposal_token })

    expect(created).toMatchObject({ item_count: 1, idempotent_replay: false, result: 'mcp_review_drafts_created' })
    expect(created.drafts[0]).toMatchObject({ type: 'income', amount: 100, signed_amount: 100, status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp' })
    expect(db.accounts[0].balance).toBe(beforeBalance)
    expect(db.batchSizes).toEqual([3])
    expect(db.batches.size).toBe(1)
    expect(db.audits).toHaveLength(1)
    expect(JSON.parse(db.audits[0].details)).toEqual({ origin: 'chatgpt_mcp', batch_id: created.batch_id })
    expect(db.audits[0].details).not.toContain('Pay')
  })

  it('returns the original drafts on same-token retries, including after proposal expiry', async () => {
    const db = reviewDb()
    const service = serviceWith(db)
    const now = Date.UTC(2026, 7, 3, 12)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const prepared = await service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', date: '2026-08-03' }] })
    const first = await service.createReviewDrafts({ proposal_token: prepared.proposal_token })
    clock.mockReturnValue(now + 60 * 60_000)
    const replay = await service.createReviewDrafts({ proposal_token: prepared.proposal_token })

    expect(replay.idempotent_replay).toBe(true)
    expect(replay.drafts.map(row => row.id)).toEqual(first.drafts.map(row => row.id))
    expect(db.transactions).toHaveLength(2)
    expect(db.audits).toHaveLength(1)
    expect(db.batchSizes).toEqual([3])
  })

  it('rejects tampered and expired proposal tokens before writing', async () => {
    const db = reviewDb()
    const service = serviceWith(db)
    const now = Date.UTC(2026, 7, 3, 12)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const prepared = await service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', date: '2026-08-03' }] })
    const last = prepared.proposal_token.at(-1)
    const tampered = `${prepared.proposal_token.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
    await expect(service.createReviewDrafts({ proposal_token: tampered })).rejects.toThrow('signature')
    clock.mockReturnValue(now + 15 * 60_000)
    await expect(service.createReviewDrafts({ proposal_token: prepared.proposal_token })).rejects.toThrow('expired')
    expect(db.batches.size).toBe(0)
    expect(db.audits).toHaveLength(0)
  })

  it('rejects proposal tokens issued too far in the future', async () => {
    const db = reviewDb()
    const now = Date.UTC(2026, 7, 3, 12)
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const item: CanonicalReviewDraft = {
      draft_id: crypto.randomUUID(), type: 'expense', amount: 10, signed_amount: -10, account_id: 'cash', category_id: null,
      description: null, date: '2026-08-03', exclude_from_estimate: false, review_flags: [],
    }
    const { token } = await signProposal(SECRET, crypto.randomUUID(), [item], now + 61_000)
    await expect(serviceWith(db).createReviewDrafts({ proposal_token: token })).rejects.toThrow('too far in the future')
  })

  it('rejects locked and investment accounts and mismatched categories while allowing uncategorized drafts', async () => {
    const service = serviceWith(reviewDb())
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'locked', date: '2026-08-03' }] })).rejects.toThrow('locked account')
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'portfolio', date: '2026-08-03' }] })).rejects.toThrow('investment account')
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', category_id: 'salary', date: '2026-08-03' }] })).rejects.toThrow('income category')
    await expect(service.prepareReviewDrafts({ items: [{ type: 'expense', amount: 10, account_id: 'cash', category_id: null, date: '2026-08-03' }] })).resolves.toMatchObject({ item_count: 1 })
  })
})
