import type { AccountRow, Env, TransactionRow } from './types'
import { sha256 } from './financial-outlook'
import { assertDate } from './validation'

export type TransferReviewRow = TransactionRow & {
  account_name: string
  account_currency: string
  account_type: string
  account_locked: number
}

type TransferView = {
  id: string; type: 'transfer'; outgoing_id: string; incoming_id: string
  from_account_id: string; from_account_name: string; from_currency: string
  to_account_id: string; to_account_name: string; to_currency: string
  debit_amount: number; credit_amount: number; effective_fx_rate: number
  date: string; description: string | null; status: 'pending' | 'cancelled'
  pending_kind: 'mcp_review'; review_source: 'chatgpt_mcp'
  review_batch_id: string; review_flags: string[]
  created_at: number | null; updated_at: number | null
  accounts_locked: boolean; description_is_untrusted_data: true
}

type Changes = Partial<{
  from_account_id: string; to_account_id: string; amount: number; amount_to: number
  date: string; description: string | null
}>
type Operation = { transfer_id: string; action: 'edit' | 'decline'; changes?: Changes }
type RowSnapshot = {
  id: string; linked_transaction_id: string | null; account_id: string; account_name: string
  account_currency: string; account_type: string; account_locked: number
  amount: number; date: string; description: string | null; category_id: string | null
  exclude_from_estimate: number; status: string | null; pending_kind: string | null
  review_source: string | null; review_batch_id: string | null; review_flags: string | null
  created_at: number | null; updated_at: number | null
}
type StoredItem = {
  action: 'edit' | 'decline'; before: TransferView; after: TransferView
  snapshots: { outgoing: RowSnapshot; incoming: RowSnapshot }
}
type Proposal = { id: string; proposal_hash: string; items_json: string; created_at: number; expires_at: number; consumed_at: number | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LIFETIME_MS = 24 * 60 * 60_000
const MAX_AMOUNT = 1_000_000_000_000_000
const CASH_TYPES = new Set(['cash', 'checking', 'savings'])
const STALE = '[stale_transfer] A transfer leg or account changed after preview; refresh the list and prepare again'
const SELECT = `SELECT t.*, a.name AS account_name, a.currency AS account_currency,
  a.type AS account_type, COALESCE(a.is_locked, 0) AS account_locked
  FROM transactions t JOIN accounts a ON a.id = t.account_id`

function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${name} must be a valid identifier`)
  return value
}

function flags(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((flag): flag is string => typeof flag === 'string') : []
  } catch { return [] }
}

function amount(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) {
    throw new Error(`${name} must be positive and finite`)
  }
  return value
}

function rowSnapshot(row: TransferReviewRow): RowSnapshot {
  return {
    id: row.id, linked_transaction_id: row.linked_transaction_id ?? null,
    account_id: row.account_id, account_name: row.account_name, account_currency: row.account_currency,
    account_type: row.account_type, account_locked: row.account_locked,
    amount: row.amount, date: row.date, description: row.description ?? null,
    category_id: row.category_id ?? null,
    exclude_from_estimate: row.exclude_from_estimate === 1 || row.exclude_from_estimate === true ? 1 : 0,
    status: row.status ?? null, pending_kind: row.pending_kind ?? null,
    review_source: row.review_source ?? null, review_batch_id: row.review_batch_id ?? null,
    review_flags: row.review_flags ?? null, created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

export function transferReviewView(outgoing: TransferReviewRow, incoming: TransferReviewRow | null): TransferView {
  if (!incoming || outgoing.amount >= 0 || incoming.amount <= 0
    || outgoing.linked_transaction_id !== incoming.id || incoming.linked_transaction_id !== outgoing.id
    || outgoing.status !== 'pending' || incoming.status !== 'pending'
    || outgoing.pending_kind !== 'mcp_review' || incoming.pending_kind !== 'mcp_review'
    || outgoing.review_source !== 'chatgpt_mcp' || incoming.review_source !== 'chatgpt_mcp'
    || !outgoing.review_batch_id || outgoing.review_batch_id !== incoming.review_batch_id
    || outgoing.account_id === incoming.account_id || outgoing.date !== incoming.date
    || outgoing.description !== incoming.description
    || outgoing.category_id != null || incoming.category_id != null
    || Boolean(outgoing.exclude_from_estimate) || Boolean(incoming.exclude_from_estimate)
    || !CASH_TYPES.has(outgoing.account_type) || !CASH_TYPES.has(incoming.account_type)
    || (outgoing.account_currency.toUpperCase() === incoming.account_currency.toUpperCase()
      && outgoing.amount + incoming.amount !== 0)) {
    throw new Error('[transfer_unavailable] Transfer review pair is incomplete or invalid')
  }
  const rate = incoming.amount / -outgoing.amount
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('[transfer_unavailable] Transfer review rate is invalid')
  return {
    id: outgoing.id, type: 'transfer', outgoing_id: outgoing.id, incoming_id: incoming.id,
    from_account_id: outgoing.account_id, from_account_name: outgoing.account_name, from_currency: outgoing.account_currency,
    to_account_id: incoming.account_id, to_account_name: incoming.account_name, to_currency: incoming.account_currency,
    debit_amount: outgoing.amount, credit_amount: incoming.amount,
    effective_fx_rate: Number(rate.toPrecision(10)), date: outgoing.date,
    description: outgoing.description ?? null, status: 'pending', pending_kind: 'mcp_review',
    review_source: 'chatgpt_mcp', review_batch_id: outgoing.review_batch_id,
    review_flags: flags(outgoing.review_flags), created_at: outgoing.created_at ?? null,
    updated_at: outgoing.updated_at ?? null,
    accounts_locked: Boolean(outgoing.account_locked || incoming.account_locked),
    description_is_untrusted_data: true,
  }
}

export class TransferReviewCorrectionService {
  constructor(private env: Env) {}

  private async row(id: string) {
    return this.env.DB.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first<TransferReviewRow>()
  }

  private async pair(id: string) {
    const selected = await this.row(id)
    if (!selected?.linked_transaction_id) throw new Error('[transfer_unavailable] Target is not a linked MCP transfer review')
    const other = await this.row(selected.linked_transaction_id)
    const outgoing = selected.amount < 0 ? selected : other
    const incoming = selected.amount < 0 ? other : selected
    if (!outgoing) throw new Error('[transfer_unavailable] Transfer review pair is incomplete')
    const current = transferReviewView(outgoing, incoming)
    return { outgoing, incoming: incoming!, current }
  }

  private async account(id: string) {
    const account = await this.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<AccountRow>()
    if (!account) throw new Error(`account_id ${id} does not identify an existing account`)
    if (!CASH_TYPES.has(account.type)) throw new Error(`account_id ${id} must identify a cash account`)
    if (account.is_locked === 1 || account.is_locked === true) throw new Error(`account_id ${id} identifies a locked account`)
    return account
  }

  async prepare(args: Record<string, unknown>) {
    const operations = args.operations as Operation[]
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 20) throw new Error('operations must contain 1–20 transfers')
    const seen = new Set<string>()
    const items: StoredItem[] = []
    for (const [index, operation] of operations.entries()) {
      const id = uuid(operation.transfer_id, `operations[${index}].transfer_id`)
      const { outgoing, incoming, current: before } = await this.pair(id)
      if (seen.has(outgoing.id)) throw new Error(`operations[${index}].transfer_id repeats a transfer pair`)
      seen.add(outgoing.id)
      if (before.accounts_locked) throw new Error(`operations[${index}] targets a locked account`)
      let after: TransferView
      if (operation.action === 'edit') {
        const changes = operation.changes || {}
        if (!Object.keys(changes).length) throw new Error(`operations[${index}].changes must contain an edit`)
        const fromId = changes.from_account_id ?? before.from_account_id
        const toId = changes.to_account_id ?? before.to_account_id
        if (fromId === toId) throw new Error(`operations[${index}] source and destination accounts must differ`)
        if ((fromId !== before.from_account_id || toId !== before.to_account_id)
          && (changes.amount === undefined || changes.amount_to === undefined)) {
          throw new Error(`operations[${index}] account changes require both explicit amounts`)
        }
        const sent = amount(changes.amount ?? -before.debit_amount, `operations[${index}].amount`)
        const received = amount(changes.amount_to ?? before.credit_amount, `operations[${index}].amount_to`)
        const [source, destination] = await Promise.all([this.account(fromId), this.account(toId)])
        if (source.currency.toUpperCase() === destination.currency.toUpperCase() && sent !== received) {
          throw new Error(`operations[${index}] same-currency transfer amounts must match`)
        }
        const description = changes.description === undefined ? before.description : changes.description?.trim() || null
        if (description && description.length > 500) throw new Error(`operations[${index}].description is too long`)
        const date = assertDate(changes.date ?? before.date, `operations[${index}].date`)
        const rate = received / sent
        if (!Number.isFinite(rate) || rate <= 0) throw new Error(`operations[${index}] effective rate is invalid`)
        after = { ...before, from_account_id: fromId, from_account_name: source.name, from_currency: source.currency,
          to_account_id: toId, to_account_name: destination.name, to_currency: destination.currency,
          debit_amount: -sent, credit_amount: received, effective_fx_rate: Number(rate.toPrecision(10)),
          date, description, accounts_locked: false }
      } else if (operation.action === 'decline') {
        if (operation.changes !== undefined) throw new Error(`operations[${index}].changes is not allowed for decline`)
        after = { ...before, status: 'cancelled' }
      } else throw new Error(`operations[${index}].action is invalid`)
      items.push({ action: operation.action, before, after,
        snapshots: { outgoing: rowSnapshot(outgoing), incoming: rowSnapshot(incoming) } })
    }
    const proposalId = crypto.randomUUID()
    const createdAt = Date.now()
    const expiresAt = createdAt + LIFETIME_MS
    const hash = await sha256(JSON.stringify(items))
    await this.env.DB.prepare('INSERT INTO mcp_transfer_correction_proposals (id, proposal_hash, items_json, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .bind(proposalId, hash, JSON.stringify(items), createdAt, expiresAt).run()
    return { as_of: new Date().toISOString(), proposal_id: proposalId, expires_at: new Date(expiresAt).toISOString(),
      item_count: items.length, preview: items.map(({ action, before, after }) => ({ action, before, after })),
      confirmation_required: true,
      next_action: 'Show both native amounts and accounts for every before/after transfer pair. Only after explicit user confirmation call apply_mcp_transfer_corrections with proposal_id.',
      effect: 'Preparation stores an expiring proposal only. No transfer leg, balance, or projection changed.' }
  }

  private parseItems(proposal: Proposal): StoredItem[] {
    let items: StoredItem[]
    try { items = JSON.parse(proposal.items_json) as StoredItem[] } catch { throw new Error('[proposal_corrupt] Stored transfer proposal is invalid') }
    if (!Array.isArray(items) || items.length < 1 || items.length > 20 || items.some(item =>
      !item?.before?.outgoing_id || !item.after?.incoming_id || !item.snapshots?.outgoing || !item.snapshots.incoming
      || !['edit', 'decline'].includes(item.action))) {
      throw new Error('[proposal_corrupt] Stored transfer proposal is invalid')
    }
    return items
  }

  private result(items: StoredItem[], replay: boolean, appliedAt: number) {
    return { as_of: new Date().toISOString(), result: 'mcp_transfer_reviews_corrected', item_count: items.length,
      idempotent_replay: replay,
      transfers: items.map(item => ({ action: item.action, ...item.after,
        updated_at: Math.max(appliedAt, (item.snapshots.outgoing.updated_at ?? 0) + 1, (item.snapshots.incoming.updated_at ?? 0) + 1) })),
      effect: 'Only linked pending MCP transfer reviews changed. No balance, posted transaction, or upcoming projection changed.' }
  }

  async apply(args: Record<string, unknown>) {
    const id = uuid(args.proposal_id, 'proposal_id')
    const proposal = await this.env.DB.prepare('SELECT * FROM mcp_transfer_correction_proposals WHERE id = ?').bind(id).first<Proposal>()
    if (!proposal) throw new Error('[proposal_not_found] proposal_id was not found')
    const items = this.parseItems(proposal)
    if (await sha256(JSON.stringify(items)) !== proposal.proposal_hash) throw new Error('[proposal_corrupt] Stored transfer proposal checksum does not match')
    const run = await this.env.DB.prepare('SELECT proposal_hash, created_at FROM mcp_transfer_correction_runs WHERE id = ?').bind(id).first<{ proposal_hash: string; created_at: number }>()
    if (run) {
      if (run.proposal_hash !== proposal.proposal_hash) throw new Error('[proposal_corrupt] Completed transfer correction conflicts with proposal')
      return this.result(items, true, run.created_at)
    }
    if (proposal.consumed_at !== null) throw new Error('[proposal_already_consumed] Transfer proposal was already consumed')
    if (Date.now() >= proposal.expires_at) throw new Error('[proposal_expired] Prepare a fresh transfer preview and confirm again')
    for (const item of items) {
      let pair: Awaited<ReturnType<typeof this.pair>>
      try { pair = await this.pair(item.before.outgoing_id) } catch { throw new Error(STALE) }
      if (JSON.stringify(rowSnapshot(pair.outgoing)) !== JSON.stringify(item.snapshots.outgoing)
        || JSON.stringify(rowSnapshot(pair.incoming)) !== JSON.stringify(item.snapshots.incoming)
        || JSON.stringify(pair.current) !== JSON.stringify(item.before) || pair.current.accounts_locked) throw new Error(STALE)
      if (item.action === 'edit') {
        try {
          const [source, destination] = await Promise.all([
            this.account(item.after.from_account_id), this.account(item.after.to_account_id),
          ])
          if (source.name !== item.after.from_account_name || source.currency !== item.after.from_currency
            || destination.name !== item.after.to_account_name || destination.currency !== item.after.to_currency) throw new Error()
        } catch { throw new Error(STALE) }
      }
    }
    const now = Date.now()
    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare('UPDATE mcp_transfer_correction_proposals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, id),
      this.env.DB.prepare('INSERT INTO mcp_transfer_correction_runs (id, proposal_hash, created_at) VALUES (?, ?, ?)').bind(id, proposal.proposal_hash, now),
    ]
    for (const item of items) {
      const s = item.snapshots
      const after = item.after
      const guard = `SELECT {leg}.id FROM transactions debit JOIN transactions credit ON credit.id = debit.linked_transaction_id
        JOIN accounts source ON source.id = debit.account_id JOIN accounts destination ON destination.id = credit.account_id
        JOIN accounts new_source ON new_source.id = ? JOIN accounts new_destination ON new_destination.id = ?
        WHERE debit.id = ? AND credit.id = ? AND credit.linked_transaction_id = debit.id
        AND debit.status = 'pending' AND credit.status = 'pending'
        AND debit.pending_kind = 'mcp_review' AND credit.pending_kind = 'mcp_review'
        AND debit.review_source = 'chatgpt_mcp' AND credit.review_source = 'chatgpt_mcp'
        AND debit.review_batch_id = ? AND credit.review_batch_id = ?
        AND debit.account_id = ? AND credit.account_id = ? AND debit.amount = ? AND credit.amount = ?
        AND debit.date = ? AND credit.date = ? AND debit.description IS ? AND credit.description IS ?
        AND debit.updated_at IS ? AND credit.updated_at IS ?
        AND source.currency = ? AND destination.currency = ?
        AND source.type IN ('cash', 'checking', 'savings') AND destination.type IN ('cash', 'checking', 'savings')
        AND new_source.currency = ? AND new_destination.currency = ?
        AND new_source.type IN ('cash', 'checking', 'savings') AND new_destination.type IN ('cash', 'checking', 'savings')
        AND COALESCE(source.is_locked, 0) = 0 AND COALESCE(destination.is_locked, 0) = 0
        AND COALESCE(new_source.is_locked, 0) = 0 AND COALESCE(new_destination.is_locked, 0) = 0
        AND new_source.id != new_destination.id
        AND (UPPER(new_source.currency) != UPPER(new_destination.currency) OR ? = ?)`
      const guardValues = [after.from_account_id, after.to_account_id, s.outgoing.id, s.incoming.id,
        s.outgoing.review_batch_id, s.incoming.review_batch_id,
        s.outgoing.account_id, s.incoming.account_id, s.outgoing.amount, s.incoming.amount,
        s.outgoing.date, s.incoming.date, s.outgoing.description, s.incoming.description,
        s.outgoing.updated_at, s.incoming.updated_at,
        s.outgoing.account_currency, s.incoming.account_currency,
        after.from_currency, after.to_currency,
        -after.debit_amount, after.credit_amount]
      for (const leg of ['debit', 'credit'] as const) {
        statements.push(this.env.DB.prepare(`INSERT INTO audit_log (id, action, entity, entity_id, details, created_at)
          VALUES (?, ?, 'transaction', (${guard.replace('{leg}', leg)}), ?, ?)`)
          .bind(crypto.randomUUID(), item.action === 'edit' ? 'UPDATE' : 'DECLINE', ...guardValues,
            JSON.stringify({ origin: 'chatgpt_mcp', proposal_id: id, transfer_pair_id: after.outgoing_id, action: item.action }), now))
      }
      const updatedAt = Math.max(now, (s.outgoing.updated_at ?? 0) + 1, (s.incoming.updated_at ?? 0) + 1)
      if (item.action === 'edit') {
        statements.push(this.env.DB.prepare(`UPDATE transactions SET
          account_id = CASE id WHEN ? THEN ? ELSE ? END,
          amount = CASE id WHEN ? THEN ? ELSE ? END,
          description = ?, date = ?, updated_at = ? WHERE id IN (?, ?)`)
          .bind(after.outgoing_id, after.from_account_id, after.to_account_id,
            after.outgoing_id, after.debit_amount, after.credit_amount,
            after.description, after.date, updatedAt, after.outgoing_id, after.incoming_id))
      } else {
        statements.push(this.env.DB.prepare("UPDATE transactions SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id IN (?, ?)")
          .bind(now, updatedAt, after.outgoing_id, after.incoming_id))
      }
    }
    try { await this.env.DB.batch(statements) } catch (error) {
      const raced = await this.env.DB.prepare('SELECT proposal_hash, created_at FROM mcp_transfer_correction_runs WHERE id = ?').bind(id).first<{ proposal_hash: string; created_at: number }>()
      if (raced?.proposal_hash === proposal.proposal_hash) return this.result(items, true, raced.created_at)
      const message = error instanceof Error ? error.message : String(error)
      if (/NOT NULL constraint failed: audit_log.entity_id/i.test(message)) throw new Error(STALE)
      throw error
    }
    return this.result(items, false, now)
  }
}
