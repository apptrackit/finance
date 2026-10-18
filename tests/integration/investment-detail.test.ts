import {beforeEach,expect,it} from 'vitest'
import {useFinanceWorkers} from './harness'
const f=useFinanceWorkers()
const draft=(extra:Record<string,unknown>={})=>({idempotency_key:crypto.randomUUID(),holding_account_id:'holding',cash_account_id:'cash',type:'buy',quantity:2,price:50,execution_currency:'EUR',cash_amount:40400,fee_status:'known',fee_amount:400,date:'2026-01-10',...extra})
beforeEach(async()=>{
 await f.seed()
 await f.db.batch([
  f.db.prepare("INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,manual_price) VALUES('holding','Synthetic holding','investment',0,'SHARE','EUR','etf','manual','SHARE',50)"),
  f.db.prepare("INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('opening','holding','opening','2026-01-01',0,1,0)"),
  f.db.prepare("INSERT INTO accounts(id,name,type,balance,currency) VALUES('euro','Euro cash','checking',1000,'EUR')"),
 ])
})
async function facts(){return Promise.all(['accounts','transactions','investment_transactions','investment_position_anchors','investment_valuations','audit_log','financial_data_revision','investment_trade_operations'].map(async table=>(await f.db.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all()).results))}
async function create(){const r=await f.request('/investment-trades','POST',draft());expect(r.status,await r.clone().text()).toBe(201);return r.json() as Promise<{trade_id:string;cash_transaction_id:string}>}
it('lazily reads the canonical reciprocal pair from either ID without financial mutations',async()=>{
 const ids=await create(),before=await facts()
 for(const id of [ids.trade_id,ids.cash_transaction_id]){
  const response=await f.request(`/investment-trades/${id}`)
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toMatchObject({cash_account_id:'cash',trade:{id:ids.trade_id,linked_transaction_id:ids.cash_transaction_id,trade_version:1,cash_amount:40400,fee_amount:400,execution_currency:'EUR'}})
 }
 expect((await f.request('/investment-trades/missing')).status).toBe(404)
 expect(await facts()).toEqual(before)
})
it('previews exact destination cash and fractional units, including undoing the old cash leg during edits',async()=>{
 const ids=await create(),body=draft({cash_account_id:'euro',quantity:0.123456789012,price:100,cash_amount:12.35,fee_amount:0,expected_version:1})
 const before=await facts(),p=await f.request(`/investment-trades/preview?trade_id=${ids.trade_id}`,'POST',body)
 expect(p.status,await p.clone().text()).toBe(200)
 const preview=await p.json() as {preview_cash_after:{account_id:string;currency:string;balance:number};by_currency:{HUF:{holdings:{quantity:number}[]}}}
 expect(preview.preview_cash_after).toEqual({account_id:'euro',currency:'EUR',balance:987.65})
 expect(preview.by_currency.HUF.holdings[0].quantity).toBe(0.123456789012)
 expect(await facts()).toEqual(before)
 expect((await f.request(`/investment-trades/${ids.trade_id}`,'PUT',body)).status).toBe(200)
 expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='euro'").first('balance')).toBe(preview.preview_cash_after.balance)
 expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance')).toBe(1000)
 expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='holding'").first('balance')).toBe(preview.by_currency.HUF.holdings[0].quantity)
})
it('refuses a stale pair deletion and malformed versions without changing either ledger',async()=>{
 const ids=await create()
 expect((await f.request(`/investment-trades/${ids.trade_id}`,'PUT',draft({quantity:3,cash_amount:60400,expected_version:1}))).status).toBe(200)
 const before=await facts()
 for(const version of ['1','bad','-1','1.5'])expect((await f.request(`/investment-trades/${ids.trade_id}?expected_version=${version}`,'DELETE')).status).toBe(version==='1'?409:400)
 expect(await facts()).toEqual(before)
 expect((await f.request(`/investment-trades/${ids.trade_id}?expected_version=2`,'DELETE')).status).toBe(200)
 expect(await f.db.prepare("SELECT COUNT(*) AS n FROM investment_transactions").first('n')).toBe(0)
 expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance')).toBe(1000)
 expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='holding'").first('balance')).toBe(0)
})
it('refuses editor preparation for locked cash and inconsistent reciprocal records without mutations',async()=>{
 const ids=await create()
 await f.db.prepare("UPDATE accounts SET is_locked=1 WHERE id='cash'").run()
 const locked=await facts();expect((await f.request(`/investment-trades/${ids.trade_id}`)).status).toBe(409);expect(await facts()).toEqual(locked)
 await f.db.prepare("UPDATE accounts SET is_locked=0 WHERE id='cash'").run()
 await f.db.prepare('UPDATE transactions SET date=? WHERE id=?').bind('2026-01-11',ids.cash_transaction_id).run()
 const inconsistent=await facts();expect((await f.request(`/investment-trades/${ids.trade_id}`)).status).toBe(409);expect(await facts()).toEqual(inconsistent)
})
