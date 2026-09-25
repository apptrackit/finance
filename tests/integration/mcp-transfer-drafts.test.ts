import { beforeEach, describe, expect, it } from 'vitest'
import { TransactionRepository } from '../../api/src/repositories/transaction.repository'
import type { Transaction } from '../../api/src/models/Transaction'
import { useFinanceWorkers } from './harness'

type Proposal = { proposal_id: string; preview: Array<{ debit_amount: number; credit_amount: number; from_currency: string; to_currency: string; effective_fx_rate: number; warnings: string[] }> }
type Created = { drafts: Array<{ outgoing_id: string; incoming_id: string; debit_amount: number; credit_amount: number; from_currency: string; to_currency: string; effective_fx_rate: number }>; idempotent_replay: boolean }
type ListedTransfer = { id: string; type: 'transfer'; outgoing_id: string; incoming_id: string; debit_amount: number; credit_amount: number; from_account_id: string; to_account_id: string; from_currency: string; to_currency: string; status: string; description: string | null }
type TransferCorrectionPreview = { proposal_id: string; preview: Array<{ action: string; before: ListedTransfer; after: ListedTransfer }> }
type TransferCorrectionResult = { idempotent_replay: boolean; transfers: Array<ListedTransfer & { action: string }> }

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
    expect((await f.request(`/transactions/${incoming_id}`, 'PUT', { amount: 1, amount_to: 2 })).status).toBe(400)
    expect((await f.request(`/transactions/${incoming_id}`, 'DELETE')).status).toBe(400)
    const duplicate = await prepare()
    expect(duplicate.preview[0].warnings).toContain('possible_duplicate')
    await expect(f.tool('create_mcp_transaction_drafts', { proposal_id: proposal.proposal_id })).rejects.toThrow('different draft flow')
  })

  it('lists a review transfer once and edits or declines both legs through confirmed MCP proposals', async () => {
    await f.db.prepare("UPDATE accounts SET currency = 'USD' WHERE id = 'cash'").run()
    await f.db.prepare("UPDATE accounts SET currency = 'EUR' WHERE id = 'savings'").run()
    const { outgoing_id, incoming_id } = (await create({ amount: 20, amount_to: 19.54 })).drafts[0]
    const listed = await f.tool<{ drafts: ListedTransfer[] }>('list_mcp_review_drafts', {})
    expect(listed.drafts).toHaveLength(1)
    expect(listed.drafts[0]).toMatchObject({ id: outgoing_id, type: 'transfer', outgoing_id, incoming_id,
      debit_amount: -20, credit_amount: 19.54, from_account_id: 'cash', to_account_id: 'savings',
      from_currency: 'USD', to_currency: 'EUR' })
    await expect(f.tool('prepare_mcp_review_draft_corrections', { operations: [{ draft_id: outgoing_id, action: 'decline' }] }))
      .rejects.toThrow('draft_unavailable')

    const beforeRevision = await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')
    const preview = await f.tool<TransferCorrectionPreview>('prepare_mcp_transfer_corrections', { operations: [{
      transfer_id: outgoing_id, action: 'edit', changes: { amount: 25, amount_to: 23.75, date: '2026-01-16', description: 'Corrected exchange' },
    }] })
    expect(preview.preview[0]).toMatchObject({ action: 'edit', before: { debit_amount: -20, credit_amount: 19.54 },
      after: { debit_amount: -25, credit_amount: 23.75, date: '2026-01-16', description: 'Corrected exchange' } })
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    const results = await Promise.all(Array.from({ length: 3 }, () => f.tool<TransferCorrectionResult>('apply_mcp_transfer_corrections', { proposal_id: preview.proposal_id })))
    expect(results.filter(result => !result.idempotent_replay)).toHaveLength(1)
    expect((await f.db.prepare('SELECT id, amount, description, date, status FROM transactions ORDER BY amount').all()).results)
      .toEqual([
        { id: outgoing_id, amount: -25, description: 'Corrected exchange', date: '2026-01-16', status: 'pending' },
        { id: incoming_id, amount: 23.75, description: 'Corrected exchange', date: '2026-01-16', status: 'pending' },
      ])
    expect(await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')).toBe(beforeRevision)
    expect((await f.tool<{ drafts: ListedTransfer[] }>('list_mcp_review_drafts', {})).drafts).toMatchObject([
      { type: 'transfer', debit_amount: -25, credit_amount: 23.75 },
    ])

    const decline = await f.tool<TransferCorrectionPreview>('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: incoming_id, action: 'decline' }] })
    expect(decline.preview[0]).toMatchObject({ before: { status: 'pending' }, after: { status: 'cancelled' } })
    await f.tool('apply_mcp_transfer_corrections', { proposal_id: decline.proposal_id })
    expect((await f.db.prepare('SELECT status, cancelled_at FROM transactions').all()).results)
      .toEqual([{ status: 'cancelled', cancelled_at: expect.any(Number) }, { status: 'cancelled', cancelled_at: expect.any(Number) }])
    expect((await f.tool<{ drafts: ListedTransfer[] }>('list_mcp_review_drafts', {})).drafts).toEqual([])
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
  })

  it('keeps normal drafts and transfer pairs as separate single review items across cursor pages', async () => {
    const prepared = await f.tool<{ proposal_id: string }>('prepare_mcp_transaction_drafts', {
      items: [{ type: 'expense', amount: 5, account_id: 'cash', category_id: 'food', date: '2026-01-15' }],
    })
    const normal = await f.tool<{ drafts: Array<{ id: string }> }>('create_mcp_transaction_drafts', { proposal_id: prepared.proposal_id })
    const transfer = (await create()).drafts[0]
    const first = await f.tool<{ drafts: Array<{ id: string; type: string }>; pagination: { next_cursor: string | null } }>('list_mcp_review_drafts', { limit: 1 })
    const second = await f.tool<{ drafts: Array<{ id: string; type: string }>; pagination: { has_more: boolean } }>('list_mcp_review_drafts', { limit: 1, cursor: first.pagination.next_cursor })
    expect(new Map([...first.drafts, ...second.drafts].map(item => [item.id, item.type]))).toEqual(new Map([
      [normal.drafts[0].id, 'expense'], [transfer.outgoing_id, 'transfer'],
    ]))
    expect(second.pagination.has_more).toBe(false)
  })

  it('rejects stale previews, account locks, and invalid transfer edits', async () => {
    const { outgoing_id, incoming_id } = (await create()).drafts[0]
    await expect(f.tool('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: outgoing_id, action: 'edit', changes: { amount: 130 } }] }))
      .rejects.toThrow('same-currency transfer amounts must match')
    await expect(f.tool('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: outgoing_id, action: 'edit', changes: { to_account_id: 'cash', amount: 130, amount_to: 130 } }] }))
      .rejects.toThrow('must differ')
    await expect(f.tool('prepare_mcp_transfer_corrections', { operations: [
      { transfer_id: outgoing_id, action: 'decline' }, { transfer_id: incoming_id, action: 'decline' },
    ] })).rejects.toThrow('repeats a transfer pair')

    const stale = await f.tool<TransferCorrectionPreview>('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: outgoing_id, action: 'decline' }] })
    expect((await f.request(`/transactions/${outgoing_id}`, 'PUT', { account_id: 'cash', to_account_id: 'savings', amount: 140, amount_to: 140, date: '2026-01-15' })).status).toBe(200)
    await expect(f.tool('apply_mcp_transfer_corrections', { proposal_id: stale.proposal_id })).rejects.toThrow('stale_transfer')
    expect((await f.db.prepare('SELECT amount, status FROM transactions ORDER BY amount').all()).results)
      .toEqual([{ amount: -140, status: 'pending' }, { amount: 140, status: 'pending' }])
    expect(await f.db.prepare('SELECT consumed_at FROM mcp_transfer_correction_proposals WHERE id = ?').bind(stale.proposal_id).first())
      .toEqual({ consumed_at: null })

    const locked = await f.tool<TransferCorrectionPreview>('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: outgoing_id, action: 'decline' }] })
    await f.db.prepare("UPDATE accounts SET is_locked = 1 WHERE id = 'savings'").run()
    await expect(f.tool('apply_mcp_transfer_corrections', { proposal_id: locked.proposal_id })).rejects.toThrow('stale_transfer')
    await expect(f.tool('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: outgoing_id, action: 'decline' }] })).rejects.toThrow('locked account')
    expect((await f.db.prepare('SELECT status FROM transactions').all()).results).toEqual([{ status: 'pending' }, { status: 'pending' }])
  })

  it('rolls back all transfer corrections if an audit fails and checks expiry and checksum', async () => {
    const first = (await create()).drafts[0]
    const second = (await create({ amount: 60, description: 'Second transfer' })).drafts[0]
    const proposal = await f.tool<TransferCorrectionPreview>('prepare_mcp_transfer_corrections', { operations: [
      { transfer_id: first.outgoing_id, action: 'decline' },
      { transfer_id: second.outgoing_id, action: 'edit', changes: { amount: 65, amount_to: 65 } },
    ] })
    await f.db.prepare(`CREATE TRIGGER reject_correction_audit BEFORE INSERT ON audit_log
      WHEN NEW.details LIKE '%transfer_pair_id%' BEGIN SELECT RAISE(ABORT, 'injected correction audit failure'); END`).run()
    await expect(f.tool('apply_mcp_transfer_corrections', { proposal_id: proposal.proposal_id })).rejects.toThrow('injected correction audit failure')
    expect((await f.db.prepare('SELECT amount, status FROM transactions ORDER BY amount').all()).results)
      .toEqual([{ amount: -125, status: 'pending' }, { amount: -60, status: 'pending' }, { amount: 60, status: 'pending' }, { amount: 125, status: 'pending' }])
    expect(await f.db.prepare('SELECT consumed_at FROM mcp_transfer_correction_proposals WHERE id = ?').bind(proposal.proposal_id).first())
      .toEqual({ consumed_at: null })
    expect(await f.db.prepare('SELECT COUNT(*) AS count FROM mcp_transfer_correction_runs').first<number>('count')).toBe(0)
    await f.db.prepare('DROP TRIGGER reject_correction_audit').run()
    await f.tool('apply_mcp_transfer_corrections', { proposal_id: proposal.proposal_id })
    expect((await f.db.prepare('SELECT amount, status FROM transactions ORDER BY amount').all()).results)
      .toEqual([{ amount: -125, status: 'cancelled' }, { amount: -65, status: 'pending' }, { amount: 65, status: 'pending' }, { amount: 125, status: 'cancelled' }])

    const expired = await f.tool<TransferCorrectionPreview>('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: second.outgoing_id, action: 'decline' }] })
    await f.db.prepare('UPDATE mcp_transfer_correction_proposals SET created_at = 0, expires_at = 1 WHERE id = ?').bind(expired.proposal_id).run()
    await expect(f.tool('apply_mcp_transfer_corrections', { proposal_id: expired.proposal_id })).rejects.toThrow('proposal_expired')
    const corrupt = await f.tool<TransferCorrectionPreview>('prepare_mcp_transfer_corrections', { operations: [{ transfer_id: second.outgoing_id, action: 'decline' }] })
    await f.db.prepare("UPDATE mcp_transfer_correction_proposals SET items_json = '[]' WHERE id = ?").bind(corrupt.proposal_id).run()
    await expect(f.tool('apply_mcp_transfer_corrections', { proposal_id: corrupt.proposal_id })).rejects.toThrow('proposal_corrupt')
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

  it('edits both pending legs together without changing balances or forecast revision', async () => {
    await f.db.prepare("UPDATE accounts SET currency = 'USD' WHERE id = 'cash'").run()
    await f.db.prepare("UPDATE accounts SET currency = 'EUR' WHERE id = 'savings'").run()
    const { outgoing_id, incoming_id } = (await create({ amount: 20, amount_to: 19.54 })).drafts[0]
    const oldOutgoing = (await f.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(outgoing_id).first()) as Transaction
    const oldIncoming = (await f.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(incoming_id).first()) as Transaction
    const beforeRevision = await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')

    const edited = await f.request(`/transactions/${incoming_id}`, 'PUT', {
      account_id: 'cash', to_account_id: 'savings', amount: 25, amount_to: 23.75,
      date: '2026-01-16', description: 'Corrected exchange',
    })
    expect(edited.status).toBe(200)
    expect((await edited.json() as { amount: number }).amount).toBe(23.75)
    expect((await f.db.prepare('SELECT id, account_id, amount, description, date, status FROM transactions ORDER BY amount').all()).results)
      .toEqual([
        { id: outgoing_id, account_id: 'cash', amount: -25, description: 'Corrected exchange', date: '2026-01-16', status: 'pending' },
        { id: incoming_id, account_id: 'savings', amount: 23.75, description: 'Corrected exchange', date: '2026-01-16', status: 'pending' },
      ])
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    expect(await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')).toBe(beforeRevision)
    expect((await f.db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE details LIKE '%review_edit%'").first<{ count: number }>())?.count).toBe(2)

    expect(await new TransactionRepository(f.db).resolvePendingTransferPair(oldOutgoing, oldIncoming, 'confirm', Date.now(), '2026-01-16')).toBe(false)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    expect((await f.request(`/transactions/${outgoing_id}/confirm`, 'POST', undefined, '2026-01-15')).status).toBe(400)
    expect((await f.request(`/transactions/${outgoing_id}/confirm`, 'POST', undefined, '2026-01-16')).status).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 975 }, { id: 'savings', balance: 223.75 }])
  })

  it('rejects invalid or locked review edits and rolls back both legs if audit fails', async () => {
    const { outgoing_id, incoming_id } = (await create()).drafts[0]
    expect((await f.request(`/transactions/${outgoing_id}`, 'PUT', { amount: 130, amount_to: 125 })).status).toBe(400)
    await f.request('/accounts/savings/lock', 'PATCH')
    expect((await f.request(`/transactions/${outgoing_id}`, 'PUT', { amount: 130, amount_to: 130 })).status).toBe(409)
    await f.request('/accounts/savings/unlock', 'PATCH')

    await f.db.prepare(`CREATE TRIGGER reject_transfer_edit_audit BEFORE INSERT ON audit_log
      WHEN NEW.details LIKE '%review_edit%' BEGIN SELECT RAISE(ABORT, 'injected edit audit failure'); END`).run()
    expect((await f.request(`/transactions/${outgoing_id}`, 'PUT', { amount: 130, amount_to: 130 })).status).toBe(500)
    expect((await f.db.prepare('SELECT id, amount, status FROM transactions ORDER BY amount').all()).results)
      .toEqual([{ id: outgoing_id, amount: -125, status: 'pending' }, { id: incoming_id, amount: 125, status: 'pending' }])
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    await f.db.prepare('DROP TRIGGER reject_transfer_edit_audit').run()
    expect((await f.request(`/transactions/${outgoing_id}`, 'PUT', { amount: 130, amount_to: 130 })).status).toBe(200)
  })

  it('moves a pending destination to another cash account without applying either balance early', async () => {
    await f.db.prepare("UPDATE accounts SET currency = 'USD' WHERE id = 'cash'").run()
    await f.db.prepare("UPDATE accounts SET currency = 'EUR' WHERE id = 'savings'").run()
    await f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES ('reserve', 'Test reserve', 'cash', 50, 'EUR', 1)").run()
    const { outgoing_id, incoming_id } = (await create({ amount: 20, amount_to: 19.54 })).drafts[0]

    expect((await f.request(`/transactions/${outgoing_id}`, 'PUT', { to_account_id: 'reserve', amount_to: 18.5 })).status).toBe(400)
    expect((await f.request(`/transactions/${outgoing_id}`, 'PUT', { to_account_id: 'reserve', amount: 20, amount_to: 18.5 })).status).toBe(200)
    expect(await f.db.prepare('SELECT account_id, amount FROM transactions WHERE id = ?').bind(incoming_id).first()).toEqual({ account_id: 'reserve', amount: 18.5 })
    expect(await f.balances()).toEqual([
      { id: 'cash', balance: 1000 }, { id: 'reserve', balance: 50 }, { id: 'savings', balance: 200 },
    ])
    expect((await f.request(`/transactions/${outgoing_id}/confirm`, 'POST')).status).toBe(200)
    expect(await f.balances()).toEqual([
      { id: 'cash', balance: 980 }, { id: 'reserve', balance: 68.5 }, { id: 'savings', balance: 200 },
    ])
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
