import {beforeEach,expect,it} from 'vitest'
import {useFinanceWorkers} from './harness'
import type {InvestmentMetricsSnapshot} from '../../shared/investment-metrics'
const f=useFinanceWorkers()
beforeEach(async()=>{
 await f.seed()
 await f.db.batch([
  f.db.prepare("INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,manual_price) VALUES ('holding','Synthetic ETF','investment',2,'SHARE','EUR','etf','manual',110)"),
  f.db.prepare("INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,cost_amount,cost_currency,created_at,trade_order_boundary) VALUES ('opening','holding','opening','2026-01-01',2,200,'EUR',1,0)"),
  f.db.prepare("INSERT INTO investment_valuations(id,account_id,effective_date,kind,amount,currency,source,created_at,updated_at) VALUES ('first','holding','2026-01-01','per_unit',100,'EUR','initial',1,1),('second','holding','2026-01-10','per_unit',110,'EUR','user',1,1)"),
 ])
})
async function facts(){return Promise.all(['accounts','transactions','investment_transactions','investment_position_anchors','investment_valuations','financial_data_revision','audit_log'].map(async table=>(await f.db.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all()).results))}
it('returns real per-unit manual trend observations atomically with current facts, without writes or MCP contract expansion',async()=>{
 const before=await facts(),r=await f.request('/investment-metrics?overview=1')
 expect(r.status,await r.clone().text()).toBe(200)
 const data=await r.json() as InvestmentMetricsSnapshot,trend=data.overview!.trends.holding
 expect(trend.points).toHaveLength(30)
 expect(trend).toMatchObject({method:'step',currency:'EUR',kind:'unit_price'})
 // The current date is later; do not fabricate historic chart shapes from the
 // account's current units or price. Carry the last known observation only.
 expect(trend.points.every(p=>p.value===110&&p.as_of==='2026-01-10')).toBe(true)
 expect(await facts()).toEqual(before)
 const normal=await (await f.request('/investment-metrics')).json() as InvestmentMetricsSnapshot
 expect(normal.overview).toBeUndefined()
 expect((await f.request('/investment-metrics?overview=unexpected')).status).toBe(400)
 expect((await f.tool<Record<string,unknown>>('get_portfolio',{currency:'HUF'})).overview).toBeUndefined()
 expect(await facts()).toEqual(before)
})
it('backdated appraisal correction changes the next snapshot and preserves native units',async()=>{
 const before=await (await f.request('/investment-metrics?overview=1')).json() as InvestmentMetricsSnapshot
 expect((await f.request('/accounts/holding/valuations','PUT',{effective_date:'2026-01-10',expected_id:'second',expected_version:1,amount:120})).status).toBe(200)
 const after=await (await f.request('/investment-metrics?overview=1')).json() as InvestmentMetricsSnapshot
 expect(after.source_revision).toBeGreaterThan(before.source_revision)
 expect(after.overview!.trends.holding.points.at(-1)?.value).toBe(120)
 expect(after.accounts[0].balance).toBe(2)
})
