import { describe, expect, it } from 'vitest'
import {
  hasPossibleDuplicateFlag,
  getMcpReviewBalanceDeltas,
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
