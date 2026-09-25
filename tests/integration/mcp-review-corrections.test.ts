import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

type Draft = { id: string; status: string; account_id: string; amount: number; description: string | null; review_flags: string[] }
type Created = { drafts: Draft[] }
type Listed = { drafts: Draft[]; pagination: { has_more: boolean; next_cursor: string | null }; truncated: boolean }
type Preview = { proposal_id: string; preview: Array<{ action: string; before: Draft; after: Draft }> }
type Applied = { idempotent_replay: boolean; drafts: Array<Draft & { action: string }> }

describe('MCP review draft corrections on shared D1', () => {
  const f = useFinanceWorkers()
  beforeEach(() => f.seed())

  async function draft(amount = 50) {
    const prepared = await f.tool<{ proposal_id: string }>('prepare_mcp_transaction_drafts', {
      items: [{ type: 'expense', amount, account_id: 'cash', category_id: 'food', description: 'Original', date: '2026-01-15' }],
    })
    const created = await f.tool<Created>('create_mcp_transaction_drafts', { proposal_id: prepared.proposal_id })
    return created.drafts[0]
  }

  async function prepare(operations: unknown[]) {
    return f.tool<Preview>('prepare_mcp_review_draft_corrections', { operations })
  }

  async function revision() {
    return f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')
  }

  it('lists only unresolved MCP drafts with stable cursor pagination and refreshed app state', async () => {
    const first = await draft(50)
    const second = await draft(60)
    const upcoming = await f.request('/transactions', 'POST', { account_id: 'cash', category_id: 'food', amount: -20, date: '2026-01-16' })
    expect(upcoming.status).toBe(201)
    const page1 = await f.tool<Listed>('list_mcp_review_drafts', { limit: 1 })
    expect(page1.drafts).toHaveLength(1)
    expect(page1.pagination).toMatchObject({ has_more: true, next_cursor: expect.any(String) })
    expect(page1.truncated).toBe(true)
    const page2 = await f.tool<Listed>('list_mcp_review_drafts', { limit: 1, cursor: page1.pagination.next_cursor })
    expect(new Set([...page1.drafts, ...page2.drafts].map(row => row.id))).toEqual(new Set([first.id, second.id]))
    expect(page2.pagination).toMatchObject({ has_more: false, next_cursor: null })
    expect((await f.request(`/transactions/${first.id}`, 'PUT', { description: 'Edited in app' })).status).toBe(200)
    expect((await f.tool<Listed>('list_mcp_review_drafts', {})).drafts.find(row => row.id === first.id)?.description).toBe('Edited in app')
    expect((await f.request(`/transactions/${second.id}/decline`, 'POST')).status).toBe(200)
    expect((await f.tool<Listed>('list_mcp_review_drafts', {})).drafts.map(row => row.id)).toEqual([first.id])
    await expect(f.tool('list_mcp_review_drafts', { cursor: 'bad' })).rejects.toThrow('cursor is invalid')
  })

  it('previews and atomically applies account, amount, category, date and description edits without touching balances', async () => {
    const original = await draft()
    await f.db.prepare("INSERT INTO categories (id, name, type) VALUES ('bonus', 'Bonus', 'income')").run()
    const balances = await f.balances()
    const revisionBefore = await revision()
    const projectedBefore = await f.tool('get_recurring_forecast', { currency: 'HUF', start_date: '2026-01-15', end_date: '2026-01-16' })
    const preview = await prepare([{ draft_id: original.id, action: 'edit', changes: {
      type: 'income', amount: 85, account_id: 'savings', category_id: 'bonus', description: 'Correction', date: '2026-01-14', exclude_from_estimate: true,
    } }])
    expect(preview.preview[0]).toMatchObject({ action: 'edit', before: { amount: 50, account_id: 'cash', currency: 'HUF' },
      after: { amount: 85, signed_amount: 85, account_id: 'savings', category_id: 'bonus', description: 'Correction', date: '2026-01-14', exclude_from_estimate: true } })
    expect((await f.db.prepare('SELECT amount FROM transactions WHERE id = ?').bind(original.id).first<{ amount: number }>())?.amount).toBe(-50)
    const applied = await f.tool<Applied>('apply_mcp_review_draft_corrections', { proposal_id: preview.proposal_id })
    expect(applied).toMatchObject({ idempotent_replay: false, drafts: [{ action: 'edit', status: 'pending', amount: 85, account_id: 'savings' }] })
    expect(await f.db.prepare('SELECT account_id, amount, status, pending_kind, review_source, category_id, description, date, exclude_from_estimate FROM transactions WHERE id = ?').bind(original.id).first())
      .toEqual({ account_id: 'savings', amount: 85, status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', category_id: 'bonus', description: 'Correction', date: '2026-01-14', exclude_from_estimate: 1 })
    expect(await f.balances()).toEqual(balances)
    expect(await revision()).toBe(revisionBefore)
    expect(await f.tool('get_recurring_forecast', { currency: 'HUF', start_date: '2026-01-15', end_date: '2026-01-16' }))
      .toMatchObject({ summary: (projectedBefore as { summary: unknown }).summary })
    expect(await f.db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE entity_id = ? AND action = 'UPDATE'").bind(original.id).first('count')).toBe(1)
    const replay = await f.tool<Applied>('apply_mcp_review_draft_corrections', { proposal_id: preview.proposal_id })
    expect(replay.idempotent_replay).toBe(true)
    expect(await f.db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE entity_id = ? AND action = 'UPDATE'").bind(original.id).first('count')).toBe(1)
  })

  it('declines a draft, preserves audit history, and excludes it from the active queue', async () => {
    const original = await draft()
    const balances = await f.balances()
    const revisionBefore = await revision()
    const preview = await prepare([{ draft_id: original.id, action: 'decline' }])
    expect(preview.preview[0]).toMatchObject({ before: { status: 'pending' }, after: { status: 'cancelled' } })
    await f.tool('apply_mcp_review_draft_corrections', { proposal_id: preview.proposal_id })
    expect(await f.db.prepare('SELECT status, cancelled_at, review_batch_id FROM transactions WHERE id = ?').bind(original.id).first())
      .toMatchObject({ status: 'cancelled', cancelled_at: expect.any(Number), review_batch_id: expect.any(String) })
    expect((await f.tool<Listed>('list_mcp_review_drafts', {})).drafts).toEqual([])
    expect(await f.db.prepare("SELECT action, details FROM audit_log WHERE entity_id = ? AND action = 'DECLINE'").bind(original.id).first())
      .toMatchObject({ action: 'DECLINE', details: expect.stringContaining('chatgpt_mcp') })
    expect(await f.balances()).toEqual(balances)
    expect(await revision()).toBe(revisionBefore)
  })

  it('rejects app edits, confirmation, decline, and account/category changes after preview', async () => {
    const first = await draft()
    const appEdit = await prepare([{ draft_id: first.id, action: 'edit', changes: { amount: 55 } }])
    expect((await f.request(`/transactions/${first.id}`, 'PUT', { description: 'App changed it' })).status).toBe(200)
    await expect(f.tool('apply_mcp_review_draft_corrections', { proposal_id: appEdit.proposal_id })).rejects.toThrow('stale_draft')
    const appConfirm = await prepare([{ draft_id: first.id, action: 'decline' }])
    expect((await f.request(`/transactions/${first.id}/confirm`, 'POST')).status).toBe(200)
    await expect(f.tool('apply_mcp_review_draft_corrections', { proposal_id: appConfirm.proposal_id })).rejects.toThrow('stale_draft')
    const second = await draft(60)
    const accountChange = await prepare([{ draft_id: second.id, action: 'edit', changes: { account_id: 'savings' } }])
    expect((await f.request('/accounts/savings/lock', 'PATCH')).status).toBe(200)
    await expect(f.tool('apply_mcp_review_draft_corrections', { proposal_id: accountChange.proposal_id })).rejects.toThrow('stale_draft')
    await f.request('/accounts/savings/unlock', 'PATCH')
    await f.db.prepare("UPDATE categories SET name = 'Renamed food' WHERE id = 'food'").run()
    await expect(f.tool('apply_mcp_review_draft_corrections', { proposal_id: accountChange.proposal_id })).rejects.toThrow('stale_draft')
  })

  it('rejects upcoming, linked, posted, non-MCP and locked targets at preparation', async () => {
    const created = await f.request('/transactions', 'POST', { account_id: 'cash', category_id: 'food', amount: -20, date: '2026-01-16' })
    const upcoming = await created.json() as { id: string }
    await expect(prepare([{ draft_id: upcoming.id, action: 'decline' }])).rejects.toThrow('draft_unavailable')
    const original = await draft()
    await f.db.prepare('UPDATE transactions SET linked_transaction_id = ? WHERE id = ?').bind('linked', original.id).run()
    await expect(prepare([{ draft_id: original.id, action: 'edit', changes: { amount: 70 } }])).rejects.toThrow('draft_unavailable')
    await f.db.prepare('UPDATE transactions SET linked_transaction_id = NULL WHERE id = ?').bind(original.id).run()
    await f.request('/accounts/cash/lock', 'PATCH')
    await expect(prepare([{ draft_id: original.id, action: 'decline' }])).rejects.toThrow('locked account')
  })

  it('validates edits and expires unused correction proposals', async () => {
    const original = await draft()
    await expect(prepare([{ draft_id: original.id, action: 'edit', changes: { type: 'income' } }])).rejects.toThrow('must match income')
    await expect(prepare([{ draft_id: original.id, action: 'edit', changes: { date: '2026-02-30' } }])).rejects.toThrow('valid calendar date')
    await expect(prepare([{ draft_id: original.id, action: 'decline', changes: { amount: 3 } }])).rejects.toThrow('not allowed')
    const prepared = await prepare([{ draft_id: original.id, action: 'decline' }])
    await f.db.prepare('UPDATE mcp_draft_correction_proposals SET expires_at = ? WHERE id = ?').bind(Date.now() - 1, prepared.proposal_id).run()
    await expect(f.tool('apply_mcp_review_draft_corrections', { proposal_id: prepared.proposal_id })).rejects.toThrow('proposal_expired')
    expect(await f.db.prepare('SELECT status FROM transactions WHERE id = ?').bind(original.id).first()).toEqual({ status: 'pending' })
  })

  it('rolls back a multi-draft batch on a stale guard or audit failure, then permits a fresh retry', async () => {
    const first = await draft(50)
    const second = await draft(60)
    const operations = [
      { draft_id: first.id, action: 'edit', changes: { amount: 51 } },
      { draft_id: second.id, action: 'decline' },
    ]
    const preview = await prepare(operations)
    await f.db.prepare('UPDATE transactions SET description = ? WHERE id = ?').bind('App changed second', second.id).run()
    await expect(f.tool('apply_mcp_review_draft_corrections', { proposal_id: preview.proposal_id })).rejects.toThrow('stale_draft')
    expect(await f.db.prepare('SELECT amount FROM transactions WHERE id = ?').bind(first.id).first('amount')).toBe(-50)
    const refreshed = await prepare(operations)
    await f.db.prepare("CREATE TRIGGER reject_decline BEFORE INSERT ON audit_log WHEN NEW.action = 'DECLINE' BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END").run()
    await expect(f.tool('apply_mcp_review_draft_corrections', { proposal_id: refreshed.proposal_id })).rejects.toThrow('injected audit failure')
    expect(await f.db.prepare('SELECT amount, status FROM transactions WHERE id = ?').bind(first.id).first()).toEqual({ amount: -50, status: 'pending' })
    expect(await f.db.prepare('SELECT status FROM transactions WHERE id = ?').bind(second.id).first()).toEqual({ status: 'pending' })
    expect(await f.db.prepare('SELECT consumed_at FROM mcp_draft_correction_proposals WHERE id = ?').bind(refreshed.proposal_id).first()).toEqual({ consumed_at: null })
    expect(await f.db.prepare('SELECT id FROM mcp_draft_correction_runs WHERE id = ?').bind(refreshed.proposal_id).first()).toBeNull()
    await f.db.prepare('DROP TRIGGER reject_decline').run()
    const results = await Promise.all(Array.from({ length: 3 }, () => f.tool<Applied>('apply_mcp_review_draft_corrections', { proposal_id: refreshed.proposal_id })))
    expect(results.every(result => result.drafts[0].id === first.id)).toBe(true)
    expect(results.filter(result => !result.idempotent_replay)).toHaveLength(1)
    expect(await f.db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action IN ('UPDATE', 'DECLINE')").first('count')).toBe(2)
  })
})
