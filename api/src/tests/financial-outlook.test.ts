import { describe, expect, it, vi } from 'vitest'
import { FinancialOutlookService } from '../services/financial-outlook.service'
import type { FinancialOutlookSnapshotRow } from '../models/FinancialOutlook'

function row(overrides: Partial<FinancialOutlookSnapshotRow> = {}): FinancialOutlookSnapshotRow {
  return {
    id: 'snapshot-1',
    schema_version: 1,
    currency: 'HUF',
    source_revision: 4,
    source_queried_at: new Date().toISOString(),
    created_at: Date.now(),
    headline: 'Expected balances remain stable.',
    data_quality_score: 82,
    data_quality_label: 'high',
    payload: JSON.stringify({ horizons: [], cash_balance_history: [], drivers: ['Salary'], risks: [], assumptions: [], suggestions: [] }),
    source_coverage: JSON.stringify({ data_quality_reasons: ['Recent ledger activity'], sources: ['accounts', 'posted_transactions'] }),
    ...overrides,
  }
}

function serviceWith(rows: FinancialOutlookSnapshotRow[], revision = 4) {
  const repository = {
    findLatest: vi.fn(async () => rows[0] || null),
    currentRevision: vi.fn(async () => revision),
    findPage: vi.fn(async () => rows),
  }
  return new FinancialOutlookService(repository as never)
}

describe('FinancialOutlookService', () => {
  it('returns a latest snapshot with server-derived freshness and quality reasons', async () => {
    const snapshot = await serviceWith([row()]).getLatest()
    expect(snapshot).toMatchObject({
      id: 'snapshot-1',
      freshness: { status: 'up_to_date', data_changed: false },
      data_quality: { score: 82, label: 'high', reasons: ['Recent ledger activity'] },
    })
  })

  it('marks a snapshot stale when source data changed and returns a cursor for another page', async () => {
    const first = row({ created_at: 100, source_queried_at: new Date(Date.now() - 5 * 86_400_000).toISOString() })
    const second = row({ id: 'snapshot-2', created_at: 50 })
    const service = serviceWith([first, second], 5)
    const latest = await service.getLatest()
    const history = await service.getHistory(1)
    expect(latest?.freshness).toMatchObject({ status: 'data_changed', data_changed: true, regeneration_recommended: true })
    expect(history).toMatchObject({ snapshots: [expect.objectContaining({ id: 'snapshot-1' })], next_cursor: '100:snapshot-1' })
  })
})
