import { FinancialOutlookSnapshotRow } from '../models/FinancialOutlook'

export class FinancialOutlookRepository {
  constructor(private db: D1Database) {}

  async findLatest(): Promise<FinancialOutlookSnapshotRow | null> {
    return this.db.prepare('SELECT id, schema_version, currency, source_revision, source_queried_at, created_at, headline, data_quality_score, data_quality_label, payload, source_coverage FROM financial_outlook_snapshots ORDER BY created_at DESC, id DESC LIMIT 1')
      .first<FinancialOutlookSnapshotRow>()
  }

  async currentRevision() {
    const result = await this.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<{ revision: number }>()
    return result?.revision ?? 0
  }

  async findPage(limit: number, cursor?: { createdAt: number; id: string }) {
    const query = cursor
      ? 'SELECT id, schema_version, currency, source_revision, source_queried_at, created_at, headline, data_quality_score, data_quality_label, payload, source_coverage FROM financial_outlook_snapshots WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT ?'
      : 'SELECT id, schema_version, currency, source_revision, source_queried_at, created_at, headline, data_quality_score, data_quality_label, payload, source_coverage FROM financial_outlook_snapshots ORDER BY created_at DESC, id DESC LIMIT ?'
    const statement = this.db.prepare(query)
    const result = cursor
      ? await statement.bind(cursor.createdAt, cursor.createdAt, cursor.id, limit + 1).all<FinancialOutlookSnapshotRow>()
      : await statement.bind(limit + 1).all<FinancialOutlookSnapshotRow>()
    return result.results
  }
}
