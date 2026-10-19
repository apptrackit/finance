import type { AccountRow, CategoryRow, Env, StoredReviewDraftProposal, TransactionRow } from './types'
import { assertDate } from './validation'
import { sha256 } from './financial-outlook'

// A split review draft is one payment (typically one receipt) divided over categories.
// It is stored like an app split: a transaction_splits row plus pending mcp_review
// lines sharing split_id, account, date and status. Nothing touches balances or
// projections until the user confirms the whole split in the app.

type Direction = 'income' | 'expense'
type LineInput = { category_id?: string | null; amount: number; note?: string | null }
type SplitInput = {
  type: Direction; account_id: string; date: string; description?: string | null
  receipt_total?: number | null; exclude_from_estimate?: boolean; lines: LineInput[]
}
type CanonicalLine = { line_id: string; category_id: string | null; amount: number; signed_amount: number; note: string | null }
type CanonicalSplit = {
  kind: 'split'; split_id: string; type: Direction; account_id: string; date: string; description: string | null
  receipt_total: number | null; exclude_from_estimate: boolean; total: number; lines: CanonicalLine[]; review_flags: string[]
}
type DuplicateCandidate = { group_id: string; date: string; amount: number; status: string | null; description: string | null; line_count: number }

export type SplitLineRow = TransactionRow & {
  split_description: string | null; split_created_at: number; split_updated_at: number | null
  account_name: string; account_currency: string; account_type: string; account_locked: number
  category_name: string | null
}
export type SplitView = {
  id: string; type: 'split'; split_id: string; direction: Direction; total: number; signed_total: number
  date: string; account_id: string; account_name: string; currency: string; description: string | null
  exclude_from_estimate: boolean; line_count: number
  lines: Array<{ id: string; category_id: string | null; category_name: string | null; amount: number; signed_amount: number; note: string | null }>
  status: 'pending' | 'cancelled'; pending_kind: 'mcp_review'; review_source: 'chatgpt_mcp'
  review_batch_id: string | null; review_flags: string[]
  created_at: number | null; updated_at: number | null; account_locked: boolean; description_is_untrusted_data: true
}
type LinesChange = Array<{ category_id: string | null; amount: number; note: string | null }>
type Operation = { split_id: string; action: 'edit' | 'decline'; changes?: Partial<{
  type: Direction; account_id: string; date: string; description: string | null
  exclude_from_estimate: boolean; receipt_total: number | null; lines: LineInput[]
}> }
type StoredCorrection = {
  kind: 'split'; action: 'edit' | 'decline'; before: SplitView; after: SplitView
  snapshot: { split_updated_at: number | null; line_ids: string[]; account_name: string; currency: string }
  new_lines: Array<{ id: string; category_id: string | null; signed_amount: number; note: string | null }>
}
type StoredProposal = { id: string; proposal_hash: string; items_json: string; created_at: number; expires_at: number; consumed_at: number | null }

const LIFETIME_MS = 24 * 60 * 60_000
const MAX_AMOUNT = 1_000_000_000_000_000
const MAX_SPLITS = 10
const MAX_LINES = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STALE = '[stale_split] The split, its account or a category changed after preview; refresh list_mcp_review_drafts and prepare again'

/** Rounds to 8 decimals so float noise from summing lines never reaches stored values or comparisons. */
const round = (value: number) => Math.round(value * 1e8) / 1e8

export const SPLIT_LINE_SELECT = `SELECT t.*, s.description AS split_description, s.created_at AS split_created_at,
  s.updated_at AS split_updated_at, a.name AS account_name, a.currency AS account_currency, a.type AS account_type,
  COALESCE(a.is_locked, 0) AS account_locked, c.name AS category_name
  FROM transactions t JOIN transaction_splits s ON s.id = t.split_id
  JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id`

function flags(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((flag): flag is string => typeof flag === 'string') : []
  } catch { return [] }
}

function text(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`${name} must be a string or null`)
  const trimmed = value.trim()
  if (trimmed.length > 500) throw new Error(`${name} must be at most 500 characters`)
  return trimmed || null
}

function positive(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) throw new Error(`${name} must be a positive finite amount`)
  return value
}

/** Builds one review item from all lines of a split, in insertion order. */
export function splitView(lines: SplitLineRow[]): SplitView {
  const first = lines[0]
  const signedTotal = round(lines.reduce((sum, line) => sum + line.amount, 0))
  return {
    id: first.split_id!, type: 'split', split_id: first.split_id!, direction: signedTotal > 0 ? 'income' : 'expense',
    total: Math.abs(signedTotal), signed_total: signedTotal, date: first.date, account_id: first.account_id,
    account_name: first.account_name, currency: first.account_currency, description: first.split_description ?? null,
    exclude_from_estimate: first.exclude_from_estimate === 1 || first.exclude_from_estimate === true, line_count: lines.length,
    lines: lines.map(line => ({ id: line.id, category_id: line.category_id ?? null, category_name: line.category_name ?? null,
      amount: Math.abs(line.amount), signed_amount: line.amount, note: line.description ?? null })),
    status: first.status === 'cancelled' ? 'cancelled' : 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp',
    review_batch_id: first.review_batch_id ?? null, review_flags: flags(first.review_flags),
    created_at: first.split_created_at ?? first.created_at ?? null, updated_at: first.split_updated_at ?? null,
    account_locked: first.account_locked === 1, description_is_untrusted_data: true,
  }
}

export class SplitDraftService {
  constructor(private env: Env) {}

  private async dimensions(items: Array<{ type: Direction; account_id: string; lines: Array<{ category_id: string | null }> }>, label = 'items') {
    const [accounts, categories] = await Promise.all([
      this.env.DB.prepare('SELECT * FROM accounts').all<AccountRow>(),
      this.env.DB.prepare('SELECT * FROM categories').all<CategoryRow>(),
    ])
    const accountMap = new Map(accounts.results.map(account => [account.id, account]))
    const categoryMap = new Map(categories.results.map(category => [category.id, category]))
    items.forEach((item, index) => {
      const account = accountMap.get(item.account_id)
      if (!account) throw new Error(`${label}[${index}].account_id does not identify an existing account`)
      if (account.archived_at != null) throw new Error(`${label}[${index}].account_id identifies an archived account; restore it in the app first`)
      if (account.is_locked === 1 || account.is_locked === true) throw new Error(`${label}[${index}].account_id identifies locked account "${account.name}"`)
      if (account.type === 'investment') throw new Error(`${label}[${index}].account_id identifies an investment account; splits need a cash account`)
      item.lines.forEach((line, lineIndex) => {
        if (!line.category_id) return
        const category = categoryMap.get(line.category_id)
        if (!category) throw new Error(`${label}[${index}].lines[${lineIndex}].category_id does not identify an existing category`)
        if (category.type !== item.type) throw new Error(`${label}[${index}].lines[${lineIndex}].category_id is an ${category.type} category but the split type is ${item.type}`)
      })
    })
    return { accountMap, categoryMap }
  }

  private canonicalLines(inputs: unknown, type: Direction, path: string, minimum: number): CanonicalLine[] {
    if (!Array.isArray(inputs) || inputs.length < minimum || inputs.length > MAX_LINES) throw new Error(`${path} must contain ${minimum}–${MAX_LINES} lines`)
    return (inputs as LineInput[]).map((line, index) => {
      const amount = round(positive(line?.amount, `${path}[${index}].amount`))
      const categoryId = typeof line.category_id === 'string' && line.category_id.trim() ? line.category_id.trim() : null
      return { line_id: crypto.randomUUID(), category_id: categoryId, amount, signed_amount: type === 'income' ? amount : -amount, note: text(line.note, `${path}[${index}].note`) }
    })
  }

  /** The receipt total is optional, but when given the lines must add up to it exactly (to the cent). */
  private assertReceiptTotal(receiptTotal: unknown, total: number, path: string): number | null {
    if (receiptTotal === undefined || receiptTotal === null) return null
    const value = round(positive(receiptTotal, `${path}.receipt_total`))
    if (Math.abs(value - total) >= 0.005) {
      throw new Error(`${path} lines add up to ${total} but receipt_total is ${value} (difference ${round(value - total)}). Adjust the lines, for example by applying discounts or deposits to the line they belong to, so they match the receipt.`)
    }
    return value
  }

  private async duplicateCandidates(item: CanonicalSplit) {
    const signedTotal = item.type === 'income' ? item.total : -item.total
    return (await this.env.DB.prepare(
      `SELECT COALESCE(t.split_id, t.id) AS group_id, MIN(t.date) AS date, SUM(t.amount) AS amount, MAX(t.status) AS status,
         MAX(COALESCE(s.description, t.description)) AS description, COUNT(*) AS line_count
       FROM transactions t LEFT JOIN transaction_splits s ON s.id = t.split_id
       WHERE t.account_id = ? AND t.date >= date(?, '-3 days') AND t.date <= date(?, '+3 days')
         AND COALESCE(t.status, 'posted') != 'cancelled' AND t.linked_transaction_id IS NULL
       GROUP BY COALESCE(t.split_id, t.id) HAVING ABS(SUM(t.amount) - ?) < 0.000000001
       ORDER BY MIN(t.date) DESC LIMIT 5`
    ).bind(item.account_id, item.date, item.date, signedTotal).all<DuplicateCandidate>()).results
  }

  async prepare(args: Record<string, unknown>) {
    const inputs = args.items as SplitInput[]
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > MAX_SPLITS) throw new Error(`items must contain 1–${MAX_SPLITS} splits`)
    const items: CanonicalSplit[] = inputs.map((input, index) => {
      const path = `items[${index}]`
      if (input.type !== 'income' && input.type !== 'expense') throw new Error(`${path}.type must be income or expense`)
      const accountId = typeof input.account_id === 'string' ? input.account_id.trim() : ''
      if (!accountId) throw new Error(`${path}.account_id is required`)
      const lines = this.canonicalLines(input.lines, input.type, `${path}.lines`, 2)
      const total = round(lines.reduce((sum, line) => sum + line.amount, 0))
      if (total > MAX_AMOUNT) throw new Error(`${path} total is too large`)
      return {
        kind: 'split', split_id: crypto.randomUUID(), type: input.type, account_id: accountId,
        date: assertDate(input.date, `${path}.date`), description: text(input.description, `${path}.description`),
        receipt_total: this.assertReceiptTotal(input.receipt_total, total, path),
        exclude_from_estimate: input.exclude_from_estimate === true, total, lines, review_flags: [],
      }
    })
    const { accountMap, categoryMap } = await this.dimensions(items)
    const duplicates = await Promise.all(items.map(item => this.duplicateCandidates(item)))
    const identities = items.map(item => JSON.stringify([item.type, item.account_id, item.date, item.total]))
    const warnings: string[] = []
    items.forEach((item, index) => {
      if (duplicates[index].length || identities.indexOf(identities[index]) !== index || identities.lastIndexOf(identities[index]) !== index) {
        item.review_flags.push('possible_duplicate')
        warnings.push(`Split ${index + 1} may duplicate an existing transaction or split, or another split in this proposal; this warning does not block creation.`)
      }
      const uncategorized = item.lines.filter(line => !line.category_id).length
      if (uncategorized) warnings.push(`Split ${index + 1} has ${uncategorized} uncategorized line${uncategorized === 1 ? '' : 's'}.`)
    })
    const proposalId = crypto.randomUUID()
    const createdAt = Date.now()
    const expiresAt = createdAt + LIFETIME_MS
    await this.env.DB.prepare('INSERT INTO mcp_draft_proposals (id, proposal_hash, items_json, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .bind(proposalId, await sha256(JSON.stringify(items)), JSON.stringify(items), createdAt, expiresAt).run()
    return {
      as_of: new Date().toISOString(), proposal_id: proposalId, expires_at: new Date(expiresAt).toISOString(), item_count: items.length,
      preview: items.map((item, index) => {
        const account = accountMap.get(item.account_id)!
        return {
          item_number: index + 1, type: item.type, total: item.total, signed_total: item.type === 'income' ? item.total : -item.total,
          receipt_total: item.receipt_total, date: item.date, account_id: account.id, account_name: account.name, currency: account.currency,
          description: item.description, exclude_from_estimate: item.exclude_from_estimate,
          lines: item.lines.map((line, lineIndex) => ({ line_number: lineIndex + 1, category_id: line.category_id,
            category_name: line.category_id ? categoryMap.get(line.category_id)!.name : null, amount: line.amount, signed_amount: line.signed_amount, note: line.note })),
          warnings: item.review_flags,
          duplicate_candidates: duplicates[index].map(candidate => ({ transaction_or_split_id: candidate.group_id, date: candidate.date,
            amount: Math.abs(candidate.amount), signed_amount: candidate.amount, status: candidate.status || 'posted',
            line_count: candidate.line_count, description: candidate.description || null, description_is_untrusted_data: true })),
        }
      }),
      warnings, confirmation_required: true,
      next_action: 'Show every split with its lines, total and warnings. Only after explicit confirmation of the entire preview call create_mcp_split_drafts with proposal_id only.',
      effect: 'Preparation stores an expiring proposal only. Creation makes pending split review drafts; no balance changes until the user confirms each split in the app.',
    }
  }

  private parse(itemsJson: string): CanonicalSplit[] {
    let items: CanonicalSplit[]
    try { items = JSON.parse(itemsJson) as CanonicalSplit[] } catch { throw new Error('[proposal_corrupt] stored split proposal is invalid') }
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_SPLITS) throw new Error('[proposal_corrupt] stored split proposal is invalid')
    if (items.some(item => item?.kind !== 'split')) throw new Error('[proposal_corrupt] proposal belongs to a different draft flow')
    items.forEach(item => {
      const total = Array.isArray(item.lines) ? round(item.lines.reduce((sum, line) => sum + line.amount, 0)) : NaN
      if (!UUID.test(item.split_id) || (item.type !== 'income' && item.type !== 'expense') || typeof item.account_id !== 'string' || !item.account_id
        || !Array.isArray(item.lines) || item.lines.length < 2 || item.lines.length > MAX_LINES || total !== item.total
        || item.lines.some(line => !UUID.test(line.line_id) || typeof line.amount !== 'number' || !(line.amount > 0)
          || line.signed_amount !== (item.type === 'income' ? line.amount : -line.amount)
          || (line.category_id !== null && typeof line.category_id !== 'string') || (line.note !== null && typeof line.note !== 'string'))
        || (item.description !== null && typeof item.description !== 'string') || typeof item.exclude_from_estimate !== 'boolean'
        || !Array.isArray(item.review_flags)) throw new Error('[proposal_corrupt] stored split proposal is invalid')
      try { assertDate(item.date, 'split date') } catch { throw new Error('[proposal_corrupt] stored split date is invalid') }
    })
    return items
  }

  private async rowsFor(where: string, values: (string | number)[]) {
    return (await this.env.DB.prepare(`${SPLIT_LINE_SELECT} WHERE ${where} ORDER BY t.split_id, t.created_at, t.rowid`)
      .bind(...values).all<SplitLineRow>()).results
  }

  /** Groups line rows by split, keeping the given split order. */
  views(rows: SplitLineRow[], order: string[]): SplitView[] {
    const groups = new Map<string, SplitLineRow[]>()
    rows.forEach(row => groups.set(row.split_id!, [...(groups.get(row.split_id!) || []), row]))
    return order.flatMap(id => groups.has(id) ? [splitView(groups.get(id)!)] : [])
  }

  private async creationResult(proposalId: string, items: CanonicalSplit[], replay: boolean) {
    const rows = await this.rowsFor("t.review_batch_id = ? AND t.review_source = 'chatgpt_mcp' AND t.split_id IS NOT NULL", [proposalId])
    const drafts = this.views(rows, items.map(item => item.split_id))
    if (drafts.length !== items.length) throw new Error('[proposal_corrupt] proposal belongs to a different draft flow or its splits were removed')
    return {
      as_of: new Date().toISOString(), batch_id: proposalId, item_count: drafts.length, idempotent_replay: replay,
      result: 'mcp_split_review_drafts_created', drafts,
      effect: 'Creation did not post transactions or change balances; status reflects any later app review.',
      next_action: 'Review each split in Finance Manager MCP Review. Confirming posts every line and applies the total once; declining cancels every line.',
    }
  }

  async create(args: Record<string, unknown>) {
    const id = typeof args.proposal_id === 'string' ? args.proposal_id.trim() : ''
    if (!UUID.test(id)) throw new Error('[invalid_proposal_id] proposal_id must be a valid proposal identifier')
    const proposal = await this.env.DB.prepare('SELECT * FROM mcp_draft_proposals WHERE id = ?').bind(id).first<StoredReviewDraftProposal>()
    if (!proposal) throw new Error('[proposal_not_found] proposal_id was not found')
    const items = this.parse(proposal.items_json)
    if (await sha256(JSON.stringify(items)) !== proposal.proposal_hash) throw new Error('[proposal_corrupt] proposal checksum differs')
    const existing = await this.env.DB.prepare('SELECT proposal_hash FROM mcp_draft_batches WHERE id = ?').bind(id).first<{ proposal_hash: string }>()
    if (existing) {
      if (existing.proposal_hash !== proposal.proposal_hash) throw new Error('[proposal_corrupt] batch checksum differs')
      return this.creationResult(id, items, true)
    }
    if (proposal.consumed_at !== null && proposal.consumed_at !== undefined) throw new Error('[proposal_already_consumed] proposal_id was already consumed')
    if (Date.now() >= proposal.expires_at) throw new Error('[proposal_expired] proposal_id has expired; prepare a fresh preview and obtain explicit confirmation again')
    await this.dimensions(items)
    const now = Date.now()
    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare('UPDATE mcp_draft_proposals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, id),
      this.env.DB.prepare('INSERT INTO mcp_draft_batches (id, proposal_hash, created_at) VALUES (?, ?, ?)').bind(id, proposal.proposal_hash, now),
    ]
    for (const item of items) {
      statements.push(this.env.DB.prepare('INSERT INTO transaction_splits (id, description, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .bind(item.split_id, item.description, now, now))
      for (const line of item.lines) {
        statements.push(this.env.DB.prepare(
          `INSERT INTO transactions (id, account_id, category_id, amount, description, date, linked_transaction_id, exclude_from_estimate,
             status, confirmed_at, cancelled_at, created_at, updated_at, pending_kind, review_source, review_batch_id, review_flags, split_id)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', NULL, NULL, ?, ?, 'mcp_review', 'chatgpt_mcp', ?, ?, ?)`
        ).bind(line.line_id, item.account_id, line.category_id, line.signed_amount, line.note, item.date,
          item.exclude_from_estimate ? 1 : 0, now, now, id, JSON.stringify(item.review_flags), item.split_id))
      }
      statements.push(this.env.DB.prepare("INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) VALUES (?, 'CREATE', 'transaction_split', ?, ?, ?)")
        .bind(crypto.randomUUID(), item.split_id, JSON.stringify({ origin: 'chatgpt_mcp', batch_id: id, account_id: item.account_id, lines: item.lines.length, total: item.type === 'income' ? item.total : -item.total, status: 'pending' }), now))
    }
    try { await this.env.DB.batch(statements) } catch (error) {
      const raced = await this.env.DB.prepare('SELECT proposal_hash FROM mcp_draft_batches WHERE id = ?').bind(id).first<{ proposal_hash: string }>()
      if (!raced || raced.proposal_hash !== proposal.proposal_hash) throw error
      return this.creationResult(id, items, true)
    }
    return this.creationResult(id, items, false)
  }

  /** All lines of the given splits that are still unresolved MCP review drafts. */
  async pendingViews(splitIds: string[]): Promise<SplitView[]> {
    if (!splitIds.length) return []
    const rows = await this.rowsFor(`t.split_id IN (${splitIds.map(() => '?').join(',')}) AND t.status = 'pending'
      AND t.pending_kind = 'mcp_review' AND t.review_source = 'chatgpt_mcp'`, splitIds)
    return this.views(rows, splitIds)
  }

  private async target(splitId: string): Promise<{ view: SplitView; rows: SplitLineRow[] }> {
    const rows = await this.rowsFor('t.split_id = ?', [splitId])
    if (!rows.length || rows.some(row => row.status !== 'pending' || row.pending_kind !== 'mcp_review' || row.review_source !== 'chatgpt_mcp'
      || row.linked_transaction_id || row.account_type === 'investment' || row.account_id !== rows[0].account_id || row.date !== rows[0].date)) {
      throw new Error('[split_unavailable] Target must be an unresolved MCP split review draft; refresh list_mcp_review_drafts')
    }
    return { view: splitView(rows), rows }
  }

  async prepareCorrections(args: Record<string, unknown>) {
    const operations = args.operations as Operation[]
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > MAX_SPLITS) throw new Error(`operations must contain 1–${MAX_SPLITS} items`)
    const seen = new Set<string>()
    const items: StoredCorrection[] = []
    for (const [index, operation] of operations.entries()) {
      const path = `operations[${index}]`
      if (typeof operation.split_id !== 'string' || !UUID.test(operation.split_id)) throw new Error(`${path}.split_id must be a valid identifier`)
      if (seen.has(operation.split_id)) throw new Error(`${path}.split_id is repeated`)
      seen.add(operation.split_id)
      const { view: before } = await this.target(operation.split_id)
      if (before.account_locked) throw new Error(`${path} targets a locked account`)
      const snapshot = { split_updated_at: before.updated_at, line_ids: before.lines.map(line => line.id), account_name: before.account_name, currency: before.currency }
      if (operation.action === 'decline') {
        if (operation.changes !== undefined) throw new Error(`${path}.changes is not allowed for decline`)
        items.push({ kind: 'split', action: 'decline', before, after: { ...before, status: 'cancelled' }, snapshot, new_lines: [] })
        continue
      }
      if (operation.action !== 'edit') throw new Error(`${path}.action must be edit or decline`)
      const changes = operation.changes || {}
      if (!Object.keys(changes).length) throw new Error(`${path}.changes must contain an edit`)
      const type = changes.type ?? before.direction
      if (type !== 'income' && type !== 'expense') throw new Error(`${path}.changes.type must be income or expense`)
      if (changes.type && changes.type !== before.direction && !changes.lines) throw new Error(`${path}.changes.lines is required when changing the type, because categories belong to a type`)
      const lines: LinesChange = changes.lines
        ? this.canonicalLines(changes.lines, type, `${path}.changes.lines`, 1).map(line => ({ category_id: line.category_id, amount: line.amount, note: line.note }))
        : before.lines.map(line => ({ category_id: line.category_id, amount: line.amount, note: line.note }))
      const total = round(lines.reduce((sum, line) => sum + line.amount, 0))
      this.assertReceiptTotal(changes.receipt_total, total, `${path}.changes`)
      const accountId = changes.account_id?.trim() || before.account_id
      const { accountMap, categoryMap } = await this.dimensions([{ type, account_id: accountId, lines }], 'operations')
      const account = accountMap.get(accountId)!
      const newLines = lines.map(line => ({ id: crypto.randomUUID(), category_id: line.category_id, signed_amount: type === 'income' ? line.amount : -line.amount, note: line.note }))
      const after: SplitView = {
        ...before, direction: type, total, signed_total: type === 'income' ? total : -total,
        date: assertDate(changes.date ?? before.date, `${path}.changes.date`), account_id: account.id, account_name: account.name, currency: account.currency,
        description: changes.description === undefined ? before.description : text(changes.description, `${path}.changes.description`),
        exclude_from_estimate: changes.exclude_from_estimate ?? before.exclude_from_estimate, line_count: newLines.length,
        lines: newLines.map(line => ({ id: line.id, category_id: line.category_id, category_name: line.category_id ? categoryMap.get(line.category_id)!.name : null,
          amount: Math.abs(line.signed_amount), signed_amount: line.signed_amount, note: line.note })),
      }
      items.push({ kind: 'split', action: 'edit', before, after, snapshot, new_lines: newLines })
    }
    const proposalId = crypto.randomUUID()
    const createdAt = Date.now()
    const expiresAt = createdAt + LIFETIME_MS
    await this.env.DB.prepare('INSERT INTO mcp_draft_correction_proposals (id, proposal_hash, items_json, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .bind(proposalId, await sha256(JSON.stringify(items)), JSON.stringify(items), createdAt, expiresAt).run()
    return {
      as_of: new Date().toISOString(), proposal_id: proposalId, expires_at: new Date(expiresAt).toISOString(), item_count: items.length,
      preview: items.map(({ action, before, after }) => ({ action, before, after, becomes_single_draft: action === 'edit' && after.line_count === 1 })),
      confirmation_required: true,
      next_action: 'Show every split before and after, including all lines. Only after explicit user confirmation call apply_mcp_split_corrections with proposal_id only.',
      effect: 'Preparation stores an expiring proposal only. No draft, balance or projection changed.',
    }
  }

  private parseCorrections(proposal: StoredProposal): StoredCorrection[] {
    let items: StoredCorrection[]
    try { items = JSON.parse(proposal.items_json) as StoredCorrection[] } catch { throw new Error('[proposal_corrupt] Stored proposal is invalid') }
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_SPLITS) throw new Error('[proposal_corrupt] Stored proposal is invalid')
    if (items.some(item => item?.kind !== 'split')) throw new Error('[proposal_corrupt] proposal belongs to a different correction flow')
    if (items.some(item => !UUID.test(item.before?.split_id) || !item.after || !item.snapshot || !Array.isArray(item.new_lines)
      || !['edit', 'decline'].includes(item.action) || (item.action === 'edit' && (item.new_lines.length < 1 || item.new_lines.some(line => !UUID.test(line.id)))))) {
      throw new Error('[proposal_corrupt] Stored proposal is invalid')
    }
    return items
  }

  private correctionResult(items: StoredCorrection[], replay: boolean, appliedAt: number) {
    return {
      as_of: new Date().toISOString(), result: 'mcp_split_reviews_corrected', item_count: items.length, idempotent_replay: replay,
      splits: items.map(({ action, after, snapshot }) => ({ action, ...after, updated_at: Math.max(appliedAt, (snapshot.split_updated_at ?? 0) + 1) })),
      effect: 'Only pending MCP split review drafts changed. No balance, posted transaction or upcoming projection changed.',
    }
  }

  async applyCorrections(args: Record<string, unknown>) {
    const id = typeof args.proposal_id === 'string' && UUID.test(args.proposal_id) ? args.proposal_id : ''
    if (!id) throw new Error('proposal_id must be a valid identifier')
    const proposal = await this.env.DB.prepare('SELECT * FROM mcp_draft_correction_proposals WHERE id = ?').bind(id).first<StoredProposal>()
    if (!proposal) throw new Error('[proposal_not_found] proposal_id was not found')
    const items = this.parseCorrections(proposal)
    if (await sha256(JSON.stringify(items)) !== proposal.proposal_hash) throw new Error('[proposal_corrupt] Stored proposal checksum does not match')
    const run = await this.env.DB.prepare('SELECT proposal_hash, created_at FROM mcp_draft_correction_runs WHERE id = ?').bind(id).first<{ proposal_hash: string; created_at: number }>()
    if (run) {
      if (run.proposal_hash !== proposal.proposal_hash) throw new Error('[proposal_corrupt] Completed run conflicts with proposal')
      return this.correctionResult(items, true, run.created_at)
    }
    if (proposal.consumed_at !== null) throw new Error('[proposal_already_consumed] Proposal was already consumed')
    if (Date.now() >= proposal.expires_at) throw new Error('[proposal_expired] Prepare a fresh preview and confirm again')
    for (const item of items) {
      let current: SplitView
      try { current = (await this.target(item.before.split_id)).view } catch { throw new Error(STALE) }
      if (current.updated_at !== item.snapshot.split_updated_at || JSON.stringify(current.lines.map(line => line.id)) !== JSON.stringify(item.snapshot.line_ids)
        || current.account_name !== item.snapshot.account_name || current.currency !== item.snapshot.currency || current.account_locked) throw new Error(STALE)
      if (item.action === 'edit') {
        try { await this.dimensions([{ type: item.after.direction, account_id: item.after.account_id, lines: item.after.lines }], 'operations') } catch { throw new Error(STALE) }
      }
    }
    const now = Date.now()
    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare('UPDATE mcp_draft_correction_proposals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, id),
      this.env.DB.prepare('INSERT INTO mcp_draft_correction_runs (id, proposal_hash, created_at) VALUES (?, ?, ?)').bind(id, proposal.proposal_hash, now),
    ]
    for (const item of items) {
      const splitId = item.before.split_id
      const updatedAt = Math.max(now, (item.snapshot.split_updated_at ?? 0) + 1)
      const lineIds = item.snapshot.line_ids
      const placeholders = lineIds.map(() => '?').join(',')
      // The guard is the audit row's NOT NULL entity_id: a stale split aborts the whole batch.
      const guard = `SELECT s.id FROM transaction_splits s WHERE s.id = ? AND s.updated_at IS ?
        AND (SELECT COUNT(*) FROM transactions WHERE split_id = s.id) = ?
        AND (SELECT COUNT(*) FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.split_id = s.id AND t.id IN (${placeholders})
          AND t.status = 'pending' AND t.pending_kind = 'mcp_review' AND t.review_source = 'chatgpt_mcp' AND t.linked_transaction_id IS NULL
          AND a.name = ? AND a.currency = ? AND COALESCE(a.is_locked, 0) = 0 AND a.archived_at IS NULL AND a.type != 'investment') = ?
        AND EXISTS (SELECT 1 FROM accounts na WHERE na.id = ? AND na.name = ? AND na.currency = ? AND COALESCE(na.is_locked, 0) = 0
          AND na.archived_at IS NULL AND na.type != 'investment')`
      statements.push(this.env.DB.prepare(`INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) VALUES (?, ?, 'transaction_split', (${guard}), ?, ?)`)
        .bind(crypto.randomUUID(), item.action === 'edit' ? 'UPDATE' : 'DECLINE', splitId, item.snapshot.split_updated_at, lineIds.length, ...lineIds,
          item.snapshot.account_name, item.snapshot.currency, lineIds.length, item.after.account_id, item.after.account_name, item.after.currency,
          JSON.stringify({ origin: 'chatgpt_mcp', proposal_id: id, action: item.action, lines: item.after.line_count, total: item.after.signed_total }), now))
      if (item.action === 'decline') {
        statements.push(this.env.DB.prepare('UPDATE transaction_splits SET updated_at = ? WHERE id = ?').bind(updatedAt, splitId))
        statements.push(this.env.DB.prepare(`UPDATE transactions SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE split_id = ? AND status = 'pending'`)
          .bind(now, updatedAt, splitId))
        continue
      }
      const after = item.after
      const single = item.new_lines.length === 1
      // Detach the old lines first so the last-line cleanup trigger cannot remove the split mid-batch.
      statements.push(this.env.DB.prepare('UPDATE transaction_splits SET description = ?, updated_at = ? WHERE id = ?').bind(after.description, updatedAt, splitId))
      statements.push(this.env.DB.prepare('UPDATE transactions SET split_id = NULL WHERE split_id = ?').bind(splitId))
      for (const line of item.new_lines) {
        statements.push(this.env.DB.prepare(
          `INSERT INTO transactions (id, account_id, category_id, amount, description, date, linked_transaction_id, exclude_from_estimate,
             status, confirmed_at, cancelled_at, created_at, updated_at, pending_kind, review_source, review_batch_id, review_flags, split_id)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', NULL, NULL, ?, ?, 'mcp_review', 'chatgpt_mcp', ?, ?, ?)`
        ).bind(line.id, after.account_id, line.category_id, line.signed_amount,
          // A split reduced to one line becomes an ordinary draft that keeps the payee as its description.
          single ? after.description || line.note : line.note, after.date, after.exclude_from_estimate ? 1 : 0,
          item.before.created_at ?? now, updatedAt, after.review_batch_id, JSON.stringify(after.review_flags), single ? null : splitId))
      }
      statements.push(this.env.DB.prepare(`DELETE FROM transactions WHERE id IN (${placeholders}) AND split_id IS NULL`).bind(...lineIds))
      statements.push(this.env.DB.prepare('DELETE FROM transaction_splits WHERE id = ? AND NOT EXISTS (SELECT 1 FROM transactions WHERE split_id = ?)').bind(splitId, splitId))
    }
    try { await this.env.DB.batch(statements) } catch (error) {
      const raced = await this.env.DB.prepare('SELECT proposal_hash, created_at FROM mcp_draft_correction_runs WHERE id = ?').bind(id).first<{ proposal_hash: string; created_at: number }>()
      if (raced?.proposal_hash === proposal.proposal_hash) return this.correctionResult(items, true, raced.created_at)
      const message = error instanceof Error ? error.message : String(error)
      if (/NOT NULL constraint failed: audit_log.entity_id/i.test(message)) throw new Error(STALE)
      throw error
    }
    return this.correctionResult(items, false, now)
  }
}
