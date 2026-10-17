import { expect, it } from 'vitest'
import { migrate, useFinanceWorkers } from './harness'
import { EXPORT_TABLES } from '../../shared/data-export'
const f=useFinanceWorkers({migrateBeforeEach:false})
it('upgrades 019 without changing old columns, rowids, timestamps, costs, cash or revision; baselines prove no earlier values',async()=>{
  await migrate(f.db,19); await f.seed()
  await f.db.batch([
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type,pricing_method,updated_at) VALUES ('manual','Legacy total','investment',500,'HUF','manual','manual',1)"),
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,quote_currency,asset_type,pricing_method,manual_price,manual_price_date,updated_at) VALUES ('unit','Legacy unit','investment',2,'SHARE','EUR','etf','manual',120,'2026-01-01',1)"),
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type,pricing_method,updated_at) VALUES ('closed','Closed total','investment',0,'HUF','manual','manual',1)"),
    f.db.prepare("INSERT INTO investment_position_anchors (id,account_id,kind,effective_date,balance,created_at) VALUES ('baseline','manual','observed','2026-01-01',500,1)"),
    f.db.prepare("UPDATE accounts SET is_locked=1 WHERE id='manual'"),
    f.db.prepare("UPDATE accounts SET archived_at=1 WHERE id='closed'"),
  ])
  const snapshots=[]
  for(const table of EXPORT_TABLES.filter(t=>t!=='investment_valuations')) {
    const columns=(await f.db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>()).results.map(c=>c.name)
    snapshots.push({table,columns,rows:(await f.db.prepare(`SELECT rowid,${columns.join(',')} FROM ${table} ORDER BY rowid`).all()).results})
  }
  const day=await f.db.prepare("SELECT date('now') AS today").first<string>('today')
  await migrate(f.db)
  for(const s of snapshots) expect((await f.db.prepare(`SELECT rowid,${s.columns.join(',')} FROM ${s.table} ORDER BY rowid`).all()).results,s.table).toEqual(s.rows)
  expect((await f.db.prepare('SELECT account_id,effective_date,kind,amount,currency,source FROM investment_valuations ORDER BY account_id').all()).results).toEqual([
    {account_id:'closed',effective_date:day,kind:'total',amount:0,currency:'HUF',source:'baseline'},
    {account_id:'manual',effective_date:day,kind:'total',amount:500,currency:'HUF',source:'baseline'},
    {account_id:'unit',effective_date:'2026-01-01',kind:'per_unit',amount:120,currency:'EUR',source:'baseline'},
  ])
  const before=await f.request('/accounts/manual/valuations?at=2025-12-31')
  expect(await before.json()).toMatchObject({valuation_at:null,observations:[],valuation_status:{status:'missing'}})
  expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({results:[]})
  expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe('ok')
})
