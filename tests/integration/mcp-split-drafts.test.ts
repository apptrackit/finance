import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

type SplitLine = { id: string; category_id: string | null; category_name: string | null; amount: number; signed_amount: number; note: string | null }
type SplitItem = { id: string; type: 'split'; split_id: string; direction: string; total: number; signed_total: number; date: string; account_id: string; description: string | null; line_count: number; lines: SplitLine[]; status: string; review_flags: string[] }
type Proposal = { proposal_id: string; warnings: string[]; preview: Array<{ total: number; signed_total: number; receipt_total: number | null; lines: Array<{ category_name: string | null; amount: number; note: string | null }>; warnings: string[] }> }
type Created = { idempotent_replay: boolean; drafts: SplitItem[] }
type CorrectionPreview = { proposal_id: string; preview: Array<{ action: string; before: SplitItem; after: SplitItem; becomes_single_draft: boolean }> }
type CorrectionResult = { idempotent_replay: boolean; splits: Array<SplitItem & { action: string }> }
type AppSplit = { id: string; total: number; lines: Array<{ id: string; status: string; split_id: string | null }> }

describe('MCP split review drafts', () => {
  const f = useFinanceWorkers()
  beforeEach(async () => {
    await f.seed()
    await f.db.prepare("INSERT INTO categories (id, name, type) VALUES ('household', 'Test household', 'expense'), ('salary', 'Test salary', 'income')").run()
  })
  const receipt = {
    type: 'expense', account_id: 'cash', date: '2026-01-15', description: 'Spar', receipt_total: 412.5,
    lines: [
      { category_id: 'food', amount: 300, note: 'Milk, bread, cheese' },
      { category_id: 'household', amount: 112.5, note: 'Dish soap, sponges' },
    ],
  }
  const revision = () => f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')

  async function create(overrides = {}) {
    const proposal = await f.tool<Proposal>('prepare_mcp_split_drafts', { items: [{ ...receipt, ...overrides }] })
    return f.tool<Created>('create_mcp_split_drafts', { proposal_id: proposal.proposal_id })
  }

  it('previews a receipt, creates one pending split once, and leaves balances and projections untouched', async () => {
    const before = await revision()
    const proposal = await f.tool<Proposal>('prepare_mcp_split_drafts', { items: [receipt] })
    expect(proposal.preview[0]).toMatchObject({ total: 412.5, signed_total: -412.5, receipt_total: 412.5, warnings: [],
      lines: [{ category_name: 'Test food', amount: 300, note: 'Milk, bread, cheese' }, { category_name: 'Test household', amount: 112.5 }] })
    const results = await Promise.all(Array.from({ length: 3 }, () => f.tool<Created>('create_mcp_split_drafts', { proposal_id: proposal.proposal_id })))
    expect(results.filter(result => !result.idempotent_replay)).toHaveLength(1)
    const split = results[0].drafts[0]
    expect(split).toMatchObject({ type: 'split', direction: 'expense', total: 412.5, signed_total: -412.5, description: 'Spar', line_count: 2, status: 'pending' })
    const rows = (await f.db.prepare('SELECT amount, status, pending_kind, review_source, review_batch_id, split_id FROM transactions ORDER BY amount').all()).results
    expect(rows).toEqual([
      { amount: -300, status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: proposal.proposal_id, split_id: split.split_id },
      { amount: -112.5, status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: proposal.proposal_id, split_id: split.split_id },
    ])
    expect(await f.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'transaction_split' AND entity_id = ?").bind(split.split_id).first('n')).toBe(1)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    expect(await revision()).toBe(before)
    expect((await f.tool<{ summary: { pending_one_time_count: number } }>('get_recurring_forecast', { currency: 'HUF', start_date: '2026-01-15', end_date: '2026-01-16' })).summary.pending_one_time_count).toBe(0)

    // The list shows the split once with every line; ordinary tools cannot touch a single line.
    const listed = await f.tool<{ drafts: SplitItem[] }>('list_mcp_review_drafts', {})
    expect(listed.drafts).toHaveLength(1)
    expect(listed.drafts[0]).toMatchObject({ type: 'split', split_id: split.split_id, total: 412.5, line_count: 2 })
    await expect(f.tool('prepare_mcp_review_draft_corrections', { operations: [{ draft_id: split.lines[0].id, action: 'decline' }] }))
      .rejects.toThrow('draft_is_split_line')
    await expect(f.tool('create_mcp_transaction_drafts', { proposal_id: proposal.proposal_id })).rejects.toThrow('different draft flow')
    expect((await f.request(`/transactions/${split.lines[0].id}/confirm`, 'POST')).status).toBe(409)

    // Search exposes the grouping and can read one split's lines.
    const search = await f.tool<{ transactions: Array<{ split_id: string; split_description: string; is_split_line: boolean }> }>('search_transactions', { filters: { statuses: ['pending'], split_id: split.split_id } })
    expect(search.transactions).toHaveLength(2)
    expect(search.transactions.every(row => row.split_id === split.split_id && row.split_description === 'Spar' && row.is_split_line)).toBe(true)
    expect((await f.tool<{ transactions: unknown[] }>('search_transactions', { filters: { statuses: ['pending'], text: 'spar' } })).transactions).toHaveLength(2)

    // The same receipt again is flagged, not blocked.
    const duplicate = await f.tool<Proposal>('prepare_mcp_split_drafts', { items: [receipt] })
    expect(duplicate.preview[0].warnings).toContain('possible_duplicate')
  })

  it('rejects lines that do not match the receipt total, investment accounts and mismatched categories', async () => {
    await expect(f.tool('prepare_mcp_split_drafts', { items: [{ ...receipt, receipt_total: 420 }] })).rejects.toThrow('lines add up to 412.5 but receipt_total is 420')
    await expect(f.tool('prepare_mcp_split_drafts', { items: [{ ...receipt, receipt_total: null, lines: [{ category_id: 'salary', amount: 1 }, { category_id: 'food', amount: 2 }] }] }))
      .rejects.toThrow('is an income category but the split type is expense')
    await expect(f.tool('prepare_mcp_split_drafts', { items: [{ ...receipt, lines: [receipt.lines[0]] }] })).rejects.toThrow('at least 2 items')
    await f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES ('fund', 'Test fund', 'investment', 1, 'HUF', 1)").run()
    await expect(f.tool('prepare_mcp_split_drafts', { items: [{ ...receipt, account_id: 'fund' }] })).rejects.toThrow('investment account')
    await f.db.prepare("UPDATE accounts SET is_locked = 1 WHERE id = 'cash'").run()
    await expect(f.tool('prepare_mcp_split_drafts', { items: [receipt] })).rejects.toThrow('locked account')
  })

  it('confirms a whole split once in the app, applying its total to the balance', async () => {
    const split = (await create()).drafts[0]
    const before = await revision()
    const responses = await Promise.all(Array.from({ length: 3 }, () => f.request(`/transactions/splits/${split.split_id}/confirm`, 'POST')))
    expect(responses.map(response => response.status)).toEqual([200, 200, 200])
    const confirmed = await responses[0].json() as AppSplit
    expect(confirmed.total).toBe(-412.5)
    expect(confirmed.lines.every(line => line.status === 'posted')).toBe(true)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 587.5 }, { id: 'savings', balance: 200 }])
    expect(await revision()).toBeGreaterThan(before!)
    expect((await f.tool<{ drafts: unknown[] }>('list_mcp_review_drafts', {})).drafts).toEqual([])
    // A posted split behaves like any app split afterwards.
    const listed = await (await f.request('/transactions')).json() as Array<{ split_id: string; split_description: string }>
    expect(listed).toHaveLength(2)
    expect(listed.every(line => line.split_id === split.split_id && line.split_description === 'Spar')).toBe(true)
  })

  it('declines, rejects future confirmation, and edits pending splits in the app without balance changes', async () => {
    const future = (await create({ date: '2026-01-20' })).drafts[0]
    expect((await f.request(`/transactions/splits/${future.split_id}/confirm`, 'POST')).status).toBe(400)
    const edited = await f.request(`/transactions/splits/${future.split_id}`, 'PUT', { account_id: 'cash', date: '2026-01-21', description: 'Spar Extra',
      lines: [{ category_id: 'food', amount: -250, note: 'Food' }, { category_id: 'household', amount: -100 }, { category_id: null, amount: -62.5 }] })
    expect(edited.status, await edited.clone().text()).toBe(200)
    expect((await f.db.prepare('SELECT DISTINCT status, pending_kind, review_source, review_batch_id, date FROM transactions WHERE split_id = ?').bind(future.split_id).all()).results)
      .toEqual([{ status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: expect.any(String), date: '2026-01-21' }])
    const declined = await f.request(`/transactions/splits/${future.split_id}/decline`, 'POST')
    expect(declined.status).toBe(200)
    expect((await f.db.prepare('SELECT DISTINCT status FROM transactions WHERE split_id = ?').bind(future.split_id).all()).results).toEqual([{ status: 'cancelled' }])
    expect((await f.request(`/transactions/splits/${future.split_id}/confirm`, 'POST')).status).toBe(400)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    const deleted = (await create({ date: '2026-01-14' })).drafts[0]
    expect((await f.request(`/transactions/splits/${deleted.split_id}`, 'DELETE')).status).toBe(200)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_splits WHERE id = ?').bind(deleted.split_id).first('n')).toBe(0)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
  })

  it('edits, undoes and declines splits through confirmed MCP correction proposals', async () => {
    const split = (await create()).drafts[0]
    const before = await revision()
    const preview = await f.tool<CorrectionPreview>('prepare_mcp_split_corrections', { operations: [{ split_id: split.split_id, action: 'edit', changes: {
      description: 'Spar Market', receipt_total: 412.5,
      lines: [{ category_id: 'food', amount: 280, note: 'Groceries' }, { category_id: 'food', amount: 20, note: 'Snacks' }, { category_id: 'household', amount: 112.5 }],
    } }] })
    expect(preview.preview[0]).toMatchObject({ action: 'edit', becomes_single_draft: false, before: { line_count: 2 }, after: { line_count: 3, total: 412.5, description: 'Spar Market' } })
    const applied = await Promise.all(Array.from({ length: 3 }, () => f.tool<CorrectionResult>('apply_mcp_split_corrections', { proposal_id: preview.proposal_id })))
    expect(applied.filter(result => !result.idempotent_replay)).toHaveLength(1)
    const listed = (await f.tool<{ drafts: SplitItem[] }>('list_mcp_review_drafts', {})).drafts
    expect(listed).toMatchObject([{ type: 'split', split_id: split.split_id, description: 'Spar Market', line_count: 3, total: 412.5 }])
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
    expect(await revision()).toBe(before)

    // The old preview is stale now.
    const stale = await f.tool<CorrectionPreview>('prepare_mcp_split_corrections', { operations: [{ split_id: split.split_id, action: 'decline' }] })
    await f.request(`/transactions/splits/${split.split_id}`, 'PUT', { account_id: 'cash', date: '2026-01-15', description: 'Changed in app',
      lines: [{ category_id: 'food', amount: -300 }, { category_id: 'household', amount: -112.5 }] })
    await expect(f.tool('apply_mcp_split_corrections', { proposal_id: stale.proposal_id })).rejects.toThrow('stale_split')

    // Undo: a single line becomes an ordinary MCP review draft keeping the payee.
    const undo = await f.tool<CorrectionPreview>('prepare_mcp_split_corrections', { operations: [{ split_id: split.split_id, action: 'edit', changes: { lines: [{ category_id: 'food', amount: 412.5 }] } }] })
    expect(undo.preview[0].becomes_single_draft).toBe(true)
    await f.tool('apply_mcp_split_corrections', { proposal_id: undo.proposal_id })
    const single = (await f.tool<{ drafts: Array<{ type: string; amount: number; description: string }> }>('list_mcp_review_drafts', {})).drafts
    expect(single).toMatchObject([{ type: 'expense', amount: 412.5, description: 'Changed in app' }])
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_splits').first('n')).toBe(0)

    const other = (await create({ date: '2026-01-10' })).drafts[0]
    const decline = await f.tool<CorrectionPreview>('prepare_mcp_split_corrections', { operations: [{ split_id: other.split_id, action: 'decline' }] })
    await f.tool('apply_mcp_split_corrections', { proposal_id: decline.proposal_id })
    expect((await f.db.prepare('SELECT DISTINCT status FROM transactions WHERE split_id = ?').bind(other.split_id).all()).results).toEqual([{ status: 'cancelled' }])
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
  })
})
