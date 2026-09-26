import type { AccountRow, Env, StoredReviewDraftProposal, TransactionRow } from './types'
import { assertDate } from './validation'
import { sha256 } from './financial-outlook'

type TransferInput = { from_account_id: string; to_account_id: string; amount: number; amount_to?: number | null; date: string; description?: string | null }
type Transfer = { outgoing_id: string; incoming_id: string; from_account_id: string; to_account_id: string; amount: number; amount_to?: number | null; from_currency?: string; to_currency?: string; date: string; description: string | null; warnings: string[] }
type Batch = { id: string; proposal_hash: string }

const lifetime = 24 * 60 * 60_000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class TransferDraftService {
  constructor(private env: Env) {}

  private async accounts(items: Transfer[]) {
    const rows = (await this.env.DB.prepare('SELECT * FROM accounts ORDER BY name').all<AccountRow>()).results
    const accounts = new Map(rows.map(row => [row.id, row]))
    items.forEach((item, index) => {
      const from = accounts.get(item.from_account_id)
      const to = accounts.get(item.to_account_id)
      if (!from || !to) throw new Error(`items[${index}] references a missing account`)
      if (from.id === to.id) throw new Error(`items[${index}] source and destination must differ`)
      if (!['cash', 'checking', 'savings'].includes(from.type) || !['cash', 'checking', 'savings'].includes(to.type)) throw new Error(`items[${index}] requires two cash accounts`)
      if (from.is_locked || to.is_locked) throw new Error(`items[${index}] references a locked account`)
      if ((item.from_currency && item.from_currency.toUpperCase() !== from.currency.toUpperCase())
        || (item.to_currency && item.to_currency.toUpperCase() !== to.currency.toUpperCase())) {
        throw new Error(`items[${index}] account currency changed since preview; prepare a fresh transfer preview`)
      }
      if (from.currency.toUpperCase() !== to.currency.toUpperCase() && item.amount_to == null) throw new Error(`items[${index}].amount_to is required when account currencies differ`)
      if (from.currency.toUpperCase() === to.currency.toUpperCase() && item.amount_to != null && item.amount_to !== item.amount) {
        throw new Error(`items[${index}].amount_to must equal amount for same-currency transfers`)
      }
      const rate = (item.amount_to ?? item.amount) / item.amount
      if (!Number.isFinite(rate) || rate <= 0) throw new Error(`items[${index}] amounts produce an invalid effective exchange rate`)
    })
    return accounts
  }

  private parse(itemsJson: string): Transfer[] {
    let items: Transfer[]
    try { items = JSON.parse(itemsJson) as Transfer[] }
    catch { throw new Error('[proposal_corrupt] stored transfer proposal is invalid') }
    if (!Array.isArray(items) || items.length < 1 || items.length > 20 || items.some(item =>
      !item || !uuid.test(item.outgoing_id) || !uuid.test(item.incoming_id) || item.outgoing_id === item.incoming_id
      || !item.from_account_id || !item.to_account_id || typeof item.amount !== 'number' || !Number.isFinite(item.amount)
      || item.amount <= 0 || item.amount > 1_000_000_000_000_000
      || (item.amount_to != null && (typeof item.amount_to !== 'number' || !Number.isFinite(item.amount_to)
        || item.amount_to <= 0 || item.amount_to > 1_000_000_000_000_000)) || !Array.isArray(item.warnings)
      || (item.from_currency !== undefined && (typeof item.from_currency !== 'string' || !item.from_currency))
      || (item.to_currency !== undefined && (typeof item.to_currency !== 'string' || !item.to_currency))
      || (item.from_currency === undefined) !== (item.to_currency === undefined)
      || (item.description !== null && (typeof item.description !== 'string' || item.description.length > 500))
    )) throw new Error('[proposal_corrupt] stored transfer proposal is invalid')
    items.forEach(item => { try { assertDate(item.date, 'transfer date') } catch { throw new Error('[proposal_corrupt] stored transfer date is invalid') } })
    return items
  }

  async prepare(args: Record<string, unknown>) {
    const inputs = args.items as TransferInput[]
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 20) throw new Error('items must contain 1 to 20 transfers')
    const items = inputs.map((input, index): Transfer => {
      if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000_000_000) throw new Error(`items[${index}].amount must be positive and finite`)
      if (input.amount_to != null && (!Number.isFinite(input.amount_to) || input.amount_to <= 0 || input.amount_to > 1_000_000_000_000_000)) {
        throw new Error(`items[${index}].amount_to must be positive and finite`)
      }
      const description = typeof input.description === 'string' ? input.description.trim() || null : null
      if (description && description.length > 500) throw new Error(`items[${index}].description is too long`)
      return { outgoing_id: crypto.randomUUID(), incoming_id: crypto.randomUUID(), from_account_id: input.from_account_id.trim(), to_account_id: input.to_account_id.trim(), amount: input.amount, amount_to: input.amount_to ?? null, date: assertDate(input.date, `items[${index}].date`), description, warnings: [] }
    })
    const accounts = await this.accounts(items)
    items.forEach(item => {
      item.from_currency = accounts.get(item.from_account_id)!.currency.toUpperCase()
      item.to_currency = accounts.get(item.to_account_id)!.currency.toUpperCase()
    })
    const warnings: string[] = []
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      const matches = (await this.env.DB.prepare(
        "SELECT debit.id FROM transactions debit JOIN transactions credit ON credit.id = debit.linked_transaction_id WHERE debit.account_id = ? AND credit.account_id = ? AND ABS(debit.amount + ?) < 0.000000001 AND ABS(credit.amount - ?) < 0.000000001 AND debit.date >= date(?, '-3 days') AND debit.date <= date(?, '+3 days') AND debit.status != 'cancelled' LIMIT 1"
      ).bind(item.from_account_id, item.to_account_id, item.amount, item.amount_to ?? item.amount, item.date, item.date).all<TransactionRow>()).results
      if (matches.length || items.some((other, otherIndex) => otherIndex !== index && other.from_account_id === item.from_account_id && other.to_account_id === item.to_account_id && other.amount === item.amount && (other.amount_to ?? other.amount) === (item.amount_to ?? item.amount) && other.date === item.date)) {
        item.warnings.push('possible_duplicate')
        warnings.push(`Transfer ${index + 1} may duplicate another transfer; review before confirming.`)
      }
    }
    const proposalId = crypto.randomUUID()
    const now = Date.now()
    const hash = await sha256(JSON.stringify(items))
    await this.env.DB.prepare('INSERT INTO mcp_draft_proposals (id, proposal_hash, items_json, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .bind(proposalId, hash, JSON.stringify(items), now, now + lifetime).run()
    return { as_of: new Date().toISOString(), proposal_id: proposalId, expires_at: new Date(now + lifetime).toISOString(), item_count: items.length,
      preview: items.map((item, index) => ({ item_number: index + 1, from_account_id: item.from_account_id, from_account_name: accounts.get(item.from_account_id)!.name,
        to_account_id: item.to_account_id, to_account_name: accounts.get(item.to_account_id)!.name, debit_amount: -item.amount, credit_amount: item.amount_to ?? item.amount,
        from_currency: item.from_currency!, to_currency: item.to_currency!,
        effective_fx_rate: Number(((item.amount_to ?? item.amount) / item.amount).toPrecision(10)), date: item.date, description: item.description, warnings: item.warnings })),
      warnings, confirmation_required: true, next_action: 'Show every transfer and warning. After explicit confirmation of the entire preview, call create_mcp_transfer_drafts with proposal_id only.',
      effect: 'Preparation stores an expiring proposal. Creation makes linked review drafts with no balance change.' }
  }

  private async result(proposalId: string, replay: boolean) {
    const proposal = await this.env.DB.prepare('SELECT * FROM mcp_draft_proposals WHERE id = ?').bind(proposalId).first<StoredReviewDraftProposal>()
    if (!proposal) throw new Error('[proposal_corrupt] transfer proposal is missing')
    const items = this.parse(proposal.items_json)
    if (await sha256(JSON.stringify(items)) !== proposal.proposal_hash) throw new Error('[proposal_corrupt] proposal checksum differs')
    const byOutgoingId = new Map(items.map(item => [item.outgoing_id, item]))
    const rows = (await this.env.DB.prepare("SELECT t.*, a.name AS account_name, a.currency AS currency FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.review_batch_id = ? AND t.pending_kind = 'mcp_review' AND t.linked_transaction_id IS NOT NULL ORDER BY t.rowid")
      .bind(proposalId).all<TransactionRow & { account_name: string; currency: string }>()).results
    const byId = new Map(rows.map(row => [row.id, row]))
    if (rows.length !== items.length * 2 || rows.some(row => {
      const pair = byId.get(row.linked_transaction_id || '')
      const snapshot = row.amount < 0 ? byOutgoingId.get(row.id) : byOutgoingId.get(pair?.id || '')
      const sameCurrency = snapshot?.from_currency && snapshot?.to_currency
        ? snapshot.from_currency.toUpperCase() === snapshot.to_currency.toUpperCase() : pair?.currency.toUpperCase() === row.currency.toUpperCase()
      return !pair || pair.linked_transaction_id !== row.id || pair.review_batch_id !== row.review_batch_id
        || !snapshot || (sameCurrency && pair.amount + row.amount !== 0)
        || !Number.isFinite(pair.amount) || !Number.isFinite(row.amount) || pair.amount * row.amount >= 0
        || pair.date !== row.date || pair.account_id === row.account_id
        || pair.status !== row.status || pair.review_source !== 'chatgpt_mcp' || row.review_source !== 'chatgpt_mcp'
    })) throw new Error('[proposal_corrupt] stored transfer pair is invalid')
    const drafts = rows.filter(row => row.amount < 0).map(outgoing => {
      const incoming = byId.get(outgoing.linked_transaction_id!)!
      const snapshot = byOutgoingId.get(outgoing.id)!
      return { outgoing_id: outgoing.id, incoming_id: incoming.id, from_account_id: outgoing.account_id, from_account_name: outgoing.account_name,
        to_account_id: incoming.account_id, to_account_name: incoming.account_name, debit_amount: outgoing.amount, credit_amount: incoming.amount,
        from_currency: snapshot.from_currency || outgoing.currency.toUpperCase(), to_currency: snapshot.to_currency || incoming.currency.toUpperCase(),
        effective_fx_rate: Number((incoming.amount / -outgoing.amount).toPrecision(10)), date: outgoing.date, description: outgoing.description || null, status: outgoing.status,
        pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: proposalId,
        review_flags: JSON.parse(outgoing.review_flags || '[]') as string[] }
    })
    return { as_of: new Date().toISOString(), batch_id: proposalId, item_count: drafts.length, idempotent_replay: replay,
      result: 'mcp_transfer_review_drafts_created', drafts, effect: 'Creation did not change balances or post transfers; status reflects any later app review.',
      next_action: 'Review and confirm or decline each transfer pair in Finance Manager MCP Review.' }
  }

  async create(args: Record<string, unknown>) {
    const id = args.proposal_id as string
    if (!uuid.test(id)) throw new Error('[invalid_proposal_id] proposal_id is invalid')
    const proposal = await this.env.DB.prepare('SELECT * FROM mcp_draft_proposals WHERE id = ?').bind(id).first<StoredReviewDraftProposal>()
    if (!proposal) throw new Error('[proposal_not_found] proposal_id was not found')
    const existing = await this.env.DB.prepare('SELECT id, proposal_hash FROM mcp_draft_batches WHERE id = ?').bind(id).first<Batch>()
    if (existing) {
      if (existing.proposal_hash !== proposal.proposal_hash) throw new Error('[proposal_corrupt] batch checksum differs')
      const replay = await this.result(id, true)
      return replay
    }
    if (proposal.consumed_at !== null) throw new Error('[proposal_already_consumed] proposal was consumed')
    if (Date.now() >= proposal.expires_at) throw new Error('[proposal_expired] prepare a fresh transfer preview')
    const items = this.parse(proposal.items_json)
    if (await sha256(JSON.stringify(items)) !== proposal.proposal_hash) throw new Error('[proposal_corrupt] proposal checksum differs')
    await this.accounts(items)
    const now = Date.now()
    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare('UPDATE mcp_draft_proposals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, id),
      this.env.DB.prepare('INSERT INTO mcp_draft_batches (id, proposal_hash, created_at) VALUES (?, ?, ?)').bind(id, proposal.proposal_hash, now),
    ]
    for (const item of items) {
      for (const [rowId, accountId, amount, linkedId] of [
        [item.outgoing_id, item.from_account_id, -item.amount, item.incoming_id],
        [item.incoming_id, item.to_account_id, item.amount_to ?? item.amount, item.outgoing_id],
      ] as const) {
        statements.push(this.env.DB.prepare("INSERT INTO transactions (id, account_id, category_id, amount, description, date, linked_transaction_id, exclude_from_estimate, status, confirmed_at, cancelled_at, created_at, updated_at, pending_kind, review_source, review_batch_id, review_flags) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 'pending', NULL, NULL, ?, ?, 'mcp_review', 'chatgpt_mcp', ?, ?)")
          .bind(rowId, accountId, amount, item.description, item.date, linkedId, now, now, id, JSON.stringify(item.warnings)))
        statements.push(this.env.DB.prepare("INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) VALUES (?, 'CREATE', 'transaction', ?, ?, ?)")
          .bind(crypto.randomUUID(), rowId, JSON.stringify({ origin: 'chatgpt_mcp', batch_id: id, transfer_pair_id: item.outgoing_id }), now))
      }
    }
    try { await this.env.DB.batch(statements) }
    catch (error) {
      const raced = await this.env.DB.prepare('SELECT id, proposal_hash FROM mcp_draft_batches WHERE id = ?').bind(id).first<Batch>()
      if (!raced || raced.proposal_hash !== proposal.proposal_hash) throw error
      return this.result(id, true)
    }
    return this.result(id, false)
  }
}
