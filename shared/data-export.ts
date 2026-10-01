// Explicit coverage: adding a durable table requires updating this contract.
export const EXPORT_TABLES = [
  'accounts', 'categories', 'transactions', 'investment_transactions',
  'recurring_schedules', 'app_settings', 'audit_log',
  'financial_outlook_snapshots', 'financial_data_revision', 'mcp_draft_batches',
  'mcp_draft_correction_runs', 'mcp_transfer_correction_runs',
] as const

export const EXPORT_EXCLUSIONS = {
  mcp_draft_proposals: 'Expiring proposal capabilities; completed drafts are in transactions.',
  mcp_draft_correction_proposals: 'Expiring correction capabilities; completed runs are included.',
  mcp_transfer_correction_proposals: 'Expiring transfer correction capabilities; completed runs are included.',
  migration_history: 'Only migration filenames are included as schema metadata.',
  sqlite_internal_tables: 'Database infrastructure, not app data.',
  credentials: 'API keys, authentication cookies, environment and deployment secrets are excluded.',
} as const

export const EXPORT_VERSION = 1
export const MAX_EXPORT_ROWS_PER_TABLE = 10_000
export const MAX_EXPORT_BYTES = 16 * 1024 * 1024

export type ExportTable = typeof EXPORT_TABLES[number]
export type ExportRow = Record<string, string | number | null>
export type ExportTables = Record<ExportTable, ExportRow[]>

export interface DataExport {
  format: 'finance-manager-data-export'
  exportVersion: typeof EXPORT_VERSION
  schemaVersion: string
  migrations: string[]
  exportedAt: string
  manifest: {
    tables: Record<ExportTable, { rowCount: number }>
    excluded: typeof EXPORT_EXCLUSIONS
    restoreSupported: false
  }
  data: ExportTables
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

// Refuse a partial or incompatible response before offering a successful download.
export function isDataExport(value: unknown): value is DataExport {
  if (!isRecord(value) || value.format !== 'finance-manager-data-export'
    || value.exportVersion !== EXPORT_VERSION || typeof value.exportedAt !== 'string'
    || !Number.isFinite(Date.parse(value.exportedAt)) || typeof value.schemaVersion !== 'string'
    || !Array.isArray(value.migrations) || value.migrations.length === 0
    || !value.migrations.every(name => typeof name === 'string')
    || value.schemaVersion !== value.migrations[value.migrations.length - 1]
    || !isRecord(value.manifest) || value.manifest.restoreSupported !== false
    || !isRecord(value.manifest.tables) || !isRecord(value.manifest.excluded)
    || !isRecord(value.data)) return false

  for (const [key, reason] of Object.entries(EXPORT_EXCLUSIONS)) {
    if (value.manifest.excluded[key] !== reason) return false
  }
  for (const table of EXPORT_TABLES) {
    const rows = value.data[table]
    const metadata = value.manifest.tables[table]
    if (!Array.isArray(rows) || rows.length > MAX_EXPORT_ROWS_PER_TABLE
      || !isRecord(metadata) || metadata.rowCount !== rows.length
      || !rows.every(row => isRecord(row) && Object.values(row).every(cell => (
        cell === null || typeof cell === 'string' || (typeof cell === 'number' && Number.isFinite(cell))
      )))) return false
  }
  return true
}
