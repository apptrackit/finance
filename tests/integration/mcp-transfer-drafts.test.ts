import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

type Proposal = { proposal_id: string; preview: Array<{ debit_amount: number; credit_amount: number; from_currency: string; to_currency: string; effective_fx_rate: number; warnings: string[] }> }
type Created = { drafts: Array<{ outgoing_id: string; incoming_id: string; debit_amount: number; credit_amount: number; from_currency: string; to_currency: string; effective_fx_rate: number }>; idempotent_replay: boolean }

describe('MCP cash transfer review pairs', () => {
  const f = useFinanceWorkers()
  beforeEach(() => f.seed())
  const input = { from_account_id: 'cash', to_account_id: 'savings', amount: 125, date: '2026-01-15', description: 'Move to savings' }

  async function prepare(overrides = {}) {
    return f.tool<Proposal>('prepare_mcp_transfer_drafts', { items: [{ ...input, ...overrides }] })
  }
  async function create(overrides = {}) {
    const proposal = await prepare(overrides)
    return f.tool<Created>('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })
  }

  it('previews, creates reciprocal pending legs once, and keeps balances and projections untouched', async () => {
    const beforeRevision = await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')
    const proposal = await prepare()
    expect(proposal.preview[0]).toMatchObject({ debit_amount: -125, credit_amount: 125, from_currency: 'HUF', to_currency: 'HUF', effective_fx_rate: 1, warnings: [] })
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    expect(await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')).toBe(beforeRevision)
    const results = await Promise.all(Array.from({ length: 3 }, () => f.tool<Created>('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })))
    expect(results.map(result => result.drafts[0].outgoing_id)).toEqual(Array(3).fill(results[0].drafts[0].outgoing_id))
    const { outgoing_id, incoming_id } = results[0].drafts[0]
    expect((await f.db.prepare('SELECT id, linked_transaction_id, amount, status, pending_kind, review_source, review_batch_id FROM transactions ORDER BY amount').all()).results)
      .toEqual([
        { id: outgoing_id, linked_transaction_id: incoming_id, amount: -125, status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: proposal.proposal_id },
        { id: incoming_id, linked_transaction_id: outgoing_id, amount: 125, status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: proposal.proposal_id },
      ])
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    expect((await f.tool<{ summary: { pending_one_time_count: number } }>('get_recurring_forecast', { currency: 'HUF', start_date: '2026-01-15', end_date: '2026-01-16' })).summary.pending_one_time_count).toBe(0)
    expect(await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')).toBe(beforeRevision)
    expect((await f.request(`/transactions/${incoming_id}`, 'PUT', { amount: 1 })).status).toBe(400)
    expect((await f.request(`/transactions/${incoming_id}`, 'DELETE')).status).toBe(400)
    const duplicate = await prepare()
    expect(duplicate.preview[0].warnings).toContain('possible_duplicate')
    await expect(f.tool('create_mcp_transaction_drafts', { proposal_id: proposal.proposal_id })).rejects.toThrow('different draft flow')
  })

  it('rolls back pair creation, proposal consumption, and audits when one insert fails', async () => {
    const proposal = await prepare()
    await f.db.prepare(`CREATE TRIGGER reject_transfer_audit BEFORE INSERT ON audit_log
      WHEN NEW.details LIKE '%transfer_pair_id%' BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END`).run()
    await expect(f.tool('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })).rejects.toThrow('injected audit failure')
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first<number>('count')).toBe(0)
    expect(await f.db.prepare('SELECT consumed_at FROM mcp_draft_proposals WHERE id = ?').bind(proposal.proposal_id).first()).toEqual({ consumed_at: null })
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM mcp_draft_batches').first<number>('count')).toBe(0)
    await f.db.prepare('DROP TRIGGER reject_transfer_audit').run()
    expect((await f.tool<Created>('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })).drafts).toHaveLength(1)
  })

  it('posts both legs once under concurrent confirmation and rolls back on failure', async () => {
    const { outgoing_id, incoming_id } = (await create()).drafts[0]
    await f.db.prepare(`CREATE TRIGGER reject_transfer_post BEFORE UPDATE ON transactions
      WHEN NEW.status = 'posted' AND NEW.id = '${incoming_id}' BEGIN SELECT RAISE(ABORT, 'injected transfer failure'); END`).run()
    expect((await f.request(`/transactions/${outgoing_id}/confirm`, 'POST')).status).toBe(400)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    expect((await f.db.prepare('SELECT status FROM transactions').all()).results).toEqual([{ status: 'pending' }, { status: 'pending' }])
    await f.db.prepare('DROP TRIGGER reject_transfer_post').run()
    const responses = await Promise.all(Array.from({ length: 3 }, () => f.request(`/transactions/${outgoing_id}/confirm`, 'POST')))
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 875 }, { id: 'savings', balance: 325 }])
    expect((await f.db.prepare('SELECT status FROM transactions').all()).results).toEqual([{ status: 'posted' }, { status: 'posted' }])
    expect((await f.request(`/transactions/${incoming_id}/confirm`, 'POST')).status).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 875 }, { id: 'savings', balance: 325 }])
    const flow = await f.tool<{ totals: { income: number; expenses: number } }>('get_finance_overview', { start_date: '2026-01-15', end_date: '2026-01-15' })
    expect(flow.totals.income).toBe(0)
    expect(flow.totals.expenses).toBe(0)
  })

  it('uses explicit native amounts for cross-currency pairs without an exchange-rate lookup', async () => {
    await f.db.prepare("UPDATE accounts SET currency = 'USD' WHERE id = 'cash'").run()
    await f.db.prepare("UPDATE accounts SET currency = 'EUR' WHERE id = 'savings'").run()
    await expect(prepare({ amount: 20 })).rejects.toThrow('amount_to is required')
    await expect(prepare({ amount: 20, amount_to: 0 })).rejects.toThrow('greater than 0')
    const proposal = await prepare({ amount: 20, amount_to: 19.54 })
    expect(proposal.preview[0]).toMatchObject({ debit_amount: -20, credit_amount: 19.54, from_currency: 'USD', to_currency: 'EUR', effective_fx_rate: 0.977 })
    const created = await f.tool<Created>('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })
    expect(created.drafts[0]).toMatchObject({ debit_amount: -20, credit_amount: 19.54, from_currency: 'USD', to_currency: 'EUR', effective_fx_rate: 0.977 })
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    const { outgoing_id, incoming_id } = created.drafts[0]
    const responses = await Promise.all(Array.from({ length: 3 }, () => f.request(`/transactions/${incoming_id}/confirm`, 'POST')))
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 980 }, { id: 'savings', balance: 219.54 }])
    expect((await f.db.prepare('SELECT id, amount, status FROM transactions ORDER BY amount').all()).results)
      .toEqual([{ id: outgoing_id, amount: -20, status: 'posted' }, { id: incoming_id, amount: 19.54, status: 'posted' }])
    expect((await f.tool<Created>('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })).drafts[0].effective_fx_rate).toBe(0.977)
    await f.db.prepare("UPDATE accounts SET currency = 'GBP' WHERE id = 'cash'").run()
    expect((await f.tool<Created>('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })).drafts[0]).toMatchObject({ from_currency: 'USD', to_currency: 'EUR' })
    expect((await prepare({ amount: 20, amount_to: 19.54 })).preview[0].warnings).toContain('possible_duplicate')
    expect((await prepare({ amount: 20, amount_to: 19.55 })).preview[0].warnings).toEqual([])
    const declined = await create({ amount: 5, amount_to: 4.8 })
    expect((await f.request(`/transactions/${declined.drafts[0].outgoing_id}/decline`, 'POST')).status).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 980 }, { id: 'savings', balance: 219.54 }])
  })

  it('declines both sides, rejects locks and future confirmation, and warns about duplicates', async () => {
    const future = await create({ date: '2026-01-16' })
    const id = future.drafts[0].outgoing_id
    expect((await f.request(`/transactions/${id}/confirm`, 'POST')).status).toBe(400)
    await f.request('/accounts/savings/lock', 'PATCH')
    expect((await f.request(`/transactions/${id}/confirm`, 'POST', undefined, '2026-01-16')).status).toBe(409)
    expect((await f.request(`/transactions/${id}/decline`, 'POST')).status).toBe(409)
    await f.request('/accounts/savings/unlock', 'PATCH')
    expect((await f.request(`/transactions/${id}/decline`, 'POST')).status).toBe(200)
    expect((await f.db.prepare('SELECT status FROM transactions').all()).results).toEqual([{ status: 'cancelled' }, { status: 'cancelled' }])
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    const repeated = await prepare({ date: '2026-01-16' })
    expect(repeated.preview[0].warnings).toEqual([])
    const later = await create({ date: '2026-01-17' })
    expect((await f.request(`/transactions/${later.drafts[0].incoming_id}/confirm`, 'POST', undefined, '2026-01-17')).status).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 875 }, { id: 'savings', balance: 325 }])
  })

  it('validates accounts, currency, expiry, and checksum before creating a pair', async () => {
    await f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES ('portfolio', 'Portfolio', 'investment', 1, 'USD', 1)").run()
    await expect(prepare({ to_account_id: 'cash' })).rejects.toThrow('must differ')
    await expect(prepare({ to_account_id: 'missing' })).rejects.toThrow('missing account')
    await expect(prepare({ to_account_id: 'portfolio' })).rejects.toThrow('cash accounts')
    await f.db.prepare("UPDATE accounts SET currency = 'EUR' WHERE id = 'savings'").run()
    await expect(prepare()).rejects.toThrow('amount_to is required')
    await expect(prepare({ amount_to: -1 })).rejects.toThrow('greater than 0')
    const changedCurrency = await prepare({ amount_to: 120 })
    await f.db.prepare("UPDATE accounts SET currency = 'HUF' WHERE id = 'savings'").run()
    await expect(f.tool('create_mcp_transfer_drafts', { proposal_id: changedCurrency.proposal_id })).rejects.toThrow('currency changed since preview')
    await expect(prepare({ amount_to: 120 })).rejects.toThrow('amount_to must equal amount')
    const locked = await prepare()
    await f.request('/accounts/savings/lock', 'PATCH')
    await expect(f.tool('create_mcp_transfer_drafts', { proposal_id: locked.proposal_id })).rejects.toThrow('locked')
    await f.request('/accounts/savings/unlock', 'PATCH')
    const expired = await prepare()
    await f.db.prepare('UPDATE mcp_draft_proposals SET created_at = 0, expires_at = 1 WHERE id = ?').bind(expired.proposal_id).run()
    await expect(f.tool('create_mcp_transfer_drafts', { proposal_id: expired.proposal_id })).rejects.toThrow('proposal_expired')
    const corrupt = await prepare()
    await f.db.prepare("UPDATE mcp_draft_proposals SET items_json = '[]' WHERE id = ?").bind(corrupt.proposal_id).run()
    await expect(f.tool('create_mcp_transfer_drafts', { proposal_id: corrupt.proposal_id })).rejects.toThrow('proposal_corrupt')
  })
})
