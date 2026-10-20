import {beforeEach,expect,it} from 'vitest'
import {useFinanceWorkers} from './harness'
import type {PortfolioHistoryResponse} from '../../shared/investment-history-contract'
import type {InvestmentMetricsSnapshot} from '../../shared/investment-metrics'
const f=useFinanceWorkers()
const buy=(extra:Record<string,unknown>={})=>({idempotency_key:crypto.randomUUID(),holding_account_id:'holding',cash_account_id:'cash',type:'buy',quantity:2,price:100,execution_currency:'HUF',cash_amount:200,fee_status:'known',fee_amount:0,date:'2026-01-02',...extra})
beforeEach(async()=>{
 await f.seed()
 await f.db.batch([
  f.db.prepare("INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,manual_price,manual_price_date) VALUES ('holding','Synthetic ETF','investment',0,'SHARE','HUF','etf','manual',100,'2026-01-01')"),
  f.db.prepare("INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES ('open','holding','opening','2026-01-01',0,1,0)"),
  f.db.prepare("INSERT INTO investment_valuations(id,account_id,effective_date,kind,amount,currency,source,created_at,updated_at) VALUES ('price','holding','2026-01-01','per_unit',100,'HUF','initial',1,1)"),
 ])
})
async function read(query='from=2026-01-02&to=2026-01-06&currency=HUF&timezone=UTC') {
 const response=await f.request(`/investment-history?${query}`)
 expect(response.status,await response.clone().text()).toBe(200)
 expect(response.headers.get('cache-control')).toBe('no-store')
 return response.json() as Promise<PortfolioHistoryResponse>
}
async function facts() {
 return Promise.all(['accounts','transactions','investment_transactions','investment_position_anchors','investment_valuations','financial_data_revision','audit_log','investment_trade_operations'].map(async table=>(await f.db.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all()).results))
}
it('reconstructs historical units and archived gains without changing financial records or revision',async()=>{
 expect((await f.request('/investment-trades','POST',buy())).status).toBe(201)
 expect((await f.request('/accounts/holding/valuations','PUT',{effective_date:'2026-01-03',amount:120,expected_id:null,expected_version:0})).status).toBe(200)
 expect((await f.request('/investment-trades','POST',buy({type:'sell',date:'2026-01-04',quantity:1,price:120,cash_amount:120}))).status).toBe(201)
 expect((await f.request('/investment-trades','POST',buy({type:'sell',date:'2026-01-05',quantity:1,price:130,cash_amount:130}))).status).toBe(201)
 expect((await f.request('/accounts/holding/archive','PATCH')).status).toBe(200)
 const before=await facts(),history=await read()
 expect(history.points.map(p=>[p.value,p.net_invested])).toEqual([[200,200],[240,200],[120,80],[0,-50],[0,-50]])
 expect(history.summary).toMatchObject({gain:50,contribution:200,withdrawal:250,status:'complete'})
 expect(history.summary.estimated_return_percent).toBeCloseTo(30)
 expect(history.holdings[0].archived).toBe(true);expect(await facts()).toEqual(before)
})
it('rejects stale revisions after trade edit, valuation correction and deletion, and recomputes from facts',async()=>{
 const trade=await (await f.request('/investment-trades','POST',buy())).json() as {trade_id:string}
 const initial=await read(),query=`from=2026-01-02&to=2026-01-06&expected_revision=${initial.source_revision}`
 const edit=await f.request(`/investment-trades/${trade.trade_id}`,'PUT',buy({expected_version:1,quantity:3,cash_amount:300}))
 expect(edit.status,await edit.clone().text()).toBe(200)
 expect((await f.request(`/investment-history?${query}`)).status).toBe(409)
 expect((await read()).points.at(-1)?.value).toBe(300)
 const before=await read()
 expect((await f.request('/accounts/holding/valuations','PUT',{effective_date:'2026-01-03',amount:120,expected_id:null,expected_version:0})).status).toBe(200)
 expect((await f.request(`/investment-history?from=2026-01-02&to=2026-01-06&expected_revision=${before.source_revision}`)).status).toBe(409)
 expect((await read()).summary.gain).toBe(60)
 expect((await f.request(`/investment-trades/${trade.trade_id}`,'DELETE')).status).toBe(200)
 expect((await read()).summary).toMatchObject({gain:0,estimated_return_percent:null})
})
it('reconciles a complete provisional endpoint with current metrics at the equivalent day',async()=>{
 await f.request('/investment-trades','POST',buy())
 const today=new Date().toISOString().slice(0,10)
 const history=await read(`range=1m&to=${today}&currency=HUF&timezone=UTC`)
 const metrics=await (await f.request('/investment-metrics')).json() as InvestmentMetricsSnapshot
 expect(history.points.at(-1)).toMatchObject({value:metrics.by_currency.HUF.total_value,provisional:true})
 expect(history.points.at(-1)?.net_invested).toBe(metrics.by_currency.HUF.total_invested)
})
it('exposes missing dated FX instead of converting historical cash at current rates',async()=>{
 await f.request('/investment-trades','POST',buy())
 const history=await read('from=2026-01-02&to=2026-01-06&currency=USD&timezone=UTC')
 expect(history.points.every(p=>p.value===null&&p.net_invested===null)).toBe(true)
 expect(history.summary).toMatchObject({gain:null,estimated_return_percent:null,status:'partial'})
 expect(history.coverage_ranges).toEqual(expect.arrayContaining([expect.objectContaining({account_id:'holding',reasons:['missing_fx']})]))
})
it.each(['range=invalid','from=2026-02-30&to=2026-03-01','from=2026-01-02','from=2026-01-03&to=2026-01-02','range=1m&from=2026-01-01&to=2026-01-03','to=2999-01-01','currency=SHARE','timezone=Unknown','max_points=1201','max_points=99','extra=true','from=2000-01-01&to=2026-01-01'])('rejects invalid or unbounded query %s before publishing history',async query=>{
 const before=await facts();expect((await f.request(`/investment-history?${query}`)).status).toBe(400);expect(await facts()).toEqual(before)
})
it('enforces fact limits instead of truncating an apparently complete portfolio',async()=>{
 await f.db.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100) INSERT INTO accounts(id,name,type,balance,currency) SELECT 'empty:'||x,'Empty','investment',0,'HUF' FROM n").run()
 const before=await facts(),response=await f.request('/investment-history?range=all')
 expect(response.status).toBe(422);expect(await response.json()).toMatchObject({code:'INVESTMENT_HISTORY_LIMIT'});expect(await facts()).toEqual(before)
})
