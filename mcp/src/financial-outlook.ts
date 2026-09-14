export type OutlookRange = { low: number; expected: number; high: number }

export type OutlookHorizon = {
  days: 7 | 30 | 90
  cash_balance: OutlookRange
}

export type CashBalancePathPoint = OutlookRange & { day: number }

export type FinancialOutlookInput = {
  idempotency_key: string
  source_revision: number
  source_queried_at: string
  headline: string
  horizons: OutlookHorizon[]
  cash_balance_path: CashBalancePathPoint[]
  drivers: string[]
  risks: string[]
  assumptions: string[]
  suggestions: string[]
}

export type FinancialOutlookSnapshotRow = {
  id: string
  idempotency_key: string
  payload_hash: string
  schema_version: number
  currency: 'HUF'
  source_revision: number
  source_queried_at: string
  created_at: number
  headline: string
  data_quality_score: number
  data_quality_label: 'high' | 'moderate' | 'limited'
  payload: string
  source_coverage: string
}

const MAX_AMOUNT = 1_000_000_000_000_000
const MAX_TEXT = 280

function cleanText(value: unknown, path: string, max = MAX_TEXT) {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`)
  const text = value.trim()
  if (!text) throw new Error(`${path} must not be empty`)
  if (text.length > max) throw new Error(`${path} must be at most ${max} characters`)
  return text
}

function textList(value: unknown, path: string, maxItems: number, maxLength = MAX_TEXT) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${path} must contain at most ${maxItems} text items`)
  return value.map((item, index) => cleanText(item, `${path}[${index}]`, maxLength))
}

function finiteAmount(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_AMOUNT) {
    throw new Error(`${path} must be a finite amount within the supported range`)
  }
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function range(value: unknown, path: string): OutlookRange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  const candidate = value as Record<string, unknown>
  const result = {
    low: finiteAmount(candidate.low, `${path}.low`),
    expected: finiteAmount(candidate.expected, `${path}.expected`),
    high: finiteAmount(candidate.high, `${path}.high`),
  }
  if (result.low > result.expected || result.expected > result.high) {
    throw new Error(`${path} must satisfy low <= expected <= high`)
  }
  return result
}

function horizon(value: unknown, index: number): OutlookHorizon {
  const path = `horizons[${index}]`
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  const candidate = value as Record<string, unknown>
  const days = candidate.days
  if (days !== 7 && days !== 30 && days !== 90) throw new Error(`${path}.days must be 7, 30, or 90`)
  return {
    days,
    cash_balance: range(candidate.cash_balance, `${path}.cash_balance`),
  }
}

function cashBalancePath(value: unknown, horizons: OutlookHorizon[]): CashBalancePathPoint[] {
  if (!Array.isArray(value) || value.length !== 91) {
    throw new Error('cash_balance_path must contain one projection for every day from day 0 through day 90')
  }
  const points = value.map((item, index) => {
    const path = `cash_balance_path[${index}]`
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${path} must be an object`)
    const candidate = item as Record<string, unknown>
    if (!Number.isInteger(candidate.day) || (candidate.day as number) < 0 || (candidate.day as number) > 90) {
      throw new Error(`${path}.day must be a whole number from 0 to 90`)
    }
    return { day: candidate.day as number, ...range(candidate, path) }
  })
  if (points.some((point, index) => point.day !== index)) {
    throw new Error('cash_balance_path must include each whole day from day 0 through day 90 in order')
  }
  for (const horizon of horizons) {
    const pathPoint = points.find(point => point.day === horizon.days)
    if (!pathPoint || pathPoint.low !== horizon.cash_balance.low || pathPoint.expected !== horizon.cash_balance.expected || pathPoint.high !== horizon.cash_balance.high) {
      throw new Error(`cash_balance_path must include the exact ${horizon.days}-day cash range`)
    }
  }
  return points
}

export function parseFinancialOutlookInput(value: Record<string, unknown>): FinancialOutlookInput {
  const idempotencyKey = cleanText(value.idempotency_key, 'idempotency_key', 128)
  if (idempotencyKey.length < 8) throw new Error('idempotency_key must be at least 8 characters')
  if (typeof value.source_revision !== 'number' || !Number.isInteger(value.source_revision) || value.source_revision < 0) {
    throw new Error('source_revision must be a non-negative integer')
  }
  const sourceQueriedAt = cleanText(value.source_queried_at, 'source_queried_at', 64)
  if (Number.isNaN(Date.parse(sourceQueriedAt))) throw new Error('source_queried_at must be an ISO timestamp')
  if (!Array.isArray(value.horizons) || value.horizons.length !== 3) throw new Error('horizons must contain exactly the 7, 30, and 90 day outlooks')
  const horizons = value.horizons.map(horizon).sort((a, b) => a.days - b.days)
  if (horizons.map(item => item.days).join(',') !== '7,30,90') throw new Error('horizons must contain one each of 7, 30, and 90 days')
  return {
    idempotency_key: idempotencyKey,
    source_revision: value.source_revision,
    source_queried_at: sourceQueriedAt,
    headline: cleanText(value.headline, 'headline', 240),
    horizons,
    cash_balance_path: cashBalancePath(value.cash_balance_path, horizons),
    drivers: textList(value.drivers, 'drivers', 4),
    risks: textList(value.risks, 'risks', 4),
    assumptions: textList(value.assumptions, 'assumptions', 5),
    suggestions: textList(value.suggestions, 'suggestions', 3),
  }
}

export async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function parseSnapshot(row: FinancialOutlookSnapshotRow) {
  return {
    id: row.id,
    schema_version: row.schema_version,
    currency: row.currency,
    source_revision: row.source_revision,
    source_queried_at: row.source_queried_at,
    created_at: new Date(row.created_at).toISOString(),
    headline: row.headline,
    data_quality: {
      score: row.data_quality_score,
      label: row.data_quality_label,
    },
    source_coverage: JSON.parse(row.source_coverage),
    ...JSON.parse(row.payload),
  }
}
