import { describe, expect, it } from 'vitest'
import {
  hasPossibleDuplicateFlag,
  getMcpReviewBalanceDeltas,
  getMcpReviewItems,
  isMcpReviewTransaction,
  isUpcomingProjectionTransaction,
  normalizeReviewFlags,
} from './transaction-review'

describe('transaction review helpers', () => {
  it('keeps MCP review drafts out of projections', () => {
    expect(isMcpReviewTransaction({ pending_kind: 'mcp_review' })).toBe(true)
    expect(isUpcomingProjectionTransaction({ pending_kind: 'mcp_review' })).toBe(false)
    expect(isUpcomingProjectionTransaction({ pending_kind: 'upcoming' })).toBe(true)
    expect(isUpcomingProjectionTransaction({})).toBe(false)
  })

  it('totals MCP review drafts by account for an acceptance preview', () => {
    expect([...getMcpReviewBalanceDeltas([
      { pending_kind: 'mcp_review', account_id: 'cash', amount: -1200 },
      { pending_kind: 'mcp_review', account_id: 'cash', amount: 250 },
      { pending_kind: 'mcp_review', account_id: 'savings', amount: 100 },
      { pending_kind: 'upcoming', account_id: 'cash', amount: -99 },
    ])]).toEqual([
      ['cash', -950],
      ['savings', 100],
    ])
  })

  it('shows one debit-led transfer item when either or both legs match a review filter', () => {
    const rows = [
      { id: 'debit', linked_transaction_id: 'credit', pending_kind: 'mcp_review' as const, amount: -20, account_id: 'checking' },
      { id: 'credit', linked_transaction_id: 'debit', pending_kind: 'mcp_review' as const, amount: 20, account_id: 'savings' },
      { id: 'ordinary', pending_kind: 'mcp_review' as const, amount: -5, account_id: 'checking' },
    ]
    expect(getMcpReviewItems(rows, () => true).map(item => item.id)).toEqual(['debit', 'ordinary'])
    expect(getMcpReviewItems(rows, item => item.account_id === 'savings').map(item => item.id)).toEqual(['debit'])
  })

  it('normalizes flags returned as an array or JSON text', () => {
    expect(normalizeReviewFlags(['possible_duplicate', 42, 'needs_review'])).toEqual([
      'possible_duplicate',
      'needs_review',
    ])
    expect(normalizeReviewFlags('["possible_duplicate"]')).toEqual(['possible_duplicate'])
  })

  it('recognizes duplicate warnings defensively', () => {
    expect(hasPossibleDuplicateFlag('Possible duplicate')).toBe(true)
    expect(hasPossibleDuplicateFlag('["possible-duplicate"]')).toBe(true)
    expect(hasPossibleDuplicateFlag(['needs_review'])).toBe(false)
  })
})
