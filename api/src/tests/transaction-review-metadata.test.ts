import { describe, expect, it, vi } from 'vitest'
import { TransactionMapper } from '../mappers/transaction.mapper'
import { TransactionRepository } from '../repositories/transaction.repository'

function createDb(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string; values: unknown[] }> = []

  const db = {
    prepare: vi.fn((sql: string) => {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values
          calls.push({ sql, values })
          return this
        },
        async all<T>() {
          return { results: rows as T[] }
        },
        async first<T>() {
          return (rows[0] as T | undefined) || null
        },
        async run() {
          return { meta: { changes: 1 } }
        },
      }
      return statement
    }),
  }

  return { db: db as unknown as D1Database, calls }
}

describe('transaction review metadata', () => {
  it('maps persisted MCP metadata and parses review flags', async () => {
    const { db } = createDb([{
      id: 'tx-1',
      account_id: 'account-1',
      category_id: null,
      amount: -250,
      description: 'Market',
      date: '2026-08-03',
      linked_transaction_id: null,
      exclude_from_estimate: 0,
      status: 'pending',
      pending_kind: 'mcp_review',
      review_source: 'chatgpt_mcp',
      review_batch_id: 'batch-1',
      review_flags: '["possible_duplicate"]',
    }])

    const transactions = await new TransactionRepository(db).findUpcoming()

    expect(transactions[0]).toMatchObject({
      pending_kind: 'mcp_review',
      review_source: 'chatgpt_mcp',
      review_batch_id: 'batch-1',
      review_flags: ['possible_duplicate'],
    })
  })

  it('uses safe metadata defaults for legacy rows and malformed flags', async () => {
    const { db } = createDb([{
      id: 'tx-1',
      account_id: 'account-1',
      amount: 250,
      date: '2026-08-03',
      exclude_from_estimate: 0,
      status: 'pending',
      review_flags: '{"not":"an-array"}',
    }])

    const transaction = await new TransactionRepository(db).findById('tx-1')

    expect(transaction).toMatchObject({
      pending_kind: 'upcoming',
      review_source: 'manual',
      review_flags: [],
    })
  })

  it('persists normalized metadata for repository-created transactions', async () => {
    const { db, calls } = createDb()
    const repository = new TransactionRepository(db)

    await repository.create({
      id: 'tx-1',
      account_id: 'account-1',
      amount: -250,
      date: '2026-08-03',
      status: 'pending',
      pending_kind: 'mcp_review',
      review_source: 'chatgpt_mcp',
      review_batch_id: 'batch-1',
      review_flags: ['possible_duplicate'],
    })

    expect(calls[0].values.slice(8, 13)).toEqual([
      'pending',
      'mcp_review',
      'chatgpt_mcp',
      'batch-1',
      '["possible_duplicate"]',
    ])
  })

  it('exposes normalized review metadata in API response DTOs', () => {
    const response = TransactionMapper.toResponseDto({
      id: 'tx-1',
      account_id: 'account-1',
      amount: -250,
      date: '2026-08-03',
      status: 'pending',
      pending_kind: 'mcp_review',
      review_source: 'chatgpt_mcp',
      review_batch_id: 'batch-1',
      review_flags: ['possible_duplicate'],
    })

    expect(response).toMatchObject({
      pending_kind: 'mcp_review',
      review_source: 'chatgpt_mcp',
      review_batch_id: 'batch-1',
      review_flags: ['possible_duplicate'],
    })
  })
})
