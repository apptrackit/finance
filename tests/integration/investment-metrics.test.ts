import {beforeEach,expect,it} from 'vitest'
import {useFinanceWorkers} from './harness'
import type {InvestmentMetricsSnapshot} from '../../shared/investment-metrics'
const f=useFinanceWorkers()
const input=(patch:Record<string,unknown>={})=>({idempotency_key:crypto.randomUUID(),holding_account_id:'holding',cash_account_id:'cash',type:'buy',quantity:10,price:100,execution_currency:'HUF',cash_amount:1010,fee_status:'known',fee_amount:10,date:'2026-01-05',...patch})
beforeEach(async()=>{
 await f.seed()
 await f.db.batch([
  f.db.prepare("INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,manual_price) VALUES ('holding','Synthetic','investment',0,'SHARE','HUF','etf','manual','SHARE',110)"),
  f.db.prepare("INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES ('opening','holding','opening','2026-01-01',0,1,0)"),
 ])
})
async function read(scope='investments') {
 const r=await f.request(`/investment-metrics?scope=${scope}`);expect(r.status,await r.clone().text()).toBe(200)
 return r.json() as Promise<InvestmentMetricsSnapshot>
}
async function facts() {
 const tables=['accounts','transactions','investment_transactions','investment_position_anchors','investment_valuations','financial_data_revision','investment_trade_operations','investment_trade_sequence','audit_log']
 return Promise.all(tables.map(async t=>(await f.db.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all()).results))
}
it('preview and saved read use identical weighted-average rules without mutating any financial fact during preview',async()=>{
 const buy=input()
 const before=await facts()
 const response=await f.request('/investment-trades/preview','POST',buy)
 expect(response.status,await response.clone().text()).toBe(200)
 const preview=await response.json() as InvestmentMetricsSnapshot
 expect(await facts()).toEqual(before)
 expect((await f.request('/investment-trades','POST',buy)).status).toBe(201)
 const saved=await read()
 for(const c of ['HUF','USD']) {
  const p=preview.by_currency[c].holdings[0],s=saved.by_currency[c].holdings[0]
  for(const key of ['quantity','value','remaining_basis','average_cost','net_invested','realized_gain','total_gain'] as const) expect(s[key]).toEqual(p[key])
 }
 const sale=input({type:'sell',quantity:4,price:120,cash_amount:476,fee_amount:4,date:'2026-01-06'})
 const salePreview=await (await f.request('/investment-trades/preview','POST',sale)).json() as InvestmentMetricsSnapshot & {preview_trade_id:string}
 expect(salePreview.by_currency.HUF.holdings[0]).toMatchObject({quantity:6,remaining_basis:606,average_cost:101,realized_gain:72,total_gain:126})
 expect(salePreview.by_currency.HUF.holdings[0].trade_realized[salePreview.preview_trade_id]).toBe(72)
 expect((await f.request('/investment-trades','POST',sale)).status).toBe(201)
 const current=await read()
 const mcp=await f.tool<Record<string,any>>('get_portfolio',{currency:'HUF'})
 expect(mcp.holdings[0]).toMatchObject({quantity:6,native_value:660,value:660,remaining_basis:606,net_invested:534,realized_gain:72,unrealized_gain:54,gain_loss:126,gain_loss_percent:null})
 expect(current.by_currency.HUF.holdings[0]).toMatchObject({quantity:6,value:660,remaining_basis:606,total_gain:126})
})
it('separates current investment and net-worth scope while preserving all facts on API/MCP reads',async()=>{
 await f.request('/investment-trades','POST',input())
 await f.db.prepare("UPDATE accounts SET exclude_from_net_worth=1 WHERE id='holding'").run()
 const before=await facts()
 expect((await read()).by_currency.HUF.total_value).toBe(1100)
 expect((await read('net_worth')).by_currency.HUF.total_value).toBe(0)
 expect(await f.tool('get_portfolio',{currency:'HUF'})).toMatchObject({total_value:0,holdings:[],scope:'net_worth'})
 expect(await facts()).toEqual(before)
})
it('preview reuses locks, archive, future-date, oversell and settlement validation without making receipts',async()=>{
 for(const patch of [{type:'sell',quantity:1,cash_amount:100,fee_amount:0},{date:'2999-01-01'},{cash_amount:999}]) {
  const before=await facts();const r=await f.request('/investment-trades/preview','POST',input(patch));expect(r.status).toBeGreaterThanOrEqual(400);expect(await facts()).toEqual(before)
 }
 await f.db.prepare("UPDATE accounts SET is_locked=1 WHERE id='cash'").run()
 const before=await facts();expect((await f.request('/investment-trades/preview','POST',input())).status).toBe(409);expect(await facts()).toEqual(before)
})
it('rejects unsupported scope/currency rather than silently changing the reporting ledger',async()=>{
 expect((await f.request('/investment-metrics?scope=other')).status).toBe(400)
 expect((await f.request('/investment-metrics?currencies=SHARE')).status).toBe(400)
})

it('returns EUR in a three-currency preview without changing balances or investment facts',async()=>{
 const before=await facts(),r=await f.request('/investment-trades/preview?currencies=HUF,USD,EUR','POST',input())
 expect(r.status,await r.clone().text()).toBe(200)
 const result=await r.json() as InvestmentMetricsSnapshot
 expect(Object.keys(result.by_currency)).toEqual(['HUF','USD','EUR'])
 expect(result.by_currency.EUR).toMatchObject({currency:'EUR',holdings:[{account_id:'holding',quantity:10}]})
 expect(await facts()).toEqual(before)
})
