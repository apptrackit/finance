import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

describe('direct cash investment trade writer', () => {
  const f = useFinanceWorkers()
  const input = (changes: Record<string,unknown> = {}) => ({ idempotency_key:crypto.randomUUID(),holding_account_id:'holding',cash_account_id:'cash',
    type:'buy',quantity:2,price:50,execution_currency:'EUR',cash_amount:40400,fee_status:'known',fee_amount:400,date:'2026-01-10',...changes })
  beforeEach(async () => {
    await f.seed()
    for (const [id,quote] of [['holding','EUR'],['other','EUR'],['tiny','HUF']]) {
      await f.db.batch([
        f.db.prepare(`INSERT INTO accounts (id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit) VALUES (?,?,'investment',0,'SHARE',?,'etf','manual','SHARE')`).bind(id,id,quote),
        f.db.prepare(`INSERT INTO investment_position_anchors (id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES (?,?,'opening','2026-01-01',0,1,0)`).bind(`open:${id}`,id),
      ])
    }
    await f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency) VALUES ('euro','Euro cash','checking',1000,'EUR')").run()
  })
  async function post(changes: Record<string,unknown> = {}) {
    const response = await f.request('/investment-trades','POST',input(changes))
    expect(response.status,await response.clone().text()).toBe(201)
    return response.json() as Promise<{ trade_id:string;cash_transaction_id:string }>
  }
  async function state() {
    const out: Record<string,unknown> = {}
    for (const table of ['accounts','transactions','investment_transactions','investment_position_anchors','audit_log','financial_data_revision','investment_trade_operations','investment_trade_sequence']) {
      out[table] = (await f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results
    }
    return out
  }
  async function balance(id: string) { return f.db.prepare('SELECT balance FROM accounts WHERE id = ?').bind(id).first('balance') }

  it('keeps gross execution, exact net cash and included fee as separate reciprocal facts across reads', async () => {
    const p = await post()
    const trade = { id:p.trade_id,linked_transaction_id:p.cash_transaction_id,quantity:2,price:50,total_amount:100,
      gross_amount:100,execution_currency:'EUR',cash_amount:40400,cash_currency:'HUF',fee_amount:400,fee_currency:'HUF',fee_status:'known',effective_order:1 }
    expect(await balance('holding')).toBe(2)
    expect(await balance('cash')).toBe(-39400)
    expect(await (await f.request('/investment-transactions')).json()).toEqual([expect.objectContaining(trade)])
    expect(await (await f.request('/transactions/history')).json()).toMatchObject({ investments:[expect.objectContaining(trade)] })
    expect(await f.tool('get_investment_activity',{})).toMatchObject({ activities:[expect.objectContaining({ ...trade,transaction_currency:'EUR',execution_currency_status:'recorded' })] })
    expect(await (await f.request('/export')).json()).toMatchObject({ data:{ investment_transactions:[expect.objectContaining(trade)] } })
    expect(await f.db.prepare('SELECT amount,linked_transaction_id FROM transactions WHERE id = ?').bind(p.cash_transaction_id).first()).toEqual({ amount:-40400,linked_transaction_id:p.trade_id })
    expect((await state()).audit_log).toHaveLength(2)
  })
  it('credits exact proceeds and removes only the sold units; deleting either side reverses once', async () => {
    await post()
    const p = await post({ type:'sell',quantity:0.5,price:60,cash_amount:11900,fee_amount:100,date:'2026-01-11' })
    expect(await balance('holding')).toBe(1.5)
    expect(await balance('cash')).toBe(-27500)
    const responses = await Promise.all([f.request(`/investment-transactions/${p.trade_id}`,'DELETE'),f.request(`/transactions/${p.cash_transaction_id}`,'DELETE')])
    expect(responses.map(r => r.status)).toEqual([200,200])
    expect(await balance('holding')).toBe(2)
    expect(await balance('cash')).toBe(-39400)
  })
  it('uses confirmed same-currency fees and settlement rounding without rounding units', async () => {
    await post({ cash_account_id:'euro',cash_amount:101,fee_amount:1 })
    await post({ cash_account_id:'euro',quantity:0.125,price:1.234,cash_amount:0.15,fee_amount:0 })
    expect(await balance('holding')).toBe(2.125)
    expect(await balance('euro')).toBe(898.85)
    const sale = await post({ cash_account_id:'euro',type:'sell',quantity:0.125,price:2,cash_amount:0.24,fee_amount:0.01 })
    expect(await balance('holding')).toBe(2)
    expect(await f.db.prepare('SELECT gross_amount,fee_amount,cash_amount FROM investment_transactions WHERE id = ?').bind(sale.trade_id).first()).toEqual({ gross_amount:0.25,fee_amount:0.01,cash_amount:0.24 })
  })
  it('preserves an explicitly unknown cross-currency fee breakdown without inferring a fee', async () => {
    const p = await post({ fee_status:'unknown',fee_amount:null })
    expect(await f.db.prepare('SELECT fee_status,fee_amount,fee_currency FROM investment_transactions WHERE id = ?').bind(p.trade_id).first()).toEqual({ fee_status:'unknown',fee_amount:null,fee_currency:null })
  })
  it('records execution currency independently of the holding quote metadata', async () => {
    const p=await post({execution_currency:'USD'})
    expect(await f.db.prepare('SELECT execution_currency,cash_currency FROM investment_transactions WHERE id=?').bind(p.trade_id).first()).toEqual({execution_currency:'USD',cash_currency:'HUF'})
    expect(await f.db.prepare("SELECT quote_currency FROM accounts WHERE id='holding'").first('quote_currency')).toBe('EUR')
  })
  it('bounds active retry receipts and cleans expired receipts before admitting a new trade', async () => {
    await f.db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
      INSERT INTO investment_trade_operations SELECT 'key:'||x,'token:'||x,'synthetic','{}',?,? FROM n`).bind(Date.now(),Date.now()+86400000).run()
    const before=await state()
    expect((await f.request('/investment-trades','POST',input())).status).toBe(429)
    expect(await state()).toEqual(before)
    await f.db.prepare('UPDATE investment_trade_operations SET expires_at=1').run()
    await post()
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM investment_trade_operations').first('n')).toBe(1)
  })
  it.each([
    { cash_account_id:'euro',cash_amount:100,fee_status:'unknown',fee_amount:null },
    { cash_account_id:'euro',cash_amount:100,fee_amount:1 },
    { fee_amount:40400 }, { fee_amount:-1 }, { cash_amount:12.001 }, { quantity:1e-13 },
    { price:Infinity }, { execution_currency:'XYZ' }, { date:'2026-02-30' }, { date:'2026-01-16' },
    { fee_status:'known',fee_amount:null }, { fee_status:'unknown',fee_amount:1 },
  ])('rejects invalid execution/fee/date/precision input without writes (%j)', async changes => {
    const before = await state()
    const r = await f.request('/investment-trades','POST',input(changes))
    expect(r.status,await r.clone().text()).toBe(400)
    expect(await r.json()).toMatchObject({ code:'VALIDATION_ERROR' })
    expect(await state()).toEqual(before)
  })
  it('applies simultaneous retries with one request key only once and rejects changed payload reuse', async () => {
    const body = input()
    const responses = await Promise.all(Array.from({length:6},() => f.request('/investment-trades','POST',body)))
    expect(responses.every(r => r.status===201)).toBe(true)
    const ids = await Promise.all(responses.map(r => r.json()))
    expect(ids.every(v => JSON.stringify(v)===JSON.stringify(ids[0]))).toBe(true)
    expect(await balance('holding')).toBe(2)
    expect((await state()).audit_log).toHaveLength(2)
    expect((await f.request('/investment-trades','POST',{...body,cash_amount:40000})).status).toBe(409)
  })
  it('permits independent concurrent buys while preventing simultaneous overselling', async () => {
    await Promise.all(Array.from({length:4},() => post({ quantity:0.25,cash_amount:5000,fee_amount:0 })))
    expect(await balance('holding')).toBe(1)
    const sale = () => f.request('/investment-trades','POST',input({ type:'sell',quantity:0.75,cash_amount:15000,fee_amount:0 }))
    const responses = await Promise.all([sale(),sale()])
    expect(responses.map(r => r.status).sort()).toEqual([201,409])
    expect(await balance('holding')).toBe(0.25)
  })
  it('rejects backdated sells, removal of a funding buy and edits that break later positions', async () => {
    const buy = await post({ date:'2026-01-12' })
    const before = await state()
    expect((await f.request('/investment-trades','POST',input({ type:'sell',quantity:1,date:'2026-01-11' }))).status).toBe(409)
    expect(await state()).toEqual(before)
    await post({ type:'sell',quantity:1,date:'2026-01-13',cash_amount:20000,fee_amount:0 })
    const current = await state()
    expect((await f.request(`/investment-trades/${buy.trade_id}`,'DELETE')).status).toBe(409)
    expect((await f.request(`/investment-trades/${buy.trade_id}`,'PUT',input({ expected_version:1, quantity:0.5,date:'2026-01-12' }))).status).toBe(409)
    expect((await f.request(`/investment-trades/${buy.trade_id}`,'PUT',input({ expected_version:1, date:'2026-01-14' }))).status).toBe(409)
    expect(await state()).toEqual(current)
  })
  it('retains durable same-day order through edits, deletion and subsequent inserts', async () => {
    const buy = await post()
    await post({ type:'sell',quantity:1,cash_amount:20000,fee_amount:0 })
    expect((await f.request(`/investment-trades/${buy.trade_id}`,'PUT',input({ expected_version:1, quantity:0.5 }))).status).toBe(409)
    const p = await post({ holding_account_id:'other' })
    await f.request(`/investment-trades/${p.trade_id}`,'DELETE')
    const next = await post({ holding_account_id:'other' })
    expect(await f.db.prepare('SELECT effective_order FROM investment_transactions WHERE id = ?').bind(next.trade_id).first('effective_order')).toBe(4)
  })
  it('moves an edited pair across four unlocked accounts atomically and preserves linked IDs', async () => {
    const p = await post()
    const r = await f.request(`/investment-trades/${p.cash_transaction_id}`,'PUT',input({ expected_version:1, holding_account_id:'other',cash_account_id:'savings',quantity:3,cash_amount:60000 }))
    expect(r.status,await r.clone().text()).toBe(200)
    expect(await r.json()).toMatchObject(p)
    expect(await balance('holding')).toBe(0)
    expect(await balance('cash')).toBe(1000)
    expect(await balance('other')).toBe(3)
    expect(await balance('savings')).toBe(-59800)
  })
  it.each(['transactions','investment_transactions','audit_log'])('rolls back the entire create batch on %s failure', async table => {
    const before = await state()
    await f.db.prepare(`CREATE TRIGGER injected BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected failure'); END`).run()
    expect((await f.request('/investment-trades','POST',input())).status).toBe(500)
    expect(await state()).toEqual(before)
  })
  it.each(['holding','cash'])('enforces locks and archives on %s before all mutations', async account => {
    const p = await post()
    await f.request(`/accounts/${account}/lock`,'PATCH')
    const before = await state()
    expect((await f.request('/investment-trades','POST',input())).status).toBe(409)
    expect((await f.request(`/investment-trades/${p.trade_id}`,'PUT',input({expected_version:1}))).status).toBe(409)
    expect((await f.request(`/investment-trades/${p.trade_id}`,'DELETE')).status).toBe(409)
    expect(await state()).toEqual(before)
  })
  it('supports the minimum coin/share quantity without losing or cash-rounding it', async () => {
    const p = await post({ holding_account_id:'tiny',quantity:1e-12,price:1e12,execution_currency:'HUF',cash_amount:1,fee_amount:0 })
    expect(await balance('tiny')).toBe(1e-12)
    expect((await f.request(`/investment-trades/${p.trade_id}`,'DELETE')).status).toBe(200)
    expect(await balance('tiny')).toBe(0)
  })
  it('reviews a linked legacy trade through the guarded editor without charging cash or units twice', async () => {
    const p=await post()
    await f.db.prepare(`UPDATE investment_transactions SET execution_currency=NULL,gross_amount=NULL,cash_amount=NULL,cash_currency=NULL,
      fee_amount=NULL,fee_currency=NULL,fee_status=NULL,trade_version=0 WHERE id=?`).bind(p.trade_id).run()
    const before=await state(),cashBefore=await balance('cash'),unitsBefore=await balance('holding')
    const read=await f.request(`/investment-trades/${p.trade_id}`)
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({trade:{id:p.trade_id,trade_version:0,execution_currency:null,cash_amount:null},cash_account_id:'cash'})
    expect(await state()).toEqual(before)
    const replacement=input({expected_version:0})
    const preview=await f.request(`/investment-trades/preview?trade_id=${p.trade_id}`,'POST',replacement)
    expect(preview.status,await preview.clone().text()).toBe(200)
    expect(await state()).toEqual(before)
    const saved=await f.request(`/investment-trades/${p.trade_id}`,'PUT',replacement)
    expect(saved.status,await saved.clone().text()).toBe(200)
    expect(await saved.json()).toMatchObject(p)
    expect(await balance('cash')).toBe(cashBefore);expect(await balance('holding')).toBe(unitsBefore)
    expect(await f.db.prepare('SELECT execution_currency,cash_amount,trade_version,linked_transaction_id FROM investment_transactions WHERE id=?').bind(p.trade_id).first())
      .toEqual({execution_currency:'EUR',cash_amount:40400,trade_version:1,linked_transaction_id:p.cash_transaction_id})
    const after=await state()
    expect((await f.request(`/investment-trades/${p.trade_id}`,'PUT',input({expected_version:0}))).status).toBe(409)
    expect(await state()).toEqual(after)
  })
  it('keeps standalone legacy records read-only and never attaches a synthetic cash movement', async () => {
    await f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('legacy','holding','buy',1,10,17,'2026-01-05')").run()
    const before = await state()
    expect((await f.request('/transactions','POST',{account_id:'holding',amount:1,price:10,date:'2026-01-10'})).status).toBe(400)
    expect((await f.request('/investment-transactions','POST',{account_id:'holding',type:'buy',quantity:1,price:10,total_amount:10,date:'2026-01-10'})).status).toBe(400)
    expect((await f.request('/investment-transactions/legacy','DELETE')).status).toBe(409)
    expect(await state()).toEqual(before)
  })
  it('rejects stale/concurrent editor versions and replays an accepted edit without applying it twice', async () => {
    const p = await post()
    const body = input({ expected_version:1,quantity:3 })
    const results = await Promise.all([f.request(`/investment-trades/${p.trade_id}`,'PUT',body),f.request(`/investment-trades/${p.trade_id}`,'PUT',input({expected_version:1,quantity:4}))])
    expect(results.map(r => r.status).sort()).toEqual([200,409])
    const current = await state()
    const winner = results[0].status===200 ? body : null
    if (winner) {
      expect((await f.request(`/investment-trades/${p.trade_id}`,'PUT',winner)).status).toBe(200)
      expect(await state()).toEqual(current)
    }
    expect((await f.request(`/investment-trades/${p.trade_id}`,'PUT',input({expected_version:1}))).status).toBe(409)
    expect(await state()).toEqual(current)
  })
  it.each(['UPDATE','DELETE'])('rolls back an entire %s mutation when its audit write fails', async method => {
    const p = await post()
    const before = await state()
    await f.db.prepare("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'injected audit failure'); END").run()
    const r = await f.request(`/investment-trades/${p.trade_id}`,method==='UPDATE'?'PUT':'DELETE',method==='UPDATE'?input({expected_version:1,quantity:3}):undefined)
    expect(r.status).toBe(500)
    expect(await state()).toEqual(before)
  })
  it('extends an observed legacy position only from its boundary and rejects earlier mutation', async () => {
    await f.db.batch([
      f.db.prepare("DELETE FROM investment_position_anchors WHERE account_id = 'holding'"),
      f.db.prepare("UPDATE accounts SET balance = 3 WHERE id = 'holding'"),
      f.db.prepare("INSERT INTO investment_position_anchors (id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES ('observed','holding','observed','2026-01-10',3,1,0)"),
    ])
    await post({type:'sell',quantity:1,cash_amount:20000,fee_amount:0})
    expect(await balance('holding')).toBe(2)
    const before = await state()
    expect((await f.request('/investment-trades','POST',input({date:'2026-01-09'}))).status).toBe(409)
    expect(await state()).toEqual(before)
    expect(await (await f.request('/accounts')).json()).toEqual(expect.arrayContaining([expect.objectContaining({id:'holding',holding_position:expect.objectContaining({anchor:expect.objectContaining({kind:'observed'})})})]))
  })
  it('blocks cash-ledger, pending-confirmation and schedule paths from bypassing the unit writer', async () => {
    const cash = await f.request('/transactions','POST',{account_id:'cash',amount:10,date:'2026-01-10'})
    const row = await cash.json() as {id:string}
    await f.db.prepare("INSERT INTO transactions (id,account_id,amount,date,status,pending_kind) VALUES ('pending-holding','holding',1,'2026-01-10','pending','upcoming')").run()
    const before = await state()
    expect((await f.request(`/transactions/${row.id}`,'PUT',{account_id:'holding'})).status).toBe(400)
    expect((await f.request('/transactions/pending-holding/confirm','POST')).status).toBe(400)
    expect((await f.request('/recurring-schedules','POST',{account_id:'holding',type:'transaction',frequency:'daily',amount:1,category_id:'food'})).status).toBe(400)
    expect(await state()).toEqual(before)
    await f.db.prepare("INSERT INTO recurring_schedules (id,account_id,type,frequency,amount,is_active,created_at,remaining_occurrences) VALUES ('legacy-schedule','holding','transaction','daily',1,1,1,3)").run()
    const scheduled = await state()
    expect((await f.request('/test-scheduled-task','POST')).status).toBe(200)
    expect(await state()).toEqual(scheduled)
    expect(await f.db.prepare("SELECT last_processed_date,remaining_occurrences,is_active FROM recurring_schedules WHERE id='legacy-schedule'").first()).toEqual({last_processed_date:null,remaining_occurrences:3,is_active:1})
  })
})
