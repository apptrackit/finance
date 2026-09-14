import { FinancialOutlookSnapshot, FinancialOutlookSnapshotRow } from '../models/FinancialOutlook'
import { FinancialOutlookRepository } from '../repositories/financial-outlook.repository'

function recordFromJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export class FinancialOutlookService {
  constructor(private repository: FinancialOutlookRepository) {}

  private map(row: FinancialOutlookSnapshotRow, currentRevision: number): FinancialOutlookSnapshot {
    const payload = recordFromJson(row.payload)
    const coverage = recordFromJson(row.source_coverage)
    const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(row.source_queried_at)) / 86_400_000))
    const activeHorizons = [7, 30, 90].filter(days => ageDays < days)
    const expiredHorizons = [7, 30, 90].filter(days => ageDays >= days)
    const dataChanged = row.source_revision !== currentRevision
    const status = activeHorizons.length === 0
      ? 'historical'
      : expiredHorizons.length > 0
        ? 'partially_expired'
        : dataChanged
          ? 'data_changed'
          : ageDays >= 4
            ? 'refresh_recommended'
            : 'up_to_date'
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
        reasons: Array.isArray(coverage.data_quality_reasons) ? coverage.data_quality_reasons.filter((item): item is string => typeof item === 'string') : [],
      },
      source_coverage: coverage,
      horizons: Array.isArray(payload.horizons) ? payload.horizons as FinancialOutlookSnapshot['horizons'] : [],
      cash_balance_path: Array.isArray(payload.cash_balance_path) ? payload.cash_balance_path as FinancialOutlookSnapshot['cash_balance_path'] : [],
      cash_balance_history: Array.isArray(payload.cash_balance_history) ? payload.cash_balance_history as FinancialOutlookSnapshot['cash_balance_history'] : [],
      drivers: Array.isArray(payload.drivers) ? payload.drivers.filter((item): item is string => typeof item === 'string') : [],
      risks: Array.isArray(payload.risks) ? payload.risks.filter((item): item is string => typeof item === 'string') : [],
      assumptions: Array.isArray(payload.assumptions) ? payload.assumptions.filter((item): item is string => typeof item === 'string') : [],
      suggestions: Array.isArray(payload.suggestions) ? payload.suggestions.filter((item): item is string => typeof item === 'string') : [],
      freshness: {
        status,
        data_changed: dataChanged,
        age_days: ageDays,
        active_horizons: activeHorizons,
        expired_horizons: expiredHorizons,
        regeneration_recommended: dataChanged || ageDays >= 4 || expiredHorizons.length > 0,
      },
    }
  }

  async getLatest() {
    const [row, revision] = await Promise.all([this.repository.findLatest(), this.repository.currentRevision()])
    return row ? this.map(row, revision) : null
  }

  async getHistory(limit: number, cursor?: { createdAt: number; id: string }) {
    const [rows, revision] = await Promise.all([this.repository.findPage(limit, cursor), this.repository.currentRevision()])
    const hasMore = rows.length > limit
    const snapshots = rows.slice(0, limit).map(row => this.map(row, revision))
    const last = snapshots.at(-1)
    return {
      snapshots,
      next_cursor: hasMore && last ? `${Date.parse(last.created_at)}:${last.id}` : null,
    }
  }
}
