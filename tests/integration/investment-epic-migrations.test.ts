import { EXPORT_TABLES, EXPORT_EXCLUSIONS } from '../../shared/data-export'
import { readFile } from 'node:fs/promises'
import { unstable_splitSqlQuery } from 'wrangler'
import { expect, it } from 'vitest'
import { migrate, useFinanceWorkers } from './harness'
const f = useFinanceWorkers({ migrateBeforeEach: false })
const files = [
  '017-investment-transfer-links',
  '018-investment-holding-metadata',
  '019-investment-trade-facts',
  '020-manual-investment-valuations',
  '021-market-data-cache',
]
async function apply(name: string) {
  await f.db.batch([
    ...unstable_splitSqlQuery(await readFile(`api/migrations/${name}.sql`, 'utf8')).map((s) =>
      f.db.prepare(s),
    ),
    f.db.prepare('INSERT INTO migration_history(id,migration_name) VALUES(?,?)').bind(name, name),
  ])
}
async function legacy() {
  await migrate(f.db, 16)
  await f.seed()
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO accounts(id,name,type,balance,currency,asset_type,quote_currency,symbol) VALUES('stock','Legacy stock','investment',2,'SHARE','stock','EUR','TEST'),('manual','Legacy total','investment',1200,'HUF','manual',NULL,NULL),('archived','Archived','investment',0,'SHARE','stock','EUR','CLOSED')",
    ),
    f.db.prepare(
      "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date) VALUES('legacy-buy','stock','buy',2,50,97,'2025-01-01')",
    ),
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,linked_transaction_id) VALUES('settlement','cash',-40400,'2025-01-01','legacy-buy')",
    ),
    f.db.prepare("UPDATE accounts SET is_locked=1 WHERE id='manual'"),
    f.db.prepare("UPDATE accounts SET archived_at=1,updated_at=1 WHERE id='archived'"),
  ])
}
async function snapshot() {
  const tables = (
    await f.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>()
  ).results
  return Promise.all(
    tables
      .filter((t) => new Set<string>([...EXPORT_TABLES, ...Object.keys(EXPORT_EXCLUSIONS)]).has(t.name))
      .map(async ({ name }) => ({
        name,
        columns: (await f.db.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>()).results.map(
          (c) => c.name,
        ),
        rows: (await f.db.prepare(`SELECT rowid,* FROM ${name} ORDER BY rowid`).all()).results,
      })),
  )
}
it('preserves all preceding financial columns through the complete epic, with only enumerated additive backfills', async () => {
  await legacy()
  const before = await snapshot()
  for (const name of files) {
    await apply(name)
    for (const t of before.filter((t) => t.name !== 'migration_history'))
      expect(
        (await f.db.prepare(`SELECT rowid,${t.columns.join(',')} FROM ${t.name} ORDER BY rowid`).all())
          .results,
        `${name}: ${t.name}`,
      ).toEqual(t.rows)
    expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] })
    expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe('ok')
  }
  expect(
    await f.db
      .prepare(
        "SELECT linked_transaction_id,effective_order,trade_version,execution_currency,gross_amount,fee_amount,fee_status,cash_currency,asset_event FROM investment_transactions WHERE id='legacy-buy'",
      )
      .first(),
  ).toEqual({
    linked_transaction_id: 'settlement',
    effective_order: 1,
    trade_version: 0,
    execution_currency: null,
    gross_amount: null,
    fee_amount: null,
    fee_status: null,
    cash_currency: null,
    asset_event: null,
  })
  expect(
    (
      await f.db
        .prepare('SELECT kind,cost_amount,cost_currency FROM investment_position_anchors ORDER BY account_id')
        .all()
    ).results,
  ).toEqual(Array.from({ length: 3 }, () => ({ kind: 'observed', cost_amount: null, cost_currency: null })))
  expect(
    await f.db
      .prepare("SELECT amount,kind,currency,source FROM investment_valuations WHERE account_id='manual'")
      .first(),
  ).toEqual({ amount: 1200, kind: 'total', currency: 'HUF', source: 'baseline' })
  expect(await f.db.prepare('SELECT COUNT(*) AS n FROM market_data_cache').first('n')).toBe(0)
})
it.each(files)(
  'rolls back the whole %s migration and its ledger marker on a late D1 failure',
  async (target) => {
    await legacy()
    for (const name of files) {
      if (name === target) break
      await apply(name)
    }
    const before = await snapshot(),
      schema = (
        await f.db
          .prepare(
            "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
          )
          .all()
      ).results
    await f.db
      .prepare(
        `CREATE TRIGGER reject_migration_marker BEFORE INSERT ON migration_history WHEN NEW.migration_name='${target}' BEGIN SELECT RAISE(ABORT,'INJECTED_MIGRATION_FAILURE'); END`,
      )
      .run()
    await expect(apply(target)).rejects.toThrow('INJECTED_MIGRATION_FAILURE')
    expect(await snapshot()).toEqual(before)
    await f.db.prepare('DROP TRIGGER reject_migration_marker').run()
    expect(
      (
        await f.db
          .prepare(
            "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
          )
          .all()
      ).results,
    ).toEqual(schema)
    await apply(target)
    expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] })
    expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe('ok')
  },
)
