import { EXPORT_TABLES, EXPORT_EXCLUSIONS } from '../../shared/data-export'
import { readFile, readdir } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { unstable_splitSqlQuery } from 'wrangler'
import { migrate, useFinanceWorkers } from './harness'
const f = useFinanceWorkers({ migrateBeforeEach: false })
async function apply(file: string) {
  const name = file.slice(0, -4)
  await f.db.batch([
    ...unstable_splitSqlQuery(
      await readFile(`api/migrations/${file}`, 'utf8'),
    ).map((sql) => f.db.prepare(sql)),
    f.db
      .prepare('INSERT INTO migration_history(id,migration_name) VALUES(?,?)')
      .bind(name, name),
  ])
}
async function snapshot() {
  const tables = (
    await f.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all<{ name: string }>()
  ).results
  return Promise.all(
    tables
      .filter((t) =>
        new Set<string>([
          ...EXPORT_TABLES,
          ...Object.keys(EXPORT_EXCLUSIONS),
        ]).has(t.name),
      )
      .map(async ({ name }) => ({
        name,
        columns: (
          await f.db
            .prepare(`PRAGMA table_info(${name})`)
            .all<{ name: string }>()
        ).results.map((c) => c.name),
        rows: (
          await f.db.prepare(`SELECT rowid,* FROM ${name} ORDER BY rowid`).all()
        ).results,
      })),
  )
}
it.each(['main', 'epic'] as const)(
  'upgrades the populated %s branch schema without changing recorded facts or history markers',
  async (branch) => {
    await migrate(f.db, 16)
    await f.seed()
    await f.db.batch([
      f.db.prepare(
        "INSERT INTO accounts(id,name,type,balance,currency,asset_type,quote_currency) VALUES('holding','Synthetic holding','investment',2,'SHARE','stock','HUF')",
      ),
      f.db.prepare(
        "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date) VALUES('buy','holding','buy',2,10,20,'2026-01-10')",
      ),
      f.db.prepare(
        "INSERT INTO transactions(id,account_id,amount,date,linked_transaction_id) VALUES('settlement','cash',-20,'2026-01-10','buy')",
      ),
    ])
    const files = (await readdir('api/migrations'))
      .filter((x) => x.endsWith('.sql'))
      .sort()
    if (branch === 'main') {
      await apply('017-transaction-splits.sql')
      await f.db.batch([
        f.db.prepare(
          "INSERT INTO transaction_splits(id,description,created_at,updated_at) VALUES('split','Existing split',1,1)",
        ),
        f.db.prepare(
          "INSERT INTO transactions(id,account_id,amount,date,split_id) VALUES('line1','cash',-0.1,'2026-01-10','split'),('line2','cash',-0.2,'2026-01-10','split')",
        ),
      ])
    } else
      for (const file of files.filter(
        (x) =>
          Number(x.slice(0, 3)) >= 17 && x !== '017-transaction-splits.sql',
      ))
        await apply(file)
    const before = await snapshot()
    await migrate(f.db)
    for (const t of before) {
      const actual = (
        await f.db
          .prepare(
            `SELECT rowid,${t.columns.join(',')} FROM ${t.name} ORDER BY rowid`,
          )
          .all()
      ).results
      expect(
        t.name === 'migration_history'
          ? actual.filter((r) => t.rows.some((old) => old.id === r.id))
          : actual,
        `${branch}: ${t.name}`,
      ).toEqual(t.rows)
    }
    const markers = (
      await f.db
        .prepare(
          'SELECT migration_name FROM migration_history ORDER BY migration_name',
        )
        .all()
    ).results
    expect(markers).toHaveLength(22)
    expect(markers).toContainEqual({
      migration_name: '017-investment-transfer-links',
    })
    expect(markers).toContainEqual({ migration_name: '017-transaction-splits' })
    expect(
      await f.db
        .prepare(
          "SELECT linked_transaction_id FROM investment_transactions WHERE id='buy'",
        )
        .first('linked_transaction_id'),
    ).toBe('settlement')
    await migrate(f.db)
    expect(
      (
        await f.db
          .prepare(
            'SELECT migration_name FROM migration_history ORDER BY migration_name',
          )
          .all()
      ).results,
    ).toEqual(markers)
    expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({
      results: [],
    })
    expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe(
      'ok',
    )
  },
)
const payload = () => ({
  account_id: 'cash',
  date: '2026-01-15',
  description: 'Synthetic decimals',
  lines: [
    { category_id: 'food', amount: -0.1 },
    { category_id: 'food', amount: -0.2 },
  ],
})
const balance = () =>
  f.db
    .prepare("SELECT balance FROM accounts WHERE id='cash'")
    .first<number>('balance')
it('keeps exact cash across concurrent split, ordinary and investment writes and reverses each once', async () => {
  await migrate(f.db)
  await f.seed()
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO accounts(id,name,type,balance,currency,asset_type,quote_currency,pricing_method,manual_price) VALUES('holding','Synthetic holding','investment',0,'SHARE','stock','HUF','manual',10)",
    ),
    f.db.prepare(
      "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('open','holding','opening','2026-01-01',0,1,0)",
    ),
  ])
  const split = await f.request('/transactions/splits', 'POST', payload())
  expect(split.status, await split.clone().text()).toBe(201)
  const first = (await split.json()) as { id: string }
  expect(await balance()).toBe(999.7)
  const [second, income, trade] = await Promise.all([
    f.request('/transactions/splits', 'POST', payload()),
    f.request('/transactions', 'POST', {
      account_id: 'cash',
      amount: 0.1,
      date: '2026-01-15',
      description: 'Ordinary decimal',
    }),
    f.request('/investment-trades', 'POST', {
      idempotency_key: crypto.randomUUID(),
      holding_account_id: 'holding',
      cash_account_id: 'cash',
      type: 'buy',
      quantity: 0.1,
      price: 10,
      execution_currency: 'HUF',
      cash_amount: 1,
      fee_status: 'known',
      fee_amount: 0,
      date: '2026-01-15',
    }),
  ])
  for (const r of [second, income, trade])
    expect(r.status, await r.clone().text()).toBe(201)
  expect(await balance()).toBe(998.5)
  const ids = [first.id, ((await second.json()) as { id: string }).id]
  for (const id of ids)
    expect(
      (await f.request(`/transactions/splits/${id}`, 'DELETE')).status,
    ).toBe(200)
  expect(await balance()).toBe(999.1)
  const tradeId = ((await trade.json()) as { trade_id: string }).trade_id
  expect(
    (await f.request(`/investment-trades/${tradeId}`, 'DELETE')).status,
  ).toBe(200)
  expect(await balance()).toBe(1000.1)
})
it('confirms decimal pending split lines once and rolls back failed line inserts with metadata, audits and balances', async () => {
  await migrate(f.db)
  await f.seed()
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO transaction_splits(id,created_at,updated_at) VALUES('review',1,1)",
    ),
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,status,pending_kind,review_source,split_id) VALUES('r1','cash',-0.1,'2026-01-15','pending','mcp_review','chatgpt_mcp','review'),('r2','cash',-0.2,'2026-01-15','pending','mcp_review','chatgpt_mcp','review')",
    ),
  ])
  expect(await balance()).toBe(1000)
  const responses = await Promise.all([
    f.request('/transactions/splits/review/confirm', 'POST'),
    f.request('/transactions/splits/review/confirm', 'POST'),
  ])
  for (const r of responses) expect(r.status, await r.clone().text()).toBe(200)
  expect(await balance()).toBe(999.7)
  const before = await snapshot()
  await f.db
    .prepare(
      "CREATE TRIGGER fail_split_insert BEFORE INSERT ON transactions WHEN NEW.split_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'LOCAL_TEST_FAILURE'); END",
    )
    .run()
  expect(
    (await f.request('/transactions/splits', 'POST', payload())).status,
  ).toBeGreaterThanOrEqual(400)
  expect(await snapshot()).toEqual(before)
  expect(await balance()).toBe(999.7)
})
