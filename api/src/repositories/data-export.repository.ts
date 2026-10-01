import { EXPORT_TABLES, MAX_EXPORT_ROWS_PER_TABLE, type ExportRow, type ExportTables } from '../../../shared/data-export'
import { AppError } from '../errors/codes'

export class DataExportRepository {
  constructor(private db: D1Database) {}

  async readSnapshot(): Promise<{ data: ExportTables; migrations: string[] }> {
    // D1 batch executes as one SQL transaction. All identifiers come from this
    // fixed allowlist; LIMIT + 1 detects overflow rather than silently truncating.
    const results = await this.db.batch<ExportRow>([
      ...EXPORT_TABLES.map(table => this.db.prepare(
        `SELECT * FROM ${table} ORDER BY ${table === 'app_settings' ? 'key' : 'id'} LIMIT ?`
      ).bind(MAX_EXPORT_ROWS_PER_TABLE + 1)),
      this.db.prepare('SELECT migration_name FROM migration_history ORDER BY migration_name'),
    ])
    if (results.length !== EXPORT_TABLES.length + 1
      || results.some(result => !result.success || !Array.isArray(result.results))) {
      throw AppError.internal('The data export could not read every table. Please retry.')
    }
    const data = {} as ExportTables
    EXPORT_TABLES.forEach((table, index) => {
      const rows = results[index].results
      if (rows.length > MAX_EXPORT_ROWS_PER_TABLE) {
        throw AppError.internal(`The data export exceeds ${MAX_EXPORT_ROWS_PER_TABLE} rows in ${table}. Use a D1 database export for larger datasets.`)
      }
      data[table] = rows
    })
    const migrations = results[EXPORT_TABLES.length].results.map(row => row.migration_name)
    if (!migrations.length || !migrations.every(name => typeof name === 'string')) {
      throw AppError.internal('The data export could not verify database schema metadata.')
    }
    return { data, migrations }
  }
}
