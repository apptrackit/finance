import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

type Transaction = { id: string; amount: number; status: string; pending_kind: string; review_source: string; review_batch_id: string; review_flags: string[] }
type Proposal = { proposal_id: string }
type Drafts = { drafts: Transaction[]; idempotent_replay: boolean }
const initialBalances = [{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }]

describe('compiled API and MCP Workers sharing D1', () => {
  const f = useFinanceWorkers()
  beforeEach(() => f.seed())

  async function createTransaction(overrides = {}) {
    const response = await f.request('/transactions', 'POST', {
      account_id: 'cash', category_id: 'food', amount: -50, date: '2026-01-15', ...overrides,
    })
    expect(response.status, await response.clone().text()).toBe(201)
    return response.json() as Promise<Transaction>
  }
  async function prepare(items = [{ type: 'expense', amount: 50, account_id: 'cash', category_id: 'food', date: '2026-01-15' }]) {
    const { proposal_id } = await f.tool<Proposal>('prepare_mcp_transaction_drafts', { items })
    return { proposal_id }
  }

  it('enforces API origin/key checks, preflight, and body validation before writes', async () => {
    expect((await f.api.fetch('/accounts')).status).toBe(403)
    expect((await f.api.fetch('/accounts', { headers: { Origin: 'https://wrong.test', 'X-API-Key': 'integration-test-key' } })).status).toBe(403)
    expect((await f.api.fetch('/accounts', { headers: { Origin: 'https://finance.test' } })).status).toBe(401)
    const preflight = await f.api.fetch('/transactions', { method: 'OPTIONS', headers: { Origin: 'https://finance.test' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('X-Client-Date')
    expect((await f.request('/transactions', 'POST', { account_id: 'cash', amount: 0, date: 'bad-date' })).status).toBe(400)
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(0)
    expect(await f.balances()).toEqual(initialBalances)
  })

  it('verifies signed Access tokens and rejects invalid claims before reaching MCP tools', async () => {
    expect((await f.mcp.fetch('/mcp', { method: 'POST' })).status).toBe(401)
    for (const [claims, code] of [
      [{ exp: 1 }, 'access_assertion_expired'],
      [{ nbf: Math.floor(Date.now() / 1000) + 3600 }, 'access_assertion_expired'],
      [{ iss: 'https://wrong.test' }, 'access_issuer_mismatch'],
      [{ aud: ['wrong'] }, 'access_audience_mismatch'],
      [{ email: 'wrong@example.com' }, 'access_email_mismatch'],
    ] as const) {
      const response = await f.mcp.fetch('/mcp', { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': await f.accessToken(claims) } })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ code })
    }
    const token = await f.accessToken()
    const [header, payload, signature] = token.split('.')
    const tampered = `${header}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), email: 'attacker@example.com' })).toString('base64url')}.${signature}`
    const response = await f.mcp.fetch('/mcp', { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': tampered } })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'access_signature_invalid' })
    // A valid signed token must also work, preventing an always-reject implementation.
    expect(await f.tool('get_accounts_summary', { currency: 'HUF' })).toMatchObject({ totals: { cash_balance: 1200 } })
  })

  it('keeps future transactions pending until the client calendar permits one balance change', async () => {
    const tx = await createTransaction({ date: '2026-01-16' })
    expect(tx.status).toBe('pending')
    expect(await f.balances()).toEqual(initialBalances)
    expect(await (await f.request('/transactions')).json()).toEqual([])
    expect((await f.request(`/transactions/${tx.id}/confirm`, 'POST')).status).toBe(400)
    const responses = await Promise.all(Array.from({ length: 4 }, () => f.request(`/transactions/${tx.id}/confirm`, 'POST', undefined, '2026-01-16')))
    expect(responses.some(response => response.status === 200)).toBe(true)
    expect(responses.every(response => response.status === 200 || response.status === 400)).toBe(true)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 950 }, { id: 'savings', balance: 200 }])
    expect(await f.db.prepare('SELECT status, confirmed_at FROM transactions WHERE id = ?').bind(tx.id).first()).toMatchObject({ status: 'posted', confirmed_at: expect.any(Number) })
    await f.request(`/transactions/${tx.id}/confirm`, 'POST', undefined, '2026-01-16')
    expect((await f.balances())[0].balance).toBe(950)
  })

  it('rolls back the confirmation claim and balance if a later D1 statement fails', async () => {
    const tx = await createTransaction({ status: 'pending' })
    await f.db.prepare(`CREATE TRIGGER reject_post BEFORE UPDATE ON transactions
      WHEN NEW.status = 'posted' BEGIN SELECT RAISE(ABORT, 'injected posting failure'); END`).run()
    expect((await f.request(`/transactions/${tx.id}/confirm`, 'POST')).status).toBe(400)
    expect(await f.balances()).toEqual(initialBalances)
    expect(await f.db.prepare('SELECT status, confirmed_at FROM transactions WHERE id = ?').bind(tx.id).first()).toEqual({ status: 'pending', confirmed_at: null })
    await f.db.prepare('DROP TRIGGER reject_post').run()
    expect((await f.request(`/transactions/${tx.id}/confirm`, 'POST')).status).toBe(200)
    expect((await f.balances())[0].balance).toBe(950)
  })

  it('creates a proposal once under concurrent retries, isolates review drafts, and preserves provenance on confirmation', async () => {
    const proposal = await prepare()
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(0)
    const results = await Promise.all(Array.from({ length: 3 }, () => f.tool<Drafts>('create_mcp_transaction_drafts', proposal)))
    const draft = results[0].drafts[0]
    expect(results.every(result => result.drafts[0].id === draft.id)).toBe(true)
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(1)
    expect(await f.db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'CREATE'").first('count')).toBe(1)
    expect(await f.balances()).toEqual(initialBalances)
    expect(await (await f.request('/transactions')).json()).toEqual([])
    await createTransaction({ amount: -20, status: 'pending' })
    expect(await f.tool('get_recurring_forecast', { currency: 'HUF', start_date: '2026-01-15', end_date: '2026-01-16' })).toMatchObject({ summary: { pending_one_time_count: 1, pending_expenses: 20 } })
    expect((await f.request(`/transactions/${draft.id}`, 'PUT', { amount: -75, description: 'Reviewed expense' })).status).toBe(200)
    expect(await f.balances()).toEqual(initialBalances)
    expect((await f.request(`/transactions/${draft.id}/confirm`, 'POST')).status).toBe(200)
    const posted = await (await f.request('/transactions')).json() as Transaction[]
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ id: draft.id, amount: -75, status: 'posted', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: proposal.proposal_id, review_flags: draft.review_flags })
    expect((await f.balances())[0].balance).toBe(925)
    expect((await f.tool<Drafts>('create_mcp_transaction_drafts', proposal)).idempotent_replay).toBe(true)
    expect((await f.balances())[0].balance).toBe(925)
  })

  it('rolls back proposal consumption, batch, drafts and audit together, allowing a clean retry', async () => {
    const proposal = await prepare()
    await f.db.prepare("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END").run()
    await expect(f.tool('create_mcp_transaction_drafts', proposal)).rejects.toThrow('injected audit failure')
    for (const table of ['transactions', 'audit_log', 'mcp_draft_batches']) {
      expect(await f.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first('count')).toBe(0)
    }
    expect(await f.db.prepare('SELECT consumed_at FROM mcp_draft_proposals WHERE id = ?').bind(proposal.proposal_id).first()).toEqual({ consumed_at: null })
    expect(await f.balances()).toEqual(initialBalances)
    await f.db.prepare('DROP TRIGGER reject_audit').run()
    expect((await f.tool<Drafts>('create_mcp_transaction_drafts', proposal)).drafts).toHaveLength(1)
  })

  it('enforces account locks at create and confirm time, and declining never changes balances', async () => {
    const proposal = await prepare()
    const tx = await createTransaction({ status: 'pending' })
    expect((await f.request('/accounts/cash/lock', 'PATCH')).status).toBe(200)
    await expect(f.tool('create_mcp_transaction_drafts', proposal)).rejects.toThrow(/locked/)
    expect((await f.request(`/transactions/${tx.id}/confirm`, 'POST')).status).toBe(409)
    expect((await f.request('/transactions', 'POST', { account_id: 'cash', amount: -10, date: '2026-01-15' })).status).toBe(409)
    expect(await f.balances()).toEqual(initialBalances)
    await f.request('/accounts/cash/unlock', 'PATCH')
    expect((await f.request(`/transactions/${tx.id}/decline`, 'POST')).status).toBe(200)
    expect((await f.request(`/transactions/${tx.id}/confirm`, 'POST')).status).toBe(400)
    expect(await (await f.request('/transactions/upcoming')).json()).toEqual([])
    expect(await f.balances()).toEqual(initialBalances)
  })

  it('keeps both cash transfer rows and balances consistent through edits, locks and deletion', async () => {
    const input = { from_account_id: 'cash', to_account_id: 'savings', amount_from: 100, amount_to: 100, date: '2026-01-15' }
    await f.request('/accounts/savings/lock', 'PATCH')
    expect((await f.request('/transfers', 'POST', input)).status).toBe(409)
    expect(await f.balances()).toEqual(initialBalances)
    await f.request('/accounts/savings/unlock', 'PATCH')
    const response = await f.request('/transfers', 'POST', input)
    expect(response.status).toBe(201)
    const transfer = await response.json() as { outgoing_transaction_id: string; incoming_transaction_id: string }
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 900 }, { id: 'savings', balance: 300 }])
    expect((await f.request(`/transactions/${transfer.outgoing_transaction_id}`, 'PUT', { amount: -150, amount_to: 150 })).status).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 850 }, { id: 'savings', balance: 350 }])
    const rows = (await f.db.prepare('SELECT id, linked_transaction_id, amount FROM transactions ORDER BY amount').all()).results
    expect(rows).toEqual([
      { id: transfer.outgoing_transaction_id, linked_transaction_id: transfer.incoming_transaction_id, amount: -150 },
      { id: transfer.incoming_transaction_id, linked_transaction_id: transfer.outgoing_transaction_id, amount: 150 },
    ])
    await f.request('/accounts/savings/lock', 'PATCH')
    expect((await f.request(`/transactions/${transfer.outgoing_transaction_id}`, 'DELETE')).status).toBe(409)
    await f.request('/accounts/savings/unlock', 'PATCH')
    expect((await f.request(`/transactions/${transfer.outgoing_transaction_id}`, 'DELETE')).status).toBe(200)
    expect(await f.balances()).toEqual(initialBalances)
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(0)
  })

  it('does not consume recurring occurrences while locked, and executes each once after unlocking', async () => {
    await f.db.batch([
      f.db.prepare("INSERT INTO recurring_schedules (id, type, frequency, account_id, amount, created_at, remaining_occurrences) VALUES ('expense', 'transaction', 'daily', 'savings', -25, 1, 1)"),
      f.db.prepare("INSERT INTO recurring_schedules (id, type, frequency, account_id, to_account_id, amount, amount_to, created_at, remaining_occurrences) VALUES ('transfer', 'transfer', 'daily', 'cash', 'savings', 100, 100, 1, 1)"),
    ])
    await f.request('/accounts/savings/lock', 'PATCH')
    await f.api.scheduled({ cron: '0 0 * * *' })
    expect(await f.balances()).toEqual(initialBalances)
    expect((await f.db.prepare('SELECT remaining_occurrences, last_processed_date, is_active FROM recurring_schedules').all()).results).toEqual([
      { remaining_occurrences: 1, last_processed_date: null, is_active: 1 },
      { remaining_occurrences: 1, last_processed_date: null, is_active: 1 },
    ])
    await f.request('/accounts/savings/unlock', 'PATCH')
    await f.api.scheduled({ cron: '0 0 * * *' })
    await f.api.scheduled({ cron: '0 0 * * *' })
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 900 }, { id: 'savings', balance: 275 }])
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(3)
    expect((await f.db.prepare('SELECT remaining_occurrences, is_active FROM recurring_schedules').all()).results).toEqual([
      { remaining_occurrences: 0, is_active: 0 }, { remaining_occurrences: 0, is_active: 0 },
    ])
  })

  it('converts available FX rates and explicitly excludes unavailable currencies from totals', async () => {
    await f.db.batch([
      f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency) VALUES ('euros', 'Test euros', 'cash', 100, 'EUR')"),
      f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency) VALUES ('pounds', 'Test pounds', 'cash', 75, 'GBP')"),
    ])
    const summary = await f.tool<{ accounts: unknown[]; warnings: string[] }>('get_accounts_summary', { currency: 'HUF' })
    expect(summary).toMatchObject({ totals: { cash_balance: 41200 }, conversion_status: 'partial' })
    expect(summary.accounts).toContainEqual(expect.objectContaining({ id: 'euros', native_balance: 100, converted_balance: 40000 }))
    expect(summary.accounts).toContainEqual(expect.objectContaining({ id: 'pounds', native_balance: 75, converted_balance: null }))
    expect(summary.warnings.join(' ')).toContain('GBP')
  })

  it('preserves fractional investment quantities and linked cash when a purchase is deleted', async () => {
    await f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, quote_currency, symbol, asset_type) VALUES ('investment', 'Test asset', 'investment', 2, 'TEST', 'EUR', 'TEST', 'stock')").run()
    const response = await f.request('/transfers', 'POST', { from_account_id: 'cash', to_account_id: 'investment', amount_from: 20000, amount_to: 0.125, price: 400, date: '2026-01-15' })
    expect(response.status).toBe(201)
    const transfer = await response.json() as { outgoing_transaction_id: string; incoming_transaction_id: string }
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'investment'").first('balance')).toBe(2.125)
    expect(await f.db.prepare('SELECT quantity, price, total_amount FROM investment_transactions WHERE id = ?').bind(transfer.incoming_transaction_id).first()).toEqual({ quantity: 0.125, price: 400, total_amount: 50 })
    expect(await f.db.prepare('SELECT amount, linked_transaction_id FROM transactions WHERE id = ?').bind(transfer.outgoing_transaction_id).first()).toEqual({ amount: -20000, linked_transaction_id: transfer.incoming_transaction_id })
    await f.request('/accounts/investment/lock', 'PATCH')
    expect((await f.request(`/transactions/${transfer.outgoing_transaction_id}`, 'DELETE')).status).toBe(409)
    await f.request('/accounts/investment/unlock', 'PATCH')
    await f.db.prepare("CREATE TRIGGER reject_purchase_delete BEFORE DELETE ON investment_transactions BEGIN SELECT RAISE(ABORT, 'injected deletion failure'); END").run()
    expect((await f.request(`/transactions/${transfer.outgoing_transaction_id}`, 'DELETE')).status).toBe(500)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'cash'").first('balance')).toBe(-19000)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'investment'").first('balance')).toBe(2.125)
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(1)
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM investment_transactions').first('count')).toBe(1)
    await f.db.prepare('DROP TRIGGER reject_purchase_delete').run()
    const deleted = await Promise.all(Array.from({ length: 3 }, () => f.request(`/transactions/${transfer.outgoing_transaction_id}`, 'DELETE')))
    expect(deleted.map(result => result.status)).toEqual([200, 200, 200])
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'investment'").first('balance')).toBe(2)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'cash'").first('balance')).toBe(1000)
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM investment_transactions').first('count')).toBe(0)
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(0)
  })
})
