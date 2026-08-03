export type PendingKind = 'upcoming' | 'mcp_review'
export type ReviewSource = 'manual' | 'chatgpt_mcp'

export type ReviewableTransaction = {
  pending_kind?: PendingKind | null
  review_source?: ReviewSource | null
  review_flags?: unknown
}

export const isMcpReviewTransaction = (transaction: ReviewableTransaction) =>
  transaction.pending_kind === 'mcp_review'

// Projections are deliberately opt-in. A newly introduced pending kind must not
// affect financial totals until it has been reviewed explicitly.
export const isUpcomingProjectionTransaction = (transaction: ReviewableTransaction) =>
  transaction.pending_kind === 'upcoming'

export const normalizeReviewFlags = (flags: unknown): string[] => {
  if (Array.isArray(flags)) {
    return flags.filter((flag): flag is string => typeof flag === 'string')
  }

  if (typeof flags !== 'string' || !flags.trim()) return []

  try {
    const parsed: unknown = JSON.parse(flags)
    if (Array.isArray(parsed)) {
      return parsed.filter((flag): flag is string => typeof flag === 'string')
    }
  } catch {
    // Older or third-party API responses may return one plain-text flag.
  }

  return [flags]
}

export const hasPossibleDuplicateFlag = (flags: unknown) =>
  normalizeReviewFlags(flags).some(flag => {
    const normalized = flag.trim().toLowerCase().replace(/[\s-]+/g, '_')
    return normalized === 'possible_duplicate' || normalized.includes('duplicate')
  })
