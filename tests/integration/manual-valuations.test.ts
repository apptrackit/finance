import { beforeEach, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'
import type { ManualValuation } from '../../shared/manual-valuation'
const f = useFinanceWorkers()
beforeEach(async () => { await f.seed() })
const today = '2026-01-15'
async function create(total = true, balance = 500) {
  const response = await f.request('/accounts','POST',{name:'Synthetic appraisal asset',type:'investment',asset_type:total?'manual':'etf',
    currency:total?'HUF':'SHARE',quote_currency:total?'HUF':'EUR',pricing_method:'manual',balance,
    ...(total?{}:{manual_price:100,manual_price_date:'2026-01-10'}),
    opening:{balance,date:'2026-01-10',...(balance?{cost_amount:400,cost_currency:total?'HUF':'EUR'}:{})}})
  expect(response.status).toBe(201)
  return response.json() as Promise<Record<string,any>>
}
async function account(id: string) { return (await (await f.request('/accounts')).json() as Record<string,any>[]).find(a => a.id===id)! }
async function history(id: string, query = '') {
  const response = await f.request(`/accounts/${id}/valuations${query}`)
  expect(response.status,JSON.stringify(await response.clone().json())).toBe(200)
  return response.json() as Promise<{observations:ManualValuation[];valuation_at:ManualValuation|null;next_cursor:string|null}>
}
async function save(id: string, amount: number, date = today, target: ManualValuation | null = null) {
  return f.request(`/accounts/${id}/valuations`,'PUT',{amount,effective_date:date,expected_version:target?.version??0,expected_id:target?.id??null})
}
async function snapshot() {
  const result: Record<string,unknown> = {}
  for (const table of ['accounts','transactions','investment_transactions','investment_position_anchors','investment_valuations','audit_log','financial_data_revision','investment_trade_operations','investment_trade_sequence']) {
    result[table]=(await f.db.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all()).results
  }
  return result
}
async function trade(id: string, type:'buy'|'sell', date = '2026-01-12', patch:Record<string,unknown> = {}) {
  return f.request('/investment-trades','POST',{idempotency_key:crypto.randomUUID(),holding_account_id:id,cash_account_id:'cash',type,
    quantity:1,price:100,execution_currency:'HUF',cash_amount:100,fee_status:'known',fee_amount:0,date,...patch})
}

it('appraises totals once and unit prices without moving cash, quantities, cost anchors or contributions', async () => {
  for (const total of [true,false]) {
    const a = await create(total,total?500:2)
    const before = await snapshot()
    expect((await save(a.id,120)).status).toBe(200)
    const updated = await account(a.id)
    expect(updated.balance).toBe(total?120:2)
    expect(updated.manual_valuation).toMatchObject({as_of:today,age_days:0,status:'current',observation:{amount:120,kind:total?'total':'per_unit',currency:total?'HUF':'EUR'}})
    if (!total) expect(updated).toMatchObject({manual_price:120,manual_price_date:today})
    const after=await snapshot()
    for (const table of ['transactions','investment_transactions','investment_position_anchors']) expect(after[table]).toEqual(before[table])
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance')).toBe(1000)
    expect((await history(a.id)).observations).toHaveLength(2)
    const summary = await f.tool<{accounts:Record<string,any>[]}>('get_accounts_summary',{currency:'HUF'})
    const portfolio = await f.tool<{holdings:Record<string,any>[]}>('get_portfolio',{currency:'HUF'})
    expect(summary.accounts.find(row=>row.id===a.id)?.manual_valuation.observation).toEqual(updated.manual_valuation.observation)
    expect(portfolio.holdings.find(row=>row.account_id===a.id)).toMatchObject({native_value:total?120:240,net_invested:null,manual_valuation:{observation:updated.manual_valuation.observation}})
  }
})

it('carries forward only, paginates real dates and keeps later appraisals current after backdated corrections', async () => {
  const a=await create()
  await save(a.id,700,'2026-01-14')
  await save(a.id,600,'2026-01-12')
  let h=await history(a.id,'?at=2026-01-13&limit=1')
  expect(h.valuation_at).toMatchObject({effective_date:'2026-01-12',amount:600})
  expect(h.observations).toHaveLength(1); expect(h.next_cursor).toBe('2026-01-12')
  expect((await history(a.id,'?at=2026-01-13&before=2026-01-12&limit=1')).observations[0].effective_date).toBe('2026-01-10')
  expect((await history(a.id,'?at=2026-01-09')).valuation_at).toBeNull()
  const target=h.observations[0]
  expect((await save(a.id,650,'2026-01-12',target)).status).toBe(200)
  h=await history(a.id)
  expect(h.observations).toHaveLength(3)
  expect((await account(a.id)).balance).toBe(700)
  expect((await history(a.id,'?at=2026-01-12')).valuation_at).toMatchObject({amount:650,version:2,id:target.id})
  const audit=await f.db.prepare("SELECT details FROM audit_log WHERE entity='investment_valuation' AND action='UPDATE'").first<string>('details')
  expect(JSON.parse(audit!)).toMatchObject({before:{amount:600},after:{amount:650}})
})

it('guards same-date corrections, concurrent inserts and exact retry without duplicate history/audit', async () => {
  const a=await create()
  const responses=await Promise.all([600,700].map(n=>save(a.id,n)))
  expect(responses.map(r=>r.status).sort()).toEqual([200,409])
  const target=(await history(a.id)).observations[0]
  const before=await snapshot()
  expect((await save(a.id,target.amount)).status).toBe(200)
  expect(await snapshot()).toEqual(before)
  expect((await save(a.id,800,today,target)).status).toBe(200)
  const corrected=await snapshot()
  expect((await save(a.id,900,today,target)).status).toBe(409)
  expect(await snapshot()).toEqual(corrected)
})

it.each([{amount:-1},{amount:1e13},{amount:1e-13},{effective_date:'2026-02-30'},{effective_date:'2026-01-16'},{expected_id:'wrong',expected_version:1},{extra:true}])('rejects invalid input without any financial/audit changes: %j',async patch=>{
  const a=await create(); const before=await snapshot()
  const response=await f.request(`/accounts/${a.id}/valuations`,'PUT',{amount:600,effective_date:today,expected_id:null,expected_version:0,...patch})
  expect([400,409]).toContain(response.status); expect(await snapshot()).toEqual(before)
})

it('handles zero separately from disposal, uses the local 90-day reminder, and protects owned zero assets from archive',async()=>{
  const a=await create()
  expect((await save(a.id,0)).status).toBe(200)
  expect(await account(a.id)).toMatchObject({balance:0,manual_ownership:'owned'})
  expect((await f.request(`/accounts/${a.id}/archive`,'PATCH')).status).toBe(409)
  expect((await f.request(`/accounts/${a.id}`,'PUT',{opening:{balance:0,date:'2026-01-10',owned:false}})).status).toBe(400)
  const response=await f.request('/accounts','GET',undefined,'2026-04-15')
  expect((await response.json() as Record<string,any>[]).find(x=>x.id===a.id)?.manual_valuation).toMatchObject({age_days:90,status:'stale',stale_after_days:90})
  const prior=await f.request('/accounts','GET',undefined,'2026-04-14')
  expect((await prior.json() as Record<string,any>[]).find(x=>x.id===a.id)?.manual_valuation.status).toBe('current')
})

it('blocks locks and archives in API and direct D1 writes; market holdings cannot receive manual appraisals',async()=>{
  const a=await create(); await f.request(`/accounts/${a.id}/lock`,'PATCH')
  const before=await snapshot()
  expect((await save(a.id,600)).status).toBe(409)
  await expect(f.db.prepare("UPDATE investment_valuations SET amount=600,version=version+1 WHERE account_id=?").bind(a.id).run()).rejects.toThrow('ACCOUNT_LOCKED')
  expect(await snapshot()).toEqual(before)
  const empty=await create(true,0); await f.request(`/accounts/${empty.id}/archive`,'PATCH')
  expect((await save(empty.id,600)).status).toBe(409)
  expect((await history(empty.id)).observations).toHaveLength(1)
  await expect(f.db.prepare("DELETE FROM investment_valuations WHERE account_id=?").bind(empty.id).run()).rejects.toThrow('ACCOUNT_ARCHIVED')
  await f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type,pricing_method,symbol) VALUES ('market','Market','investment',0,'SHARE','stock','market','TEST')").run()
  expect((await save('market',100)).status).toBe(400)
  await f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,quote_currency,pricing_method) VALUES ('unknown-category','Legacy unit category','investment',0,'SHARE','EUR','manual')").run()
  await f.db.prepare("INSERT INTO investment_valuations (id,account_id,effective_date,kind,amount,currency,source,created_at,updated_at) VALUES ('unknown-value','unknown-category','2026-01-10','per_unit',0,'EUR','user',1,1)").run()
  await expect(f.db.prepare("UPDATE accounts SET asset_type='etf' WHERE id='unknown-category'").run()).rejects.toThrow('HOLDING_HISTORY_METADATA')
})

it('rolls back history, current mirror, audits and source revision on an injected write failure',async()=>{
  const a=await create(); const before=await snapshot()
  await f.db.prepare("CREATE TRIGGER fail_valuation_mirror BEFORE UPDATE OF balance ON accounts WHEN NEW.id != 'cash' BEGIN SELECT RAISE(ABORT,'injected'); END").run()
  expect((await save(a.id,600)).status).toBe(500)
  expect(await snapshot()).toEqual(before)
})

it('prevents ordinary account overwrites from bypassing dated history and preserves known opening cost',async()=>{
  const a=await create(); const before=await snapshot()
  expect((await f.request(`/accounts/${a.id}`,'PUT',{balance:600,expected_balance:500})).status).toBe(400)
  expect(await snapshot()).toEqual(before)
  const unit=await create(false,2)
  expect((await f.request(`/accounts/${unit.id}`,'PUT',{manual_price:120,manual_price_date:today})).status).toBe(400)
  await save(a.id,600)
  expect((await account(a.id)).holding_position.anchor).toMatchObject({cost_amount:400,cost_currency:'HUF',balance:500})
})

it('separates cash-linked whole-asset acquisition/disposal from appraisals, supports retry, sale reversal and export',async()=>{
  const a=await create(true,0)
  const purchase=await trade(a.id,'buy')
  expect(purchase.status,JSON.stringify(await purchase.clone().json())).toBe(201)
  const bought=await purchase.json() as {trade_id:string;cash_transaction_id:string}
  expect(await account(a.id)).toMatchObject({balance:100,manual_ownership:'owned'})
  await save(a.id,150,'2026-01-13')
  expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance')).toBe(900)
  const sale=await trade(a.id,'sell','2026-01-14',{price:180,cash_amount:175,fee_amount:5})
  expect(sale.status).toBe(201)
  const sold=await sale.json() as {trade_id:string;cash_transaction_id:string}
  expect(await account(a.id)).toMatchObject({balance:0,manual_ownership:'disposed'})
  await save(a.id,160,today) // observation is not reacquisition
  expect((await account(a.id)).balance).toBe(0)
  expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance')).toBe(1075)
  expect((await f.request(`/transactions/${sold.cash_transaction_id}`,'DELETE')).status).toBe(200)
  expect(await account(a.id)).toMatchObject({balance:160,manual_ownership:'owned'})
  expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance')).toBe(900)
  const exported=await (await f.request('/export')).json() as Record<string,any>
  expect(exported.data.investment_valuations).toEqual(expect.arrayContaining([expect.objectContaining({amount:160,effective_date:today})]))
  expect(exported.data.investment_transactions).toEqual(expect.arrayContaining([expect.objectContaining({id:bought.trade_id,asset_event:'acquisition',quantity:1,cash_amount:100})]))
})

it('blocks double acquisition, partial disposal, negative ownership prefixes and disposal of unknown legacy zero',async()=>{
  const a=await create(true,0)
  expect((await trade(a.id,'sell')).status).toBe(409)
  expect((await trade(a.id,'buy')).status).toBe(201)
  const before=await snapshot()
  expect((await trade(a.id,'buy')).status).toBe(409)
  expect((await trade(a.id,'sell','2026-01-13',{quantity:0.5,price:200})).status).toBe(400)
  expect((await trade(a.id,'sell','2026-01-11')).status).toBe(409)
  expect(await snapshot()).toEqual(before)
  await f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type,pricing_method) VALUES ('unknown','Unknown','investment',0,'HUF','manual','manual')").run()
  expect((await trade('unknown','sell')).status).toBe(409)
  expect((await f.request('/accounts/unknown/archive','PATCH')).status).toBe(409)
})

it('records known zero proceeds for a worthless full disposal and permits archive only after disposal',async()=>{
  const a=await create()
  const response=await trade(a.id,'sell','2026-01-12',{price:0,cash_amount:0})
  expect(response.status,JSON.stringify(await response.clone().json())).toBe(201)
  expect(await account(a.id)).toMatchObject({balance:0,manual_ownership:'disposed'})
  expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance')).toBe(1000)
  expect((await f.request(`/accounts/${a.id}/archive`,'PATCH')).status).toBe(200)
})

it('keeps an explicitly owned zero opening distinct from an empty asset awaiting purchase',async()=>{
  const response=await f.request('/accounts','POST',{name:'Owned worthless asset',type:'investment',asset_type:'manual',currency:'HUF',balance:0,
    opening:{balance:0,date:'2026-01-10',owned:true,cost_amount:50,cost_currency:'HUF'}})
  expect(response.status).toBe(201)
  const a=await response.json() as Record<string,any>
  expect(await account(a.id)).toMatchObject({balance:0,manual_ownership:'owned',holding_position:{anchor:{owned:true,cost_amount:50}}})
  expect((await f.request(`/accounts/${a.id}/archive`,'PATCH')).status).toBe(409)
  expect((await trade(a.id,'buy')).status).toBe(409)
  expect((await trade(a.id,'sell')).status).toBe(201)
})

it('guards manual trade edits/deletes against later disposals and atomically preserves both ledgers on failure',async()=>{
  const a=await create(true,0)
  const buy=await (await trade(a.id,'buy')).json() as {trade_id:string;cash_transaction_id:string}
  await trade(a.id,'sell','2026-01-14')
  const before=await snapshot()
  expect((await f.request(`/investment-trades/${buy.trade_id}`,'DELETE')).status).toBe(409)
  expect(await snapshot()).toEqual(before)
  expect((await f.request(`/investment-trades/${buy.trade_id}`,'PUT',{idempotency_key:crypto.randomUUID(),expected_version:1,
    holding_account_id:a.id,cash_account_id:'cash',type:'buy',quantity:1,price:110,execution_currency:'HUF',cash_amount:110,
    fee_status:'known',fee_amount:0,date:'2026-01-15'})).status).toBe(409)
  expect(await snapshot()).toEqual(before)
  await f.db.prepare("CREATE TRIGGER fail_manual_trade_audit BEFORE INSERT ON audit_log WHEN NEW.entity='investment_transaction' BEGIN SELECT RAISE(ABORT,'injected'); END").run()
  const empty=await create(true,0)
  const baseline=await snapshot()
  expect((await trade(empty.id,'buy')).status).toBe(500)
  expect(await snapshot()).toEqual(baseline)
})

it('does not let a stale valuation editor correct an acquisition observation replaced by a trade edit',async()=>{
  const a=await create(true,0)
  const buy=await (await trade(a.id,'buy')).json() as {trade_id:string}
  const prior=(await history(a.id)).observations[0]
  const edit=await f.request(`/investment-trades/${buy.trade_id}`,'PUT',{idempotency_key:crypto.randomUUID(),expected_version:1,
    holding_account_id:a.id,cash_account_id:'cash',type:'buy',quantity:1,price:110,execution_currency:'HUF',cash_amount:110,
    fee_status:'known',fee_amount:0,date:'2026-01-12'})
  expect(edit.status).toBe(200)
  const before=await snapshot()
  expect((await save(a.id,150,prior.effective_date,prior)).status).toBe(409)
  expect(await snapshot()).toEqual(before)
})
