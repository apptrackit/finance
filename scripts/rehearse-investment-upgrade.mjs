// Local-only rehearsal. Never loads private Wrangler/environment configuration,
// prints source records, or calls provider/production endpoints.
import { createHash } from 'node:crypto'
import { readFile, readdir, mkdtemp, rm, mkdir, writeFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTestHarness, unstable_splitSqlQuery } from 'wrangler'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2),
  value = (flag) => args[args.indexOf(flag) + 1]
if (!args.includes('--export') || !args.includes('--report') || args.length !== 4) {
  process.stderr.write(
    'Usage: node scripts/rehearse-investment-upgrade.mjs --export /absolute/backup.sql --report /absolute/sanitized-report.json\n',
  )
  process.exit(1)
}
const source = resolve(value('--export')),
  report = resolve(value('--report'))
if ((await realpath(source)) === (await realpath(report).catch(() => report)) || !source.endsWith('.sql') || !report.endsWith('.json'))
  throw new Error('Use separate SQL input and JSON report paths')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const bytes = await readFile(source),
  hash = digest(bytes)
const privateRoot = await mkdtemp(join(tmpdir(), 'finance-upgrade-private-'))
const server = createTestHarness(),
  originalFetch = globalThis.fetch
let stage = 'startup',
  attempts = 0,
  failed = false
const result = { source_sha256: hash, network_requests: 0 }
const assert = (ok, message) => {
  if (!ok) throw new Error(message)
}
const identifier = (s) => '"' + s.replaceAll('"', '""') + '"'
try {
  await server.update({
    root: privateRoot,
    workers: [
      {
        config: {
          name: 'investment-rehearsal',
          main: join(repo, 'api/src/index.ts'),
          compatibility_date: '2024-09-23',
          compatibility_flags: ['nodejs_compat'],
          define: { __dirname: "'/'" },
          vars: { API_AUTH_MODE: 'public', ALLOWED_ORIGINS: 'https://rehearsal.test' },
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'disposable',
              database_id: '00000000-0000-4000-8000-000000000001',
            },
          ],
        },
      },
    ],
  })
  await server.listen()
  globalThis.fetch = async () => {
    attempts++
    return new Response('', { status: 404 })
  }
  const worker = server.getWorker('investment-rehearsal')
  let db = (await worker.getEnv()).DB
  const files = (await readdir(join(repo, 'api/migrations'))).filter((s) => /^\d+-.*\.sql$/.test(s)).sort()
  const apply = async (file) => {
    const name = file.slice(0, -4)
    await db.batch([
      ...unstable_splitSqlQuery(await readFile(join(repo, 'api/migrations', file), 'utf8')).map((sql) =>
        db.prepare(sql),
      ),
      db.prepare('INSERT INTO migration_history(id,migration_name) VALUES(?,?)').bind(name, name),
    ])
  }
  const integrity = async () => {
    assert(!(await db.prepare('PRAGMA foreign_key_check').all()).results.length, 'foreign keys')
    assert((await db.prepare('PRAGMA quick_check').first('quick_check')) === 'ok', 'integrity')
  }
  const snapshot = async () => {
    const tables = (
      await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('migration_history','market_data_cache') ORDER BY name",
        )
        .all()
    ).results
    const manifest = await readFile(join(repo, 'shared/data-export.ts'), 'utf8')
    const appTables = new Set([...manifest.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
    // This exact application-table list also covers expiring operational records.
    for (const name of [
      'investment_trade_operations',
      'market_data_cache',
      'mcp_draft_proposals',
      'mcp_draft_correction_proposals',
      'mcp_transfer_correction_proposals',
    ])
      appTables.add(name)
    return Promise.all(
      tables
        .filter((t) => appTables.has(t.name))
        .map(async ({ name }) => {
          const columns = (await db.prepare(`PRAGMA table_info(${identifier(name)})`).all()).results.map(
            (c) => c.name,
          )
          return {
            name,
            columns,
            hash: digest(
              JSON.stringify(
                (
                  await db
                    .prepare(
                      `SELECT rowid,${columns.map(identifier).join(',')} FROM ${identifier(name)} ORDER BY rowid`,
                    )
                    .all()
                ).results,
              ),
            ),
          }
        }),
    )
  }
  const unchanged = async (before) => {
    for (const t of before)
      assert(
        digest(
          JSON.stringify(
            (
              await db
                .prepare(
                  `SELECT rowid,${t.columns.map(identifier).join(',')} FROM ${identifier(t.name)} ORDER BY rowid`,
                )
                .all()
            ).results,
          ),
        ) === t.hash,
        'financial preservation',
      )
  }
  stage = 'fresh schema'
  await db
    .prepare(
      'CREATE TABLE migration_history(id TEXT PRIMARY KEY,migration_name TEXT NOT NULL UNIQUE,executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    )
    .run()
  for (const file of files) await apply(file)
  await integrity()
  result.fresh = { migrations: files.length, foreign_keys: 'ok', integrity: 'ok' }
  await server.reset()
  db = (await worker.getEnv()).DB
  stage = 'restore disposable export'
  const statements = unstable_splitSqlQuery(
    bytes.toString('utf8').replace(/DELETE FROM sqlite_sequence\s*;/gi, ''),
  ).filter((s) => !/^\s*(BEGIN|COMMIT|END TRANSACTION)\b/i.test(s))
  await db.batch(statements.map((sql) => db.prepare(sql)))
  const original = await snapshot()
  const ledger = (await db.prepare('SELECT * FROM migration_history ORDER BY migration_name').all()).results
  const applied = new Set(ledger.map((s) => s.migration_name)),
    pending = files.filter((f) => !applied.has(f.slice(0, -4)))
  assert(
    [...applied].sort().at(-1) === '016-account-archive' && pending.every((f) => Number(f.slice(0, 3)) >= 17),
    'expected preceding schema 016',
  )
  result.upgrade = {
    preceding_schema: [...applied].sort().at(-1),
    migrations: [],
    existing_financial_tables: original.length,
  }
  for (const file of pending) {
    stage = file
    await apply(file)
    await unchanged(original)
    await integrity()
    result.upgrade.migrations.push({
      file,
      original_columns_and_rowids_preserved: true,
      foreign_keys: 'ok',
      integrity: 'ok',
    })
  }
  const oldNames = [...applied].sort(),
    preservedLedger = (
      await db
        .prepare(
          `SELECT * FROM migration_history WHERE migration_name IN (${oldNames.map(() => '?').join(',')}) ORDER BY migration_name`,
        )
        .bind(...oldNames)
        .all()
    ).results
  assert(JSON.stringify(preservedLedger) === JSON.stringify(ledger), 'migration history preserved')
  const read = async (path) => {
    const r = await worker.fetch(path, { headers: { Origin: 'https://rehearsal.test' } })
    assert(r.status === 200, 'application read')
    return r.json()
  }
  stage = 'compatibility reads'
  const accounts = await read('/accounts')
  const holdings = accounts.filter((a) => a.type === 'investment')
  assert(
    holdings.every(
      (a) =>
        a.holding_position?.anchor?.kind === 'observed' && a.holding_position.anchor.cost_amount === null,
    ),
    'legacy opening/cost remains unknown',
  )
  assert(
    holdings.every((a) => a.holding_position.quantity === (a.asset_type === 'manual' ? null : a.balance)),
    'current quantities preserved',
  )
  assert(
    !(await db
      .prepare(
        'SELECT 1 FROM investment_transactions WHERE execution_currency IS NOT NULL OR gross_amount IS NOT NULL OR fee_amount IS NOT NULL OR fee_status IS NOT NULL OR cash_currency IS NOT NULL OR cash_amount IS NOT NULL OR effective_order != rowid OR trade_version != 0 OR asset_event IS NOT NULL LIMIT 1',
      )
      .first()),
    'legacy facts/order',
  )
  assert(
    !(await db
      .prepare(
        "SELECT 1 FROM investment_valuations v JOIN accounts a ON a.id=v.account_id WHERE v.source != 'baseline' OR (a.asset_type='manual' AND (v.kind!='total' OR v.amount!=a.balance OR v.currency!=a.currency)) LIMIT 1",
      )
      .first()),
    'dated baseline facts',
  )
  const exportData = await read('/export')
  assert(exportData.schemaVersion === files.at(-1).slice(0, -4), 'export schema')
  assert(
    Array.isArray(exportData.data.investment_position_anchors) &&
      Array.isArray(exportData.data.investment_valuations) &&
      !exportData.data.market_data_cache,
    'export coverage',
  )
  const baseline = await snapshot()
  const metrics = await read('/investment-metrics?overview=1')
  assert(Object.keys(metrics.overview.trends).length === holdings.length, 'bounded overview')
  for (const c of ['HUF', 'USD'])
    assert(
      metrics.by_currency[c].holdings.every((h) => h.net_invested === null && h.total_gain === null),
      'unknown historical facts preserved',
    )
  for (const range of ['1m', '3m', '6m', '1y', 'ytd', 'all']) {
    const history = await read(`/investment-history?range=${range}&currency=HUF&timezone=Europe%2FBudapest`)
    assert(
      history.points.length <= 600 && history.summary.estimated_return_percent === null,
      'bounded unknown history',
    )
    await unchanged(baseline)
  }
  const linked = (
    await db
      .prepare(
        'SELECT id,trade_version FROM investment_transactions WHERE linked_transaction_id IS NOT NULL LIMIT 100',
      )
      .all()
  ).results
  assert(linked.length > 0, 'legacy linked pairs present')
  for (const t of linked) {
    const r = await worker.fetch(
      `/investment-trades/${encodeURIComponent(t.id)}?expected_version=${t.trade_version + 1}`,
      { method: 'DELETE', headers: { Origin: 'https://rehearsal.test' } },
    )
    assert(r.status === 409, 'stale pair delete refused')
  }
  await unchanged(baseline)
  await unchanged(original)
  await integrity()
  result.intentional_backfills = [
    '017: verified reciprocal cash references only',
    '018: holding pricing/unit/provider metadata and observed current-position anchors; no historical cost',
    '019: durable row order and version zero; execution/fee/cash facts stay null',
    '020: current dated total/per-unit baseline observations; no cash movement or inferred acquisition',
    '021: reconstructible empty provider cache',
  ]
  result.compatibility = {
    legacy_cost_and_cash_unknown: true,
    current_quantities_preserved: true,
    export_covered: true,
    all_ranges_bounded: true,
    stale_deletes_refused: true,
    financial_rows_and_revision_preserved: true,
    migration_history_preserved: true,
  }
  result.provider_requests_intercepted = attempts
  result.original_export_unchanged = digest(await readFile(source)) === hash
  assert(result.original_export_unchanged, 'source hash')
  result.status = 'passed'
} catch {
  failed = true
  result.status = 'failed'
  result.failed_stage = stage
  // Database exceptions can contain source SQL and private values. Do not print
  // their message/stack. The fixed stage identifies the failed check safely.
} finally {
  globalThis.fetch = originalFetch
  try {
    await server.close()
  } finally {
    await rm(privateRoot, { recursive: true, force: true })
  }
  result.private_copy_removed = true
  result.original_export_unchanged = digest(await readFile(source)) === hash
}
await mkdir(dirname(report), { recursive: true })
await writeFile(report, JSON.stringify(result, null, 2) + '\n')
process.stdout.write(JSON.stringify(result) + '\n')
if (failed) process.exitCode = 1
