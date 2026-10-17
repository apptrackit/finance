import { expect, it } from 'vitest'
import { migrate, useFinanceWorkers } from './harness'
import { EXPORT_TABLES } from '../../shared/data-export'
const f = useFinanceWorkers({migrateBeforeEach:false})
it('upgrades 018 preserving every existing column/row ID, revision and trade order including locked/archived history', async () => {
  await migrate(f.db,18)
  await f.seed()
  await f.db.batch([
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type,updated_at) VALUES ('legacy','Legacy','investment',2,'SHARE','stock',1)"),
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type,updated_at) VALUES ('closed','Closed','investment',0,'SHARE','stock',1)"),
    f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('b','legacy','buy',2,10,17,'2025-01-01')"),
    f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('a','closed','buy',2,10,20,'2025-01-01')"),
    f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('z','closed','sell',2,12,24,'2025-01-01')"),
    f.db.prepare("INSERT INTO investment_position_anchors (id,account_id,kind,effective_date,balance,trade_rowid_boundary,created_at) VALUES ('observed','legacy','observed','2026-01-15',2,1,1)"),
    f.db.prepare("UPDATE accounts SET is_locked=1 WHERE id='legacy'"),
    f.db.prepare("UPDATE accounts SET archived_at=1 WHERE id='closed'"),
  ])
  const snapshots = []
  for (const table of EXPORT_TABLES.filter(t => t!=='investment_trade_sequence')) {
    const columns=(await f.db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>()).results.map(c => c.name)
    snapshots.push({table,columns,rows:(await f.db.prepare(`SELECT rowid,${columns.join(',')} FROM ${table} ORDER BY rowid`).all()).results})
  }
  await migrate(f.db)
  for (const s of snapshots) expect((await f.db.prepare(`SELECT rowid,${s.columns.join(',')} FROM ${s.table} ORDER BY rowid`).all()).results,s.table).toEqual(s.rows)
  expect((await f.db.prepare('SELECT id,effective_order,execution_currency,gross_amount,fee_status,cash_currency,trade_version FROM investment_transactions ORDER BY rowid').all()).results).toEqual(['b','a','z'].map((id,index) => ({id,effective_order:index+1,execution_currency:null,gross_amount:null,fee_status:null,cash_currency:null,trade_version:0})))
  expect(await f.db.prepare('SELECT last_order FROM investment_trade_sequence').first('last_order')).toBe(3)
  expect(await f.db.prepare("SELECT trade_order_boundary FROM investment_position_anchors WHERE id='observed'").first('trade_order_boundary')).toBe(1)
  expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({results:[]})
  expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe('ok')
  expect(await (await f.request('/investment-transactions')).json()).toEqual(expect.arrayContaining([expect.objectContaining({id:'b',total_amount:17,coverage:expect.objectContaining({reasons:expect.arrayContaining(['legacy_gross_discrepancy','unknown_execution_currency'])})})]))
})
