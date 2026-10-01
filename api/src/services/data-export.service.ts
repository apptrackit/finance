import { EXPORT_EXCLUSIONS, EXPORT_TABLES, EXPORT_VERSION, MAX_EXPORT_BYTES, type DataExport } from '../../../shared/data-export'
import { AppError } from '../errors/codes'
import { DataExportRepository } from '../repositories/data-export.repository'

export class DataExportService {
  constructor(private repository: DataExportRepository) {}

  async exportJSON(): Promise<string> {
    let snapshot: Awaited<ReturnType<DataExportRepository['readSnapshot']>>
    try {
      snapshot = await this.repository.readSnapshot()
    } catch (error) {
      if (error instanceof AppError) throw error
      // Do not expose SQL errors or financial payloads in the response/logs.
      throw AppError.internal('The data export could not read every table. Please retry.')
    }
    const exported: DataExport = {
      format: 'finance-manager-data-export',
      exportVersion: EXPORT_VERSION,
      schemaVersion: snapshot.migrations[snapshot.migrations.length - 1],
      migrations: snapshot.migrations,
      exportedAt: new Date().toISOString(),
      manifest: {
        tables: Object.fromEntries(EXPORT_TABLES.map(table => [table, { rowCount: snapshot.data[table].length }])) as DataExport['manifest']['tables'],
        excluded: EXPORT_EXCLUSIONS,
        restoreSupported: false,
      },
      data: snapshot.data,
    }
    const json = JSON.stringify(exported)
    if (new TextEncoder().encode(json).byteLength > MAX_EXPORT_BYTES) {
      throw AppError.internal('The data export exceeds 16 MiB. Use a D1 database export for larger datasets.')
    }
    return json
  }
}
