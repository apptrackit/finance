import type { AccountRow, CategoryRow, Env, TransactionRow } from './types'
import { assertDate, clampLimit } from './validation'
import { sha256 } from './financial-outlook'
import { transferReviewView } from './transfer-review-corrections'

type DraftRow = TransactionRow & {
  account_name: string
  account_currency: string
  account_type: string
  account_locked: number
  category_name: string | null
}
type DraftView = {
  id: string; type: 'income' | 'expense'; amount: number; signed_amount: number
  date: string; account_id: string; account_name: string; currency: string
  category_id: string | null; category_name: string | null; description: string | null
  exclude_from_estimate: boolean; status: string; pending_kind: string
  review_source: string; review_batch_id: string | null; review_flags: string[]
  created_at: number | null; updated_at: number | null; description_is_untrusted_data: true
}
type Operation = { draft_id: string; action: 'edit' | 'decline'; changes?: Partial<{
  type: 'income' | 'expense'; amount: number; date: string; account_id: string
  category_id: string | null; description: string | null; exclude_from_estimate: boolean
}> }
type StoredItem = { action: 'edit' | 'decline'; before: DraftView; after: DraftView; snapshot: {
  amount: number; account_id: string; category_id: string | null; description: string | null
  date: string; exclude_from_estimate: number; review_flags: string; created_at: number | null
  updated_at: number | null; review_batch_id: string | null
} }
type StoredProposal = { id: string; proposal_hash: string; items_json: string; created_at: number; expires_at: number; consumed_at: number | null }

const LIFETIME_MS = 24 * 60 * 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SELECT = `SELECT t.*, a.name AS account_name, a.currency AS account_currency,
  a.type AS account_type, COALESCE(a.is_locked, 0) AS account_locked,
  c.name AS category_name FROM transactions t
  JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id`
const REVIEW = "t.status = 'pending' AND t.pending_kind = 'mcp_review' AND t.review_source = 'chatgpt_mcp' AND a.type != 'investment'"
const ACTIVE = `${REVIEW} AND t.linked_transaction_id IS NULL`
const STALE = '[stale_draft] A draft or its account/category changed after preview; refresh the list and prepare again'

function flags(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((flag): flag is string => typeof flag === 'string') : []
  } catch { return [] }
}

function view(row: DraftRow): DraftView {
  return {
    id: row.id, type: row.amount > 0 ? 'income' : 'expense', amount: Math.abs(row.amount), signed_amount: row.amount,
    date: row.date, account_id: row.account_id, account_name: row.account_name, currency: row.account_currency,
    category_id: row.category_id ?? null, category_name: row.category_name ?? null,
    description: row.description ?? null, exclude_from_estimate: row.exclude_from_estimate === 1 || row.exclude_from_estimate === true,
    status: row.status || 'pending', pending_kind: row.pending_kind || 'mcp_review', review_source: row.review_source || 'chatgpt_mcp',
    review_batch_id: row.review_batch_id ?? null, review_flags: flags(row.review_flags),
    created_at: row.created_at ?? null, updated_at: row.updated_at ?? null, description_is_untrusted_data: true,
  }
}

function snapshot(row: DraftRow): StoredItem['snapshot'] {
  return {
    amount: row.amount, account_id: row.account_id, category_id: row.category_id ?? null,
    description: row.description ?? null, date: row.date,
    exclude_from_estimate: row.exclude_from_estimate === 1 || row.exclude_from_estimate === true ? 1 : 0,
    review_flags: row.review_flags ?? '[]', created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null, review_batch_id: row.review_batch_id ?? null,
  }
}

function assertTarget(row: DraftRow | null): asserts row is DraftRow {
  if (!row || row.status !== 'pending' || row.pending_kind !== 'mcp_review' || row.review_source !== 'chatgpt_mcp'
    || row.linked_transaction_id || row.account_type === 'investment' || row.amount === 0) {
    throw new Error('[draft_unavailable] Target must be an unresolved, unlinked MCP income/expense review draft')
  }
}

function assertUuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${name} must be a valid identifier`)
  return value
}

function decodeQueueCursor(value: unknown): { created_at: number; id: string } | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || value.length > 500) throw new Error('cursor is invalid')
  try {
    const cursor: unknown = JSON.parse(atob(value))
    if (!cursor || typeof cursor !== 'object') throw new Error()
    const data = cursor as { created_at?: unknown; id?: unknown }
    if (typeof data.created_at !== 'number' || !Number.isSafeInteger(data.created_at) || typeof data.id !== 'string' || !data.id) throw new Error()
    return { created_at: data.created_at, id: data.id }
  } catch { throw new Error('cursor is invalid') }
}

export class ReviewCorrectionService {
  constructor(private env: Env) {}

  private async target(id: string) {
    return this.env.DB.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first<DraftRow>()
  }

  async list(args: Record<string, unknown>) {
    const limit = clampLimit(args.limit, 50)
    const cursor = decodeQueueCursor(args.cursor)
    const rows = (await this.env.DB.prepare(`${SELECT} WHERE ${REVIEW}
      AND (t.linked_transaction_id IS NULL OR t.amount < 0)
      ${cursor ? 'AND (t.created_at > ? OR (t.created_at = ? AND t.id > ?))' : ''}
      ORDER BY t.created_at ASC, t.id ASC LIMIT ?`)
      .bind(...(cursor ? [cursor.created_at, cursor.created_at, cursor.id] : []), limit + 1).all<DraftRow>()).results
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const linkedIds = page.flatMap(row => row.linked_transaction_id ? [row.linked_transaction_id] : [])
    const linkedRows = linkedIds.length
      ? (await this.env.DB.prepare(`${SELECT} WHERE t.id IN (${linkedIds.map(() => '?').join(',')})`)
        .bind(...linkedIds).all<DraftRow>()).results
      : []
    const pairs = new Map(linkedRows.map(row => [row.id, row]))
    return {
      as_of: new Date().toISOString(), drafts: page.map(row => row.linked_transaction_id
        ? transferReviewView(row, pairs.get(row.linked_transaction_id) ?? null)
        : view(row)),
      pagination: { limit, has_more: hasMore, next_cursor: hasMore && last ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id })) : null },
      truncated: hasMore, description_is_untrusted_data: true,
    }
  }

  private async dimensions(accountId: string, categoryId: string | null, type: 'income' | 'expense') {
    const [account, category] = await Promise.all([
      this.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(accountId).first<AccountRow>(),
      categoryId ? this.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(categoryId).first<CategoryRow>() : Promise.resolve(null),
    ])
    if (!account) throw new Error(`account_id ${accountId} does not identify an existing account`)
    if (account.is_locked === 1 || account.is_locked === true) throw new Error(`account_id ${accountId} identifies a locked account`)
    if (account.type === 'investment') throw new Error(`account_id ${accountId} identifies an investment account`)
    if (categoryId && !category) throw new Error(`category_id ${categoryId} does not identify an existing category`)
    if (category && category.type !== type) throw new Error(`category_id ${categoryId} must match ${type}`)
    return { account, category }
  }

  async prepare(args: Record<string, unknown>) {
    const operations = args.operations as Operation[]
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 20) throw new Error('operations must contain 1–20 items')
    const seen = new Set<string>()
    const items: StoredItem[] = []
    for (const [index, operation] of operations.entries()) {
      const id = assertUuid(operation.draft_id, `operations[${index}].draft_id`)
      if (seen.has(id)) throw new Error(`operations[${index}].draft_id is repeated`)
      seen.add(id)
      const row = await this.target(id)
      assertTarget(row)
      if (row.account_locked) throw new Error(`operations[${index}] targets a locked account`)
      const before = view(row)
      let after = { ...before }
      if (operation.action === 'edit') {
        const changes = operation.changes || {}
        if (!Object.keys(changes).length) throw new Error(`operations[${index}].changes must contain an edit`)
        const type = changes.type ?? before.type
        const amount = changes.amount ?? before.amount
        if ((type !== 'income' && type !== 'expense') || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000_000) throw new Error(`operations[${index}] has an invalid type or amount`)
        const accountId = changes.account_id ?? before.account_id
        const categoryId = changes.category_id === undefined ? before.category_id : changes.category_id
        const description = changes.description === undefined ? before.description : changes.description?.trim() || null
        if (description && description.length > 500) throw new Error(`operations[${index}].description is too long`)
        const date = assertDate(changes.date ?? before.date, `operations[${index}].date`)
        const { account, category } = await this.dimensions(accountId, categoryId, type)
        after = { ...before, type, amount, signed_amount: type === 'income' ? amount : -amount,
          account_id: accountId, account_name: account.name, currency: account.currency,
          category_id: categoryId, category_name: category?.name || null, description, date,
          exclude_from_estimate: changes.exclude_from_estimate ?? before.exclude_from_estimate }
      } else if (operation.action === 'decline') {
        if (operation.changes !== undefined) throw new Error(`operations[${index}].changes is not allowed for decline`)
        after = { ...before, status: 'cancelled' }
      } else throw new Error(`operations[${index}].action is invalid`)
      items.push({ action: operation.action, before, after, snapshot: snapshot(row) })
    }
    const proposalId = crypto.randomUUID()
    const createdAt = Date.now()
    const expiresAt = createdAt + LIFETIME_MS
    const hash = await sha256(JSON.stringify(items))
    await this.env.DB.prepare('INSERT INTO mcp_draft_correction_proposals (id, proposal_hash, items_json, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .bind(proposalId, hash, JSON.stringify(items), createdAt, expiresAt).run()
    return { as_of: new Date().toISOString(), proposal_id: proposalId, expires_at: new Date(expiresAt).toISOString(),
      item_count: items.length, preview: items.map(({ action, before, after }) => ({ action, before, after })),
      confirmation_required: true,
      next_action: 'Show every before and after item. Only after explicit user confirmation call apply_mcp_review_draft_corrections with proposal_id.',
      effect: 'Preparation stores an expiring proposal only. No draft, balance, or projection changed.' }
  }

  private parseItems(proposal: StoredProposal): StoredItem[] {
    let items: StoredItem[]
    try { items = JSON.parse(proposal.items_json) as StoredItem[] } catch { throw new Error('[proposal_corrupt] Stored proposal is invalid') }
    if (!Array.isArray(items) || items.length < 1 || items.length > 20 || items.some(item => !item?.before?.id || !item.after || !item.snapshot || !['edit', 'decline'].includes(item.action))) {
      throw new Error('[proposal_corrupt] Stored proposal is invalid')
    }
    return items
  }

  private result(items: StoredItem[], replay: boolean, appliedAt: number) {
    return { as_of: new Date().toISOString(), result: 'mcp_review_drafts_corrected', item_count: items.length,
      idempotent_replay: replay, drafts: items.map(({ action, after, snapshot: before }) => ({
        action, ...after, updated_at: Math.max(appliedAt, (before.updated_at ?? 0) + 1),
      })),
      effect: 'Only pending MCP review drafts changed. No balance, posted transaction, or upcoming projection changed.' }
  }

  async apply(args: Record<string, unknown>) {
    const id = assertUuid(args.proposal_id, 'proposal_id')
    const proposal = await this.env.DB.prepare('SELECT * FROM mcp_draft_correction_proposals WHERE id = ?').bind(id).first<StoredProposal>()
    if (!proposal) throw new Error('[proposal_not_found] proposal_id was not found')
    const items = this.parseItems(proposal)
    if (await sha256(JSON.stringify(items)) !== proposal.proposal_hash) throw new Error('[proposal_corrupt] Stored proposal checksum does not match')
    const run = await this.env.DB.prepare('SELECT proposal_hash, created_at FROM mcp_draft_correction_runs WHERE id = ?').bind(id).first<{ proposal_hash: string; created_at: number }>()
    if (run) {
      if (run.proposal_hash !== proposal.proposal_hash) throw new Error('[proposal_corrupt] Completed run conflicts with proposal')
      return this.result(items, true, run.created_at)
    }
    if (proposal.consumed_at !== null) throw new Error('[proposal_already_consumed] Proposal was already consumed')
    if (Date.now() >= proposal.expires_at) throw new Error('[proposal_expired] Prepare a fresh preview and confirm again')
    for (const item of items) {
      const row = await this.target(item.before.id)
      if (!row || JSON.stringify(snapshot(row)) !== JSON.stringify(item.snapshot)
        || row.status !== 'pending' || row.pending_kind !== 'mcp_review' || row.review_source !== 'chatgpt_mcp'
        || row.linked_transaction_id || row.account_name !== item.before.account_name || row.account_currency !== item.before.currency
        || row.category_name !== item.before.category_name) throw new Error(STALE)
      if (row.account_locked) throw new Error(STALE)
      if (item.action === 'edit') {
        try {
          await this.dimensions(item.after.account_id, item.after.category_id, item.after.type)
        } catch { throw new Error(STALE) }
      }
    }
    const now = Date.now()
    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare('UPDATE mcp_draft_correction_proposals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, id),
      this.env.DB.prepare('INSERT INTO mcp_draft_correction_runs (id, proposal_hash, created_at) VALUES (?, ?, ?)').bind(id, proposal.proposal_hash, now),
    ]
    for (const item of items) {
      const s = item.snapshot
      const after = item.after
      const guard = `${ACTIVE} AND t.id = ? AND t.amount = ? AND t.account_id = ? AND t.category_id IS ?
        AND t.description IS ? AND t.date = ? AND COALESCE(t.exclude_from_estimate, 0) = ?
        AND t.review_flags = ? AND t.created_at IS ? AND t.updated_at IS ? AND t.review_batch_id IS ?
        AND a.name = ? AND a.currency = ? AND c.name IS ? AND COALESCE(a.is_locked, 0) = 0 AND a.type != 'investment'
        AND EXISTS (SELECT 1 FROM accounts na WHERE na.id = ? AND na.name = ? AND na.currency = ?
          AND COALESCE(na.is_locked, 0) = 0 AND na.type != 'investment')
        AND (? IS NULL OR EXISTS (SELECT 1 FROM categories nc WHERE nc.id = ? AND nc.name = ? AND nc.type = ?))`
      const guardValues = [item.before.id, s.amount, s.account_id, s.category_id, s.description, s.date,
        s.exclude_from_estimate, s.review_flags, s.created_at, s.updated_at, s.review_batch_id,
        item.before.account_name, item.before.currency, item.before.category_name, after.account_id, after.account_name, after.currency,
        after.category_id, after.category_id, after.category_name, after.type]
      // audit_log.entity_id is NOT NULL: a failed conditional lookup aborts the whole D1 batch.
      statements.push(this.env.DB.prepare(`INSERT INTO audit_log (id, action, entity, entity_id, details, created_at)
        VALUES (?, ?, 'transaction', (SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id WHERE ${guard}), ?, ?)`)
        .bind(crypto.randomUUID(), item.action === 'edit' ? 'UPDATE' : 'DECLINE', ...guardValues,
          JSON.stringify({ origin: 'chatgpt_mcp', proposal_id: id, action: item.action }), now))
      const updatedAt = Math.max(now, (s.updated_at ?? 0) + 1)
      if (item.action === 'edit') {
        statements.push(this.env.DB.prepare(`UPDATE transactions SET account_id = ?, category_id = ?, amount = ?, description = ?,
          date = ?, exclude_from_estimate = ?, updated_at = ? WHERE id = ?`)
          .bind(after.account_id, after.category_id, after.signed_amount, after.description, after.date,
            after.exclude_from_estimate ? 1 : 0, updatedAt, after.id))
      } else {
        statements.push(this.env.DB.prepare("UPDATE transactions SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?")
          .bind(now, updatedAt, after.id))
      }
    }
    try { await this.env.DB.batch(statements) } catch (error) {
      const raced = await this.env.DB.prepare('SELECT proposal_hash, created_at FROM mcp_draft_correction_runs WHERE id = ?').bind(id).first<{ proposal_hash: string; created_at: number }>()
      if (raced?.proposal_hash === proposal.proposal_hash) return this.result(items, true, raced.created_at)
      const message = error instanceof Error ? error.message : String(error)
      if (/NOT NULL constraint failed: audit_log.entity_id/i.test(message)) throw new Error(STALE)
      throw error
    }
    return this.result(items, false, now)
  }
}
