import { MCP_WORKER_VERSION, type AccountRow, type CanonicalReviewDraft, type CategoryRow, type Env, type InvestmentTransactionRow, type RecurringScheduleRow, type ReviewDraftInput, type StoredReviewDraftProposal, type TransactionRow } from './types'
import { addUtcDays, daysBetween, periodEndDates, recurringDates } from './date-series'
import { assertDate, assertDateRange, clampLimit, decodeCursor, defaultMonthRange, encodeCursor, enumValue, optionalDate, previousRange, stringArray } from './validation'
import { FinancialOutlookSnapshotRow, parseFinancialOutlookInput, parseSnapshot, sha256 } from './financial-outlook'
import { summarizeForecastHistory, type ForecastTransaction } from './forecast-evidence'
import { ReviewCorrectionService } from './review-corrections'

type Rates = { values: Record<string, number>; available: boolean }
type LiveQuote = { price: number; currency: string; marketState: string | null }
type DuplicateCandidate = Pick<TransactionRow, 'id' | 'date' | 'amount' | 'description' | 'status' | 'pending_kind'>
type ReviewDraftResultRow = TransactionRow & {
  account_name: string
  account_currency: string
  category_name?: string | null
  category_type?: 'income' | 'expense' | null
}

type FinancialDataRevision = { revision: number; updated_at: number }

const MCP_PROPOSAL_LIFETIME_MS = 24 * 60 * 60_000

type McpProposalErrorCode =
  | 'invalid_proposal_id'
  | 'proposal_not_found'
  | 'proposal_expired'
  | 'proposal_already_consumed'
  | 'proposal_corrupt'

class McpProposalError extends Error {
  constructor(readonly code: McpProposalErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'McpProposalError'
  }
}

function proposalLog(action: 'prepare' | 'create', proposalId: string | null, outcome: 'success' | 'error' | 'idempotent_replay', errorCode?: string) {
  console.log(JSON.stringify({
    event: `mcp.review_draft_${action}`,
    proposal_id: proposalId,
    worker_version: MCP_WORKER_VERSION,
    outcome,
    error_code: errorCode || null,
  }))
}

function proposalError(code: McpProposalErrorCode, message: string) {
  return new McpProposalError(code, message)
}

type OutlookCoverage = {
  sources: string[]
  history: { start_date: string | null; end_date: string | null; days: number }
  latest_posted_transaction_date: string | null
  conversion_status: 'complete' | 'partial'
  portfolio_valuation_status: string
  data_quality_reasons: string[]
  data_quality_score: number
  data_quality_label: 'high' | 'moderate' | 'limited'
}

type OutlookCoverageInputs = {
  dimensions: {
    available_date_range: { start_date: string | null; end_date: string | null }
    accounts: Array<{ type: string }>
  }
  summary: { conversion_status: string }
  portfolio: { valuation_status: string }
}

function bool(value: number | boolean | undefined) {
  return value === true || value === 1
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export class FinanceService {
  constructor(private env: Env) {}

  listReviewDrafts(args: Record<string, unknown>) { return new ReviewCorrectionService(this.env).list(args) }
  prepareReviewCorrections(args: Record<string, unknown>) { return new ReviewCorrectionService(this.env).prepare(args) }
  applyReviewCorrections(args: Record<string, unknown>) { return new ReviewCorrectionService(this.env).apply(args) }

  private async accounts() {
    return (await this.env.DB.prepare('SELECT * FROM accounts ORDER BY name').all<AccountRow>()).results
  }

  private async categories() {
    return (await this.env.DB.prepare('SELECT * FROM categories ORDER BY type, name').all<CategoryRow>()).results
  }

  private async rates(currency: string): Promise<Rates> {
    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(currency)}`)
      if (!response.ok) return { values: {}, available: false }
      const body = await response.json<{ result?: string; rates?: Record<string, number> }>()
      return body.result === 'success' && body.rates ? { values: body.rates, available: true } : { values: {}, available: false }
    } catch {
      return { values: {}, available: false }
    }
  }

  private convert(amount: number, source: string, target: string, rates: Rates) {
    if (source === target) return amount
    const rate = rates.values[source]
    return rate ? amount / rate : 0
  }

  private async liveQuote(symbol: string): Promise<LiveQuote | null> {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8_000),
      })
      const data = await response.json<any>()
      const meta = data?.chart?.result?.[0]?.meta
      if (!response.ok || !Number.isFinite(meta?.regularMarketPrice)) return null
      return { price: meta.regularMarketPrice, currency: String(meta.currency || 'USD'), marketState: meta.marketState || null }
    } catch {
      return null
    }
  }

  private async liveQuotes(accounts: AccountRow[]) {
    const quotes = new Map<string, LiveQuote | null>()
    let next = 0
    const worker = async () => {
      while (next < accounts.length) {
        const account = accounts[next++]
        quotes.set(account.id, await this.liveQuote(account.symbol!))
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, accounts.length) }, worker))
    return quotes
  }

  private conversionWarnings(accounts: AccountRow[], target: string, rates: Rates) {
    const missing = [...new Set(accounts.map(account => account.currency).filter(source => source !== target && !rates.values[source]))]
    if (!rates.available) return ['Exchange rates are unavailable; non-target-currency amounts were excluded from converted totals']
    return missing.map(source => `Exchange rate unavailable for ${source}; those amounts were excluded from ${target} totals`)
  }

  private async postedBetween(startDate: string, endDate: string) {
    return (await this.env.DB.prepare(
      "SELECT * FROM transactions WHERE status = 'posted' AND date >= ? AND date <= ? ORDER BY date ASC, rowid ASC"
    ).bind(startDate, endDate).all<TransactionRow>()).results
  }

  private async postedAfter(startDate: string) {
    return (await this.env.DB.prepare(
      "SELECT * FROM transactions WHERE status = 'posted' AND date > ? ORDER BY date ASC, rowid ASC"
    ).bind(startDate).all<TransactionRow>()).results
  }

  private async financialDataRevision() {
    const revision = await this.env.DB.prepare('SELECT revision, updated_at FROM financial_data_revision WHERE id = 1').first<FinancialDataRevision>()
    if (!revision) throw new Error('Financial data revision is unavailable; apply the latest Finance Manager migration')
    return revision
  }

  private async recentOutlookRows() {
    return (await this.env.DB.prepare('SELECT * FROM financial_outlook_snapshots ORDER BY created_at DESC, id DESC LIMIT 5').all<FinancialOutlookSnapshotRow>()).results
  }

  private async forecastHistory(startDate: string, endDate: string) {
    const [accounts, categories, transactions, rates] = await Promise.all([
      this.accounts(), this.categories(), this.postedBetween(startDate, endDate), this.rates('HUF'),
    ])
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const warnings = this.conversionWarnings(accounts.filter(account => account.type !== 'investment' && !bool(account.exclude_from_cash_balance)), 'HUF', rates)
    const rows: ForecastTransaction[] = []
    for (const transaction of transactions) {
      const account = accountMap.get(transaction.account_id)
      if (!account || account.type === 'investment' || bool(account.exclude_from_cash_balance) || transaction.linked_transaction_id) continue
      if (account.currency !== 'HUF' && !rates.values[account.currency]) continue
      rows.push({
        date: transaction.date,
        amount: round(this.convert(transaction.amount, account.currency, 'HUF', rates)),
        description: transaction.description || null,
        account_name: account.name,
        category_name: transaction.category_id ? categoryMap.get(transaction.category_id)?.name || null : null,
      })
    }
    return { ...summarizeForecastHistory(rows, startDate, endDate), conversion_status: warnings.length ? 'partial' : 'complete', warnings }
  }

  private outlookStatus(row: FinancialOutlookSnapshotRow | null, revision: FinancialDataRevision, now = Date.now()) {
    if (!row) {
      return {
        exists: false,
        freshness: 'historical' as const,
        data_changed: false,
        age_days: null,
        active_horizons: [] as number[],
        expired_horizons: [] as number[],
        regeneration_recommended: true,
      }
    }
    const ageDays = Math.max(0, Math.floor((now - Date.parse(row.source_queried_at)) / 86_400_000))
    const activeHorizons = [7, 30, 90].filter(days => ageDays < days)
    const expiredHorizons = [7, 30, 90].filter(days => ageDays >= days)
    const dataChanged = row.source_revision !== revision.revision
    const freshness = activeHorizons.length === 0
      ? 'historical'
      : expiredHorizons.length > 0
        ? 'partially_expired'
        : dataChanged
          ? 'data_changed'
          : ageDays >= 4
            ? 'refresh_recommended'
            : 'up_to_date'
    return {
      exists: true,
      snapshot_id: row.id,
      created_at: new Date(row.created_at).toISOString(),
      source_revision: row.source_revision,
      freshness,
      data_changed: dataChanged,
      age_days: ageDays,
      active_horizons: activeHorizons,
      expired_horizons: expiredHorizons,
      regeneration_recommended: dataChanged || ageDays >= 4 || expiredHorizons.length > 0,
    }
  }

  private computeOutlookCoverage({ dimensions, summary, portfolio }: OutlookCoverageInputs): OutlookCoverage {
    const start = dimensions.available_date_range.start_date
    const end = dimensions.available_date_range.end_date
    const historyDays = start && end ? Math.max(0, daysBetween(start, end)) : 0
    const latestAge = end ? Math.max(0, Math.floor((Date.now() - Date.parse(`${end}T00:00:00Z`)) / 86_400_000)) : 999
    const hasInvestment = dimensions.accounts.some(account => account.type === 'investment')
    const historyScore = Math.min(40, Math.round((Math.min(historyDays, 180) / 180) * 40))
    const recencyScore = latestAge <= 7 ? 35 : latestAge <= 30 ? 20 : 0
    const conversionScore = summary.conversion_status === 'complete' ? 15 : 5
    const valuationScore = !hasInvestment || portfolio.valuation_status === 'complete' ? 10 : 0
    const score = historyScore + recencyScore + conversionScore + valuationScore
    const label = score >= 80 ? 'high' : score >= 50 ? 'moderate' : 'limited'
    const reasons = [
      historyDays ? `${historyDays} days of posted transaction history are available` : 'No posted transaction history is available',
      latestAge <= 7 ? 'Ledger activity is recent' : latestAge <= 30 ? 'Ledger activity is older than one week' : 'Ledger activity is more than 30 days old',
      summary.conversion_status === 'complete' ? 'HUF conversion coverage is complete' : 'Some non-HUF amounts are excluded from HUF totals',
      !hasInvestment ? 'No market-priced investments require valuation' : portfolio.valuation_status === 'complete' ? 'Investment valuation coverage is complete' : 'Investment valuation coverage is incomplete',
    ]
    return {
      sources: ['accounts', 'posted_transactions', 'recurring_schedules', 'upcoming_transactions', 'portfolio'],
      history: { start_date: start, end_date: end, days: historyDays },
      latest_posted_transaction_date: end,
      conversion_status: summary.conversion_status === 'complete' ? 'complete' : 'partial',
      portfolio_valuation_status: portfolio.valuation_status,
      data_quality_reasons: reasons,
      data_quality_score: score,
      data_quality_label: label,
    } satisfies OutlookCoverage
  }

  private async outlookCoverage() {
    const [dimensions, summary, portfolio] = await Promise.all([
      this.listDimensions(), this.accountsSummary({ currency: 'HUF' }), this.portfolio({ currency: 'HUF' }),
    ])
    return this.computeOutlookCoverage({ dimensions, summary, portfolio })
  }

  async listDimensions() {
    const [accounts, categories, range] = await Promise.all([
      this.accounts(), this.categories(),
      this.env.DB.prepare("SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM transactions WHERE status = 'posted'")
        .first<{ min_date?: string; max_date?: string }>(),
    ])
    return {
      as_of: new Date().toISOString(),
      default_currency: 'HUF',
      supported_currencies: ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'RON', 'MXN'],
      available_date_range: { start_date: range?.min_date || null, end_date: range?.max_date || null },
      accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, excluded_from_net_worth: bool(a.exclude_from_net_worth), excluded_from_cash_balance: bool(a.exclude_from_cash_balance), locked: bool(a.is_locked) })),
      categories,
      semantics: {
        posted_transactions_affect_balances: true,
        pending_transactions_do_not_affect_balances: true,
        upcoming_pending_transactions_are_projected: true,
        mcp_review_drafts_require_manual_app_confirmation: true,
        mcp_review_drafts_affect_balances_or_projections: false,
        linked_transactions_are_transfers: true,
        investment_account_balance_meaning: 'quantity for market-priced assets; monetary balance for manual assets',
      },
    }
  }

  private async assertReviewDraftDimensions(items: CanonicalReviewDraft[]) {
    const [accounts, categories] = await Promise.all([this.accounts(), this.categories()])
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    items.forEach((item, index) => {
      const account = accountMap.get(item.account_id)
      if (!account) throw new Error(`items[${index}].account_id does not identify an existing account`)
      if (bool(account.is_locked)) throw new Error(`items[${index}].account_id identifies locked account "${account.name}"`)
      if (account.type === 'investment') throw new Error(`items[${index}].account_id identifies an investment account; v1 supports only income and expenses on cash or credit accounts`)
      if (item.category_id) {
        const category = categoryMap.get(item.category_id)
        if (!category) throw new Error(`items[${index}].category_id does not identify an existing category`)
        if (category.type !== item.type) throw new Error(`items[${index}].category_id is an ${category.type} category but the draft type is ${item.type}`)
      }
    })
    return { accountMap, categoryMap }
  }

  private async duplicateCandidates(item: CanonicalReviewDraft) {
    return (await this.env.DB.prepare(
      "SELECT id, date, amount, description, status, pending_kind FROM transactions WHERE account_id = ? AND ABS(amount - ?) < 0.000000001 AND date >= date(?, '-3 days') AND date <= date(?, '+3 days') AND COALESCE(status, 'posted') != 'cancelled' AND linked_transaction_id IS NULL ORDER BY date DESC, rowid DESC LIMIT 5"
    ).bind(item.account_id, item.signed_amount, item.date, item.date).all<DuplicateCandidate>()).results
  }

  async prepareReviewDrafts(args: Record<string, unknown>) {
    try {
      return await this.prepareReviewDraftsInternal(args)
    } catch (error) {
      proposalLog('prepare', null, 'error', 'proposal_prepare_failed')
      throw error
    }
  }

  private async prepareReviewDraftsInternal(args: Record<string, unknown>) {
    const inputs = args.items as ReviewDraftInput[]
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 20) throw new Error('items must contain from 1 to 20 transactions')
    const items: CanonicalReviewDraft[] = inputs.map((input, index) => {
      const type = input.type
      if (type !== 'income' && type !== 'expense') throw new Error(`items[${index}].type must be income or expense`)
      if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error(`items[${index}].amount must be a positive finite number`)
      if (input.amount > 1_000_000_000_000_000) throw new Error(`items[${index}].amount is too large`)
      const accountId = typeof input.account_id === 'string' ? input.account_id.trim() : ''
      if (!accountId) throw new Error(`items[${index}].account_id is required`)
      const categoryId = typeof input.category_id === 'string' && input.category_id.trim() ? input.category_id.trim() : null
      const description = typeof input.description === 'string' && input.description.trim() ? input.description.trim() : null
      if (description && description.length > 500) throw new Error(`items[${index}].description must be at most 500 characters`)
      const date = assertDate(input.date, `items[${index}].date`)
      return {
        draft_id: crypto.randomUUID(),
        type,
        amount: input.amount,
        signed_amount: type === 'income' ? input.amount : -input.amount,
        account_id: accountId,
        category_id: categoryId,
        description,
        date,
        exclude_from_estimate: input.exclude_from_estimate === true,
        review_flags: [],
      }
    })
    const identities = new Map<string, number[]>()
    items.forEach((item, index) => {
      const identity = JSON.stringify({
        type: item.type, amount: item.amount, account_id: item.account_id, category_id: item.category_id,
        description: item.description, date: item.date, exclude_from_estimate: item.exclude_from_estimate,
      })
      identities.set(identity, [...(identities.get(identity) || []), index])
    })
    const inProposalDuplicates = new Set<number>()
    for (const indexes of identities.values()) {
      if (indexes.length < 2) continue
      indexes.forEach(index => {
        inProposalDuplicates.add(index)
        items[index].review_flags.push('possible_duplicate')
      })
    }
    const { accountMap, categoryMap } = await this.assertReviewDraftDimensions(items)
    const duplicates = await Promise.all(items.map(item => this.duplicateCandidates(item)))
    duplicates.forEach((matches, index) => {
      if (matches.length && !items[index].review_flags.includes('possible_duplicate')) items[index].review_flags.push('possible_duplicate')
    })
    const proposalId = crypto.randomUUID()
    const createdAt = Date.now()
    const expiresAt = createdAt + MCP_PROPOSAL_LIFETIME_MS
    const proposalHash = await sha256(JSON.stringify(items))
    const preview = items.map((item, index) => {
      const account = accountMap.get(item.account_id)!
      const category = item.category_id ? categoryMap.get(item.category_id)! : null
      return {
        item_number: index + 1,
        type: item.type,
        amount: item.amount,
        signed_amount: item.signed_amount,
        date: item.date,
        account_id: account.id,
        account_name: account.name,
        currency: account.currency,
        category_id: category?.id || null,
        category_name: category?.name || null,
        description: item.description,
        exclude_from_estimate: item.exclude_from_estimate,
        warnings: item.review_flags,
        duplicate_candidates: duplicates[index].map(candidate => ({
          transaction_id: candidate.id,
          date: candidate.date,
          amount: Math.abs(candidate.amount),
          signed_amount: candidate.amount,
          status: candidate.status || 'posted',
          pending_kind: candidate.status === 'pending' ? candidate.pending_kind || 'upcoming' : null,
          description: candidate.description || null,
          description_is_untrusted_data: true,
        })),
      }
    })
    const warnings = preview.flatMap((item, index) => {
      const messages: string[] = []
      if (duplicates[index].length) messages.push(`Item ${item.item_number} may duplicate an existing transaction; this warning does not block draft creation.`)
      if (inProposalDuplicates.has(index)) messages.push(`Item ${item.item_number} is identical to another item in this proposal; this warning does not block draft creation.`)
      return messages
    })
    try {
      await this.env.DB.prepare(
        'INSERT INTO mcp_draft_proposals (id, proposal_hash, items_json, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)'
      ).bind(proposalId, proposalHash, JSON.stringify(items), createdAt, expiresAt).run()
    } catch (error) {
      proposalLog('prepare', proposalId, 'error', 'proposal_store_failed')
      throw error
    }
    proposalLog('prepare', proposalId, 'success')
    return {
      as_of: new Date().toISOString(),
      proposal_id: proposalId,
      expires_at: new Date(expiresAt).toISOString(),
      expires_in_seconds: Math.floor(MCP_PROPOSAL_LIFETIME_MS / 1_000),
      item_count: items.length,
      preview,
      warnings,
      confirmation_required: true,
      next_action: 'Show the complete preview to the user and ask for explicit confirmation. Only after confirmation, call create_mcp_transaction_drafts with this proposal_id.',
      effect: 'Preparation stores an expiring proposal only. Creation can only make MCP review drafts; it never posts transactions or changes account balances.',
    }
  }

  private async reviewDraftRows(batchId: string) {
    return (await this.env.DB.prepare(
      "SELECT t.*, a.name AS account_name, a.currency AS account_currency, c.name AS category_name, c.type AS category_type FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id WHERE t.review_batch_id = ? AND t.pending_kind = 'mcp_review' AND t.review_source = 'chatgpt_mcp' ORDER BY t.created_at ASC, t.rowid ASC"
    ).bind(batchId).all<ReviewDraftResultRow>()).results
  }

  private reviewDraftCreationResult(batchId: string, rows: ReviewDraftResultRow[], idempotentReplay: boolean) {
    return {
      as_of: new Date().toISOString(),
      batch_id: batchId,
      item_count: rows.length,
      idempotent_replay: idempotentReplay,
      result: 'mcp_review_drafts_created',
      drafts: rows.map(row => {
        let reviewFlags: string[] = []
        try {
          const parsed = JSON.parse(row.review_flags || '[]')
          if (Array.isArray(parsed)) reviewFlags = parsed.filter(flag => typeof flag === 'string')
        } catch { /* Invalid legacy flags are returned as an empty list. */ }
        return {
          id: row.id,
          type: row.amount > 0 ? 'income' : 'expense',
          amount: Math.abs(row.amount),
          signed_amount: row.amount,
          date: row.date,
          account_id: row.account_id,
          account_name: row.account_name,
          currency: row.account_currency,
          category_id: row.category_id || null,
          category_name: row.category_name || null,
          description: row.description || null,
          exclude_from_estimate: bool(row.exclude_from_estimate),
          status: row.status || 'pending',
          pending_kind: row.pending_kind || 'mcp_review',
          review_source: row.review_source || 'chatgpt_mcp',
          review_batch_id: row.review_batch_id || batchId,
          review_flags: reviewFlags,
        }
      }),
      effect: 'These are MCP review drafts only. No account balance was changed and no transaction was posted.',
      next_action: 'Review each draft in the Finance Manager MCP Review section. Edit, confirm, or decline it there.',
    }
  }

  private proposalId(args: Record<string, unknown>) {
    const proposalId = typeof args.proposal_id === 'string' ? args.proposal_id.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(proposalId)) {
      throw proposalError('invalid_proposal_id', 'proposal_id must be a valid proposal identifier')
    }
    return proposalId
  }

  private parseStoredProposal(row: StoredReviewDraftProposal) {
    let items: CanonicalReviewDraft[]
    try {
      items = JSON.parse(row.items_json) as CanonicalReviewDraft[]
    } catch {
      throw proposalError('proposal_corrupt', 'stored proposal data is invalid')
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw proposalError('proposal_corrupt', 'stored proposal data is invalid')
    items.forEach((item, index) => {
      if (!item || typeof item !== 'object'
        || typeof item.draft_id !== 'string' || !item.draft_id
        || (item.type !== 'income' && item.type !== 'expense')
        || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0
        || item.signed_amount !== (item.type === 'income' ? item.amount : -item.amount)
        || typeof item.account_id !== 'string' || !item.account_id
        || (item.category_id !== null && typeof item.category_id !== 'string')
        || (item.description !== null && typeof item.description !== 'string')
        || typeof item.exclude_from_estimate !== 'boolean'
        || !Array.isArray(item.review_flags) || item.review_flags.some(flag => typeof flag !== 'string')) {
        throw proposalError('proposal_corrupt', `stored proposal item ${index + 1} is invalid`)
      }
      try { assertDate(item.date, `stored proposal item ${index + 1} date`) } catch { throw proposalError('proposal_corrupt', `stored proposal item ${index + 1} is invalid`) }
    })
    return items
  }

  async createReviewDrafts(args: Record<string, unknown>) {
    let proposalId: string | null = null
    try {
      proposalId = this.proposalId(args)
      const proposal = await this.env.DB.prepare(
        'SELECT id, proposal_hash, items_json, created_at, expires_at, consumed_at FROM mcp_draft_proposals WHERE id = ?'
      ).bind(proposalId).first<StoredReviewDraftProposal>()
      if (!proposal) throw proposalError('proposal_not_found', 'proposal_id was not found')
      const existing = await this.env.DB.prepare('SELECT id, proposal_hash, created_at FROM mcp_draft_batches WHERE id = ?').bind(proposalId).first<{ id: string; proposal_hash: string; created_at: number }>()
      if (existing) {
        if (existing.proposal_hash !== proposal.proposal_hash) throw proposalError('proposal_corrupt', 'proposal data conflicts with the created draft batch')
        const result = this.reviewDraftCreationResult(proposalId, await this.reviewDraftRows(proposalId), true)
        proposalLog('create', proposalId, 'idempotent_replay')
        return result
      }
      if (proposal.consumed_at !== null && proposal.consumed_at !== undefined) throw proposalError('proposal_already_consumed', 'proposal_id was already consumed')
      const now = Date.now()
      if (now >= proposal.expires_at) throw proposalError('proposal_expired', 'proposal_id has expired; prepare a fresh preview and obtain explicit confirmation again')
      const items = this.parseStoredProposal(proposal)
      if (await sha256(JSON.stringify(items)) !== proposal.proposal_hash) throw proposalError('proposal_corrupt', 'stored proposal checksum does not match')
      await this.assertReviewDraftDimensions(items)
      const createdAt = Date.now()
      const statements: D1PreparedStatement[] = [
        this.env.DB.prepare('UPDATE mcp_draft_proposals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(createdAt, proposalId),
        this.env.DB.prepare('INSERT INTO mcp_draft_batches (id, proposal_hash, created_at) VALUES (?, ?, ?)').bind(proposalId, proposal.proposal_hash, createdAt),
      ]
      for (const item of items) {
        statements.push(this.env.DB.prepare(
          "INSERT INTO transactions (id, account_id, category_id, amount, description, date, linked_transaction_id, exclude_from_estimate, status, confirmed_at, cancelled_at, created_at, updated_at, pending_kind, review_source, review_batch_id, review_flags) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', NULL, NULL, ?, ?, 'mcp_review', 'chatgpt_mcp', ?, ?)"
        ).bind(item.draft_id, item.account_id, item.category_id, item.signed_amount, item.description, item.date, item.exclude_from_estimate ? 1 : 0, createdAt, createdAt, proposalId, JSON.stringify(item.review_flags)))
        statements.push(this.env.DB.prepare(
          "INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) VALUES (?, 'CREATE', 'transaction', ?, ?, ?)"
        ).bind(crypto.randomUUID(), item.draft_id, JSON.stringify({ origin: 'chatgpt_mcp', batch_id: proposalId }), createdAt))
      }
      try {
        await this.env.DB.batch(statements)
      } catch (error) {
        const raced = await this.env.DB.prepare('SELECT id, proposal_hash, created_at FROM mcp_draft_batches WHERE id = ?').bind(proposalId).first<{ id: string; proposal_hash: string; created_at: number }>()
        if (!raced || raced.proposal_hash !== proposal.proposal_hash) throw error
        const result = this.reviewDraftCreationResult(proposalId, await this.reviewDraftRows(proposalId), true)
        proposalLog('create', proposalId, 'idempotent_replay')
        return result
      }
      const result = this.reviewDraftCreationResult(proposalId, await this.reviewDraftRows(proposalId), false)
      proposalLog('create', proposalId, 'success')
      return result
    } catch (error) {
      proposalLog('create', proposalId, 'error', error instanceof McpProposalError ? error.code : 'proposal_create_failed')
      throw error
    }
  }

  async accountsSummary(args: Record<string, unknown>) {
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const [accounts, rates] = await Promise.all([this.accounts(), this.rates(currency)])
    const warnings = this.conversionWarnings(accounts.filter(account => account.type !== 'investment'), currency, rates)
    let cashTotal = 0
    let nonInvestmentNetWorth = 0
    const summaries = accounts.map(account => {
      const isInvestment = account.type === 'investment'
      const missingRate = account.currency !== currency && !rates.values[account.currency]
      const convertedBalance = isInvestment || missingRate ? null : round(this.convert(account.balance, account.currency, currency, rates))
      if (!isInvestment && !bool(account.exclude_from_cash_balance)) cashTotal += convertedBalance ?? 0
      if (!isInvestment && !bool(account.exclude_from_net_worth)) nonInvestmentNetWorth += convertedBalance ?? 0
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        native_balance: isInvestment && account.asset_type !== 'manual' ? null : round(account.balance),
        converted_balance: convertedBalance,
        reporting_currency: isInvestment ? null : currency,
        investment_quantity: isInvestment && account.asset_type !== 'manual' ? account.balance : null,
        symbol: account.symbol || null,
        asset_type: account.asset_type || null,
        excluded_from_cash_balance: bool(account.exclude_from_cash_balance),
        excluded_from_net_worth: bool(account.exclude_from_net_worth),
        locked: bool(account.is_locked),
      }
    })
    return {
      as_of: new Date().toISOString(), currency,
      totals: { cash_balance: round(cashTotal), non_investment_net_worth: round(nonInvestmentNetWorth) },
      accounts: summaries,
      conversion_status: warnings.length ? 'partial' : 'complete', warnings,
      note: 'Use get_portfolio for current market valuation of investment accounts.',
    }
  }

  private async periodTotals(startDate: string, endDate: string, currency: string, accounts: AccountRow[], rates: Rates) {
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const transactions = await this.postedBetween(startDate, endDate)
    let income = 0
    let expenses = 0
    let transactionCount = 0
    for (const transaction of transactions) {
      const account = accountMap.get(transaction.account_id)
      if (!account || account.type === 'investment' || transaction.linked_transaction_id) continue
      const amount = this.convert(transaction.amount, account.currency, currency, rates)
      transactionCount += 1
      if (amount > 0) income += amount
      if (amount < 0) expenses += Math.abs(amount)
    }
    return { income: round(income), expenses: round(expenses), net_flow: round(income - expenses), transaction_count: transactionCount }
  }

  async overview(args: Record<string, unknown>) {
    const defaults = defaultMonthRange()
    const startDate = optionalDate(args.start_date, 'start_date') || defaults.startDate
    const endDate = optionalDate(args.end_date, 'end_date') || defaults.endDate
    assertDateRange(startDate, endDate)
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const [accounts, rates] = await Promise.all([this.accounts(), this.rates(currency)])
    const warnings = this.conversionWarnings(accounts.filter(account => account.type !== 'investment'), currency, rates)
    const totals = await this.periodTotals(startDate, endDate, currency, accounts, rates)
    const previous = previousRange(startDate, endDate)
    const previousTotals = await this.periodTotals(previous.startDate, previous.endDate, currency, accounts, rates)

    let cashBalance = 0
    let netWorth = 0
    for (const account of accounts.filter(item => item.type !== 'investment')) {
      const converted = this.convert(account.balance, account.currency, currency, rates)
      if (!bool(account.exclude_from_cash_balance)) cashBalance += converted
      if (!bool(account.exclude_from_net_worth)) netWorth += converted
    }
    const portfolio = await this.portfolio({ currency })
    for (const warning of portfolio.warnings) if (!warnings.includes(warning)) warnings.push(warning)
    netWorth += portfolio.total_value
    return {
      as_of: new Date().toISOString(), currency,
      period: { start_date: startDate, end_date: endDate },
      totals: { ...totals, cash_balance: round(cashBalance), net_worth: round(netWorth), investment_value: portfolio.total_value },
      previous_period: { start_date: previous.startDate, end_date: previous.endDate, ...previousTotals },
      change: { income: round(totals.income - previousTotals.income), expenses: round(totals.expenses - previousTotals.expenses), net_flow: round(totals.net_flow - previousTotals.net_flow) },
      conversion_status: warnings.length ? 'partial' : 'complete', warnings,
    }
  }

  async financialOutlookContext() {
    const today = new Date().toISOString().slice(0, 10)
    const historyStart = addUtcDays(today, -89)
    const patternStart = addUtcDays(today, -364)
    const futureEnd = addUtcDays(today, 90)
    const [revision, recentRows, dimensions, accounts, overview, balanceHistory, cashflow, spendingByCategory, incomeByCategory, historicalPatterns, recurring, portfolio] = await Promise.all([
      this.financialDataRevision(),
      this.recentOutlookRows(),
      this.listDimensions(),
      this.accountsSummary({ currency: 'HUF' }),
      this.overview({ currency: 'HUF', start_date: historyStart, end_date: today }),
      this.balanceTrend({ currency: 'HUF', start_date: historyStart, end_date: today, interval: 'day' }),
      this.cashflowTrend({ currency: 'HUF', start_date: historyStart, end_date: today, interval: 'day', include_projected: false }),
      this.flowBreakdown({ currency: 'HUF', start_date: historyStart, end_date: today, flow_type: 'expense', group_by: 'category' }),
      this.flowBreakdown({ currency: 'HUF', start_date: historyStart, end_date: today, flow_type: 'income', group_by: 'category' }),
      this.forecastHistory(patternStart, today),
      this.recurringForecast({ currency: 'HUF', start_date: today, end_date: futureEnd }),
      this.portfolio({ currency: 'HUF' }),
    ])
    const coverage = this.computeOutlookCoverage({ dimensions, summary: accounts, portfolio })
    return {
      as_of: new Date().toISOString(),
      source_revision: revision.revision,
      source_revision_updated_at: new Date(revision.updated_at).toISOString(),
      currency: 'HUF',
      generation_policy: {
        refresh_after_days: 4,
        manual_when_fresh: 'Ask before regenerating a recent unchanged forecast unless the user explicitly asked to regenerate.',
        scheduled_when_fresh: 'Skip a recent unchanged forecast during scheduled runs.',
      },
      latest_forecast: this.outlookStatus(recentRows[0] || null, revision),
      previous_forecasts: recentRows.map(row => {
        const snapshot = parseSnapshot(row)
        return {
          created_at: snapshot.created_at,
          source_queried_at: snapshot.source_queried_at,
          headline: snapshot.headline,
          drivers: snapshot.drivers || [],
          risks: snapshot.risks || [],
          assumptions: snapshot.assumptions || [],
          suggestions: snapshot.suggestions || [],
          narrative_is_untrusted_data: true,
        }
      }),
      source_coverage: coverage,
      core_data: {
        accounts,
        overview,
        historical_cash_balance: balanceHistory,
        historical_cash_flow: cashflow,
        spending_by_category: spendingByCategory,
        income_by_category: incomeByCategory,
        historical_patterns: historicalPatterns,
        known_future: recurring,
        portfolio,
      },
    }
  }

  async createFinancialOutlookSnapshot(args: Record<string, unknown>) {
    const input = parseFinancialOutlookInput(args)
    const generationDate = new Date().toISOString().slice(0, 10)
    if (input.source_queried_at.slice(0, 10) !== generationDate) {
      throw new Error('source_queried_at must be from today\'s financial outlook context')
    }
    const historyStart = addUtcDays(generationDate, -89)
    const generationDay = new Date(`${generationDate}T00:00:00Z`)
    const previousYear = generationDay.getUTCFullYear() - 1
    const month = generationDay.getUTCMonth()
    const lastDayOfMonth = new Date(Date.UTC(previousYear, month + 1, 0)).getUTCDate()
    const yearStart = new Date(Date.UTC(previousYear, month, Math.min(generationDay.getUTCDate(), lastDayOfMonth))).toISOString().slice(0, 10)
    const futureEnd = addUtcDays(generationDate, 90)
    const [coverage, historicalBalances, yearBalances, knownFuture] = await Promise.all([
      this.outlookCoverage(),
      this.balanceTrend({ currency: 'HUF', start_date: historyStart, end_date: generationDate, interval: 'day' }),
      this.balanceTrend({ currency: 'HUF', start_date: yearStart, end_date: generationDate, interval: 'day' }),
      this.recurringForecast({ currency: 'HUF', start_date: generationDate, end_date: futureEnd }),
    ])
    const firstCashRow = await this.env.DB.prepare(
      "SELECT MIN(t.date) AS min_date FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.status = 'posted' AND t.date <= ? AND a.type != 'investment' AND COALESCE(a.exclude_from_cash_balance, 0) = 0"
    ).bind(generationDate).first<{ min_date: string | null }>()
    const firstCashDate = firstCashRow?.min_date || generationDate
    const alltimeBalances = await this.balanceTrend({ currency: 'HUF', start_date: firstCashDate, end_date: generationDate, interval: 'month' }, true)
    const firstAlltimeBalance = firstCashDate === alltimeBalances.series[0]?.date
      ? null
      : (await this.balanceTrend({ currency: 'HUF', start_date: firstCashDate, end_date: firstCashDate, interval: 'day' })).series[0]
    const toCashPoints = (series: Array<{ date: string; cash_balance: number }>) => series.map(point => ({ date: point.date, balance: point.cash_balance }))
    const currentCash = historicalBalances.series.at(-1)?.cash_balance
    const dayZero = input.cash_balance_path[0]
    if (currentCash === undefined || dayZero.low !== currentCash || dayZero.expected !== currentCash || dayZero.high !== currentCash) {
      throw new Error('cash_balance_path day 0 must equal the current liquid cash balance from the outlook context')
    }
    const expectedDeltas = input.cash_balance_path.slice(1).map((point, index) => point.expected - input.cash_balance_path[index].expected)
    const historicalMovement = historicalBalances.series.some((point, index) => index > 0 && point.cash_balance !== historicalBalances.series[index - 1].cash_balance)
    if (historicalMovement) {
      let uniformDays = 1
      for (let index = 1; index < expectedDeltas.length; index++) {
        const tolerance = Math.max(10, Math.abs(expectedDeltas[index - 1]) * 0.001)
        uniformDays = Math.abs(expectedDeltas[index] - expectedDeltas[index - 1]) <= tolerance ? uniformDays + 1 : 1
        if (uniformDays > 7) {
          throw new Error('cash_balance_path may not spread spending or income as a straight-line run longer than 7 days; use the daily cash-flow pattern and dated known movements from the outlook context')
        }
      }
    }
    const materialAmount = Math.max(10_000, Math.abs(currentCash) * 0.015)
    const knownMovementByDay = new Map<number, number>()
    const addKnownMovement = (item: Record<string, unknown>) => {
      const date = typeof item.date === 'string' ? item.date : null
      const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null
      if (!date || amount === null || Math.abs(amount) < materialAmount) return
      const day = daysBetween(generationDate, date) - 1
      if (day < 1 || day > 90) return
      knownMovementByDay.set(day, (knownMovementByDay.get(day) || 0) + amount)
    }
    for (const occurrence of knownFuture.occurrences as Array<Record<string, unknown>>) {
      if (occurrence.schedule_type === 'transaction') addKnownMovement(occurrence)
    }
    for (const pending of knownFuture.pending_one_time_transactions as Array<Record<string, unknown>>) addKnownMovement(pending)
    for (const [day, movement] of knownMovementByDay) {
      if (Math.abs(movement) < materialAmount) continue
      const dailyDelta = expectedDeltas[day - 1]
      if (Math.sign(dailyDelta) !== Math.sign(movement) || Math.abs(dailyDelta) < Math.abs(movement) * 0.2) {
        throw new Error(`cash_balance_path day ${day} does not visibly reflect a material known movement on that date; do not distribute dated salary, bills, or planned transactions across other days`)
      }
    }
    const payload = {
      headline: input.headline,
      horizons: input.horizons,
      cash_balance_path: input.cash_balance_path,
      cash_balance_history: toCashPoints(historicalBalances.series),
      cash_balance_history_year: toCashPoints(yearBalances.series),
      cash_balance_history_alltime: toCashPoints(firstAlltimeBalance ? [firstAlltimeBalance, ...alltimeBalances.series] : alltimeBalances.series),
      drivers: input.drivers,
      risks: input.risks,
      assumptions: input.assumptions,
      suggestions: input.suggestions,
    }
    const payloadJson = JSON.stringify(payload)
    const payloadHash = await sha256(JSON.stringify({ source_revision: input.source_revision, source_queried_at: input.source_queried_at, payload }))
    const existing = await this.env.DB.prepare('SELECT * FROM financial_outlook_snapshots WHERE idempotency_key = ?').bind(input.idempotency_key).first<FinancialOutlookSnapshotRow>()
    if (existing) {
      if (existing.payload_hash !== payloadHash) throw new Error('idempotency_key conflicts with an existing financial outlook snapshot')
      return { snapshot: parseSnapshot(existing), idempotent_replay: true }
    }

    const revision = await this.financialDataRevision()
    if (revision.revision !== input.source_revision) {
      throw new Error('Financial data changed after the outlook context was read; refresh the context before publishing')
    }
    const id = crypto.randomUUID()
    const createdAt = Date.now()
    const row: FinancialOutlookSnapshotRow = {
      id,
      idempotency_key: input.idempotency_key,
      payload_hash: payloadHash,
      schema_version: 4,
      currency: 'HUF',
      source_revision: input.source_revision,
      source_queried_at: input.source_queried_at,
      created_at: createdAt,
      headline: input.headline,
      data_quality_score: coverage.data_quality_score,
      data_quality_label: coverage.data_quality_label,
      payload: payloadJson,
      source_coverage: JSON.stringify(coverage),
    }
    try {
      await this.env.DB.batch([
        this.env.DB.prepare('INSERT INTO financial_outlook_snapshots (id, idempotency_key, payload_hash, schema_version, currency, source_revision, source_queried_at, created_at, headline, data_quality_score, data_quality_label, payload, source_coverage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(row.id, row.idempotency_key, row.payload_hash, row.schema_version, row.currency, row.source_revision, row.source_queried_at, row.created_at, row.headline, row.data_quality_score, row.data_quality_label, row.payload, row.source_coverage),
        this.env.DB.prepare("INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) VALUES (?, 'CREATE', 'financial_outlook_snapshot', ?, ?, ?)")
          .bind(crypto.randomUUID(), id, JSON.stringify({ source_revision: input.source_revision, origin: 'chatgpt_mcp' }), createdAt),
      ])
    } catch (error) {
      const raced = await this.env.DB.prepare('SELECT * FROM financial_outlook_snapshots WHERE idempotency_key = ?').bind(input.idempotency_key).first<FinancialOutlookSnapshotRow>()
      if (raced && raced.payload_hash === payloadHash) return { snapshot: parseSnapshot(raced), idempotent_replay: true }
      throw error
    }
    return { snapshot: parseSnapshot(row), idempotent_replay: false }
  }

  async searchTransactions(args: Record<string, unknown>) {
    const filters = (args.filters && typeof args.filters === 'object' ? args.filters : args) as Record<string, unknown>
    const startDate = optionalDate(filters.start_date, 'start_date')
    const endDate = optionalDate(filters.end_date, 'end_date')
    if (startDate && endDate) assertDateRange(startDate, endDate)
    const accountIds = stringArray(filters.account_ids, 'account_ids')
    const categoryIds = stringArray(filters.category_ids, 'category_ids')
    const requestedStatuses = stringArray(filters.statuses, 'statuses')
    const statuses = requestedStatuses?.length ? requestedStatuses : ['posted']
    if (statuses.some(status => !['posted', 'pending', 'cancelled'].includes(status))) throw new Error('statuses may contain only posted, pending, or cancelled')
    const type = filters.type
    if (type !== undefined && !['income', 'expense'].includes(String(type))) throw new Error('type must be income or expense')
    const text = typeof filters.text === 'string' ? filters.text.trim().slice(0, 200) : undefined
    const includeTransfers = filters.include_transfers === true
    const sortBy = enumValue(args.sort_by, ['date', 'amount_magnitude'] as const, 'date', 'sort_by')
    const sortOrder = enumValue(args.sort_order, ['asc', 'desc'] as const, 'desc', 'sort_order')
    const limit = clampLimit(args.limit)
    const offset = decodeCursor(args.cursor)
    const clauses = [`COALESCE(t.status, 'posted') IN (${statuses.map(() => '?').join(',')})`]
    const values: (string | number)[] = [...statuses]
    if (startDate) { clauses.push('t.date >= ?'); values.push(startDate) }
    if (endDate) { clauses.push('t.date <= ?'); values.push(endDate) }
    if (accountIds?.length) { clauses.push(`t.account_id IN (${accountIds.map(() => '?').join(',')})`); values.push(...accountIds) }
    if (categoryIds?.length) { clauses.push(`t.category_id IN (${categoryIds.map(() => '?').join(',')})`); values.push(...categoryIds) }
    if (type === 'income') clauses.push('t.amount > 0')
    if (type === 'expense') clauses.push('t.amount < 0')
    if (!includeTransfers) clauses.push('t.linked_transaction_id IS NULL')
    if (text) { clauses.push('(LOWER(COALESCE(t.description, \'\')) LIKE ? OR LOWER(a.name) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ?)'); values.push(...Array(3).fill(`%${text.toLowerCase()}%`)) }
    const orderExpression = sortBy === 'amount_magnitude' ? `ABS(t.amount) ${sortOrder.toUpperCase()}, t.date DESC` : `t.date ${sortOrder.toUpperCase()}`
    const query = `SELECT t.*, a.name AS account_name, a.currency AS account_currency, c.name AS category_name, c.icon AS category_icon FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id WHERE ${clauses.join(' AND ')} ORDER BY ${orderExpression}, t.rowid DESC LIMIT ? OFFSET ?`
    const results = (await this.env.DB.prepare(query).bind(...values, limit + 1, offset).all<Record<string, unknown>>()).results
    const hasMore = results.length > limit
    return {
      as_of: new Date().toISOString(), filters: { start_date: startDate || null, end_date: endDate || null, account_ids: accountIds || [], category_ids: categoryIds || [], statuses, type: type || null, text: text || null, include_transfers: includeTransfers },
      sort: { by: sortBy, order: sortOrder },
      transactions: results.slice(0, limit).map(row => ({
        ...row,
        pending_kind: row.status === 'pending' ? row.pending_kind || 'upcoming' : null,
        requires_manual_review: row.status === 'pending' && row.pending_kind === 'mcp_review',
        is_transfer: Boolean(row.linked_transaction_id),
        description_is_untrusted_data: true,
      })),
      pagination: { limit, returned: Math.min(limit, results.length), next_cursor: hasMore ? encodeCursor(offset + limit) : null, truncated: hasMore },
    }
  }

  async flowBreakdown(args: Record<string, unknown>) {
    const startDate = assertDate(args.start_date, 'start_date')
    const endDate = assertDate(args.end_date, 'end_date')
    assertDateRange(startDate, endDate)
    const groupBy = String(args.group_by || 'category')
    if (!['category', 'account', 'week', 'month'].includes(groupBy)) throw new Error('group_by must be category, account, week, or month')
    const flowType = enumValue(args.flow_type, ['expense', 'income'] as const, 'expense', 'flow_type')
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const [accounts, categories, transactions, rates] = await Promise.all([this.accounts(), this.categories(), this.postedBetween(startDate, endDate), this.rates(currency)])
    const warnings = this.conversionWarnings(accounts.filter(account => account.type !== 'investment'), currency, rates)
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const groups = new Map<string, { label: string; icon?: string | null; amount: number; count: number }>()
    let total = 0
    for (const transaction of transactions) {
      const account = accountMap.get(transaction.account_id)
      if (!account || account.type === 'investment' || transaction.linked_transaction_id) continue
      if (flowType === 'expense' && transaction.amount >= 0) continue
      if (flowType === 'income' && transaction.amount <= 0) continue
      const amount = Math.abs(this.convert(transaction.amount, account.currency, currency, rates))
      total += amount
      let key = transaction.category_id || 'uncategorized'
      let label = categoryMap.get(key)?.name || 'Uncategorized'
      let icon = categoryMap.get(key)?.icon
      if (groupBy === 'account') { key = account.id; label = account.name; icon = null }
      if (groupBy === 'month') { key = transaction.date.slice(0, 7); label = key; icon = null }
      if (groupBy === 'week') {
        const date = new Date(`${transaction.date}T00:00:00Z`)
        const day = (date.getUTCDay() + 6) % 7
        date.setUTCDate(date.getUTCDate() - day)
        key = date.toISOString().slice(0, 10); label = `Week of ${key}`; icon = null
      }
      const current = groups.get(key) || { label, icon, amount: 0, count: 0 }
      current.amount += amount; current.count += 1; groups.set(key, current)
    }
    return {
      as_of: new Date().toISOString(), currency, period: { start_date: startDate, end_date: endDate }, flow_type: flowType, group_by: groupBy, total: round(total),
      groups: [...groups.entries()].map(([key, value]) => ({ key, ...value, amount: round(value.amount), percentage: total ? round(value.amount / total * 100) : 0 })).sort((a, b) => b.amount - a.amount),
      conversion_status: warnings.length ? 'partial' : 'complete', warnings,
    }
  }

  async spendingBreakdown(args: Record<string, unknown>) {
    return this.flowBreakdown({ ...args, flow_type: 'expense' })
  }

  async cashflowTrend(args: Record<string, unknown>) {
    const startDate = assertDate(args.start_date, 'start_date')
    const endDate = assertDate(args.end_date, 'end_date')
    const days = assertDateRange(startDate, endDate)
    const interval = String(args.interval || (days > 370 ? 'month' : days > 90 ? 'week' : 'day'))
    if (!['day', 'week', 'month'].includes(interval)) throw new Error('interval must be day, week, or month')
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const includeProjected = args.include_projected === true
    const [accounts, posted, pendingResult, rates] = await Promise.all([
      this.accounts(), this.postedBetween(startDate, endDate),
      includeProjected ? this.env.DB.prepare("SELECT * FROM transactions WHERE status = 'pending' AND pending_kind = 'upcoming' AND date >= ? AND date <= ? ORDER BY date").bind(startDate, endDate).all<TransactionRow>() : Promise.resolve({ results: [] as TransactionRow[] }),
      this.rates(currency),
    ])
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const warnings = this.conversionWarnings(accounts.filter(account => account.type !== 'investment'), currency, rates)
    const groups = new Map<string, { income: number; expenses: number; projected_income: number; projected_expenses: number }>()
    const keyFor = (dateString: string) => {
      if (interval === 'month') return dateString.slice(0, 7)
      if (interval === 'week') { const d = new Date(`${dateString}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10) }
      return dateString
    }
    const add = (transaction: TransactionRow, projected: boolean) => {
      const account = accountMap.get(transaction.account_id)
      if (!account || account.type === 'investment' || transaction.linked_transaction_id) return
      const key = keyFor(transaction.date)
      const group = groups.get(key) || { income: 0, expenses: 0, projected_income: 0, projected_expenses: 0 }
      const amount = this.convert(transaction.amount, account.currency, currency, rates)
      const field = projected ? (amount >= 0 ? 'projected_income' : 'projected_expenses') : (amount >= 0 ? 'income' : 'expenses')
      group[field] += Math.abs(amount); groups.set(key, group)
    }
    posted.forEach(transaction => add(transaction, false)); pendingResult.results.forEach(transaction => add(transaction, true))
    const series = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-400).map(([period, values]) => ({ period, income: round(values.income), expenses: round(values.expenses), net_flow: round(values.income - values.expenses), projected_income: round(values.projected_income), projected_expenses: round(values.projected_expenses), projected_net_flow: round(values.projected_income - values.projected_expenses) }))
    return { as_of: new Date().toISOString(), currency, period: { start_date: startDate, end_date: endDate }, interval, include_projected: includeProjected, series, truncated: groups.size > 400, conversion_status: warnings.length ? 'partial' : 'complete', warnings }
  }

  async balanceTrend(args: Record<string, unknown>, snapshotHistory = false) {
    const startDate = assertDate(args.start_date, 'start_date')
    const endDate = assertDate(args.end_date, 'end_date')
    if (startDate > endDate) throw new Error('start_date must not be after end_date')
    const days = snapshotHistory ? daysBetween(startDate, endDate) : assertDateRange(startDate, endDate)
    const interval = enumValue(args.interval, ['day', 'week', 'month'] as const, days > 400 ? 'month' : days > 120 ? 'week' : 'day', 'interval')
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const includeAccounts = args.include_accounts === true
    const [allAccounts, transactions, rates] = await Promise.all([this.accounts(), this.postedAfter(startDate), this.rates(currency)])
    const accounts = allAccounts.filter(account => account.type !== 'investment')
    const accountIds = new Set(accounts.map(account => account.id))
    const relevantTransactions = transactions.filter(transaction => accountIds.has(transaction.account_id))
    const warnings = this.conversionWarnings(accounts, currency, rates)
    const points = periodEndDates(startDate, endDate, interval, snapshotHistory ? 1200 : 400)
    const laterChanges = new Map(accounts.map(account => [account.id, 0]))
    for (const transaction of relevantTransactions) {
      laterChanges.set(transaction.account_id, (laterChanges.get(transaction.account_id) || 0) + transaction.amount)
    }
    let transactionIndex = 0
    const series = points.map(date => {
      while (transactionIndex < relevantTransactions.length && relevantTransactions[transactionIndex].date <= date) {
        const transaction = relevantTransactions[transactionIndex++]
        laterChanges.set(transaction.account_id, (laterChanges.get(transaction.account_id) || 0) - transaction.amount)
      }
      let cashBalance = 0
      let netWorth = 0
      const accountBalances = []
      for (const account of accounts) {
        const laterChange = laterChanges.get(account.id) || 0
        const nativeBalance = account.balance - laterChange
        const convertedBalance = this.convert(nativeBalance, account.currency, currency, rates)
        if (!bool(account.exclude_from_cash_balance)) cashBalance += convertedBalance
        if (!bool(account.exclude_from_net_worth)) netWorth += convertedBalance
        if (includeAccounts) accountBalances.push({ account_id: account.id, account_name: account.name, native_balance: round(nativeBalance), native_currency: account.currency, balance: round(convertedBalance), currency })
      }
      return { date, cash_balance: round(cashBalance), non_investment_net_worth: round(netWorth), ...(includeAccounts ? { accounts: accountBalances } : {}) }
    })
    return {
      as_of: new Date().toISOString(), currency, period: { start_date: startDate, end_date: endDate }, interval,
      series, conversion_status: warnings.length ? 'partial' : 'complete', warnings,
      methodology: 'Historical balances are reconstructed from current account balances by reversing later posted transactions. Investment market values are excluded.',
    }
  }

  async recurringForecast(args: Record<string, unknown>) {
    const today = new Date().toISOString().slice(0, 10)
    const startDate = optionalDate(args.start_date, 'start_date') || today
    const endDate = optionalDate(args.end_date, 'end_date') || addUtcDays(startDate, 89)
    if (assertDateRange(startDate, endDate) > 366) throw new Error('recurring forecast date range cannot exceed 366 days')
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const [accounts, categories, schedules, pending, rates] = await Promise.all([
      this.accounts(), this.categories(),
      this.env.DB.prepare('SELECT * FROM recurring_schedules WHERE is_active = 1 ORDER BY created_at DESC').all<RecurringScheduleRow>(),
      this.env.DB.prepare("SELECT * FROM transactions WHERE status = 'pending' AND pending_kind = 'upcoming' AND date >= ? AND date <= ? ORDER BY date ASC, rowid DESC LIMIT 101").bind(startDate, endDate).all<TransactionRow>(),
      this.rates(currency),
    ])
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const occurrences: Array<Record<string, unknown>> = []
    const warnings = this.conversionWarnings(accounts.filter(account => account.type !== 'investment'), currency, rates)
    for (const schedule of schedules.results) {
      const account = accountMap.get(schedule.account_id)
      if (!account || schedule.remaining_occurrences === 0) continue
      const dates = recurringDates(schedule, startDate, endDate, Math.max(0, 201 - occurrences.length))
      for (const date of dates) {
        occurrences.push({
          date, schedule_id: schedule.id, schedule_type: schedule.type, frequency: schedule.frequency,
          account_id: schedule.account_id, account_name: account.name, to_account_id: schedule.to_account_id || null,
          to_account_name: schedule.to_account_id ? accountMap.get(schedule.to_account_id)?.name || null : null,
          category_id: schedule.category_id || null, category_name: schedule.category_id ? categoryMap.get(schedule.category_id)?.name || null : null,
          native_amount: schedule.amount, native_currency: account.currency,
          amount: round(this.convert(schedule.amount, account.currency, currency, rates)), currency,
          native_amount_to: schedule.amount_to || null,
          description: schedule.description || null, description_is_untrusted_data: true,
        })
      }
      if (occurrences.length >= 201) break
    }
    occurrences.sort((a, b) => String(a.date).localeCompare(String(b.date)))
    const returnedOccurrences = occurrences.slice(0, 200)
    const transactionOccurrences = returnedOccurrences.filter(item => item.schedule_type === 'transaction')
    const expectedIncome = transactionOccurrences.filter(item => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0)
    const expectedExpenses = transactionOccurrences.filter(item => Number(item.amount) < 0).reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0)
    const upcoming = pending.results.slice(0, 100).map(transaction => {
      const account = accountMap.get(transaction.account_id)
      const nativeCurrency = account?.currency || null
      return {
        ...transaction,
        native_amount: transaction.amount,
        native_currency: nativeCurrency,
        amount: account ? round(this.convert(transaction.amount, account.currency, currency, rates)) : 0,
        currency,
        account_name: account?.name || null,
        category_name: categoryMap.get(transaction.category_id || '')?.name || null,
        description_is_untrusted_data: true,
      }
    })
    const pendingIncome = upcoming.filter(item => item.amount > 0 && !item.linked_transaction_id).reduce((sum, item) => sum + item.amount, 0)
    const pendingExpenses = upcoming.filter(item => item.amount < 0 && !item.linked_transaction_id).reduce((sum, item) => sum + Math.abs(item.amount), 0)
    if (schedules.results.some(schedule => schedule.frequency === 'yearly')) warnings.push('Yearly schedule month is not stored in the current database schema; forecasts use each schedule creation month')
    return {
      as_of: new Date().toISOString(), currency, period: { start_date: startDate, end_date: endDate },
      summary: {
        recurring_income: round(expectedIncome), recurring_expenses: round(expectedExpenses), recurring_net: round(expectedIncome - expectedExpenses),
        pending_income: round(pendingIncome), pending_expenses: round(pendingExpenses), pending_net: round(pendingIncome - pendingExpenses),
        total_known_income: round(expectedIncome + pendingIncome), total_known_expenses: round(expectedExpenses + pendingExpenses),
        total_known_net: round(expectedIncome + pendingIncome - expectedExpenses - pendingExpenses),
        scheduled_occurrence_count: returnedOccurrences.length, pending_one_time_count: upcoming.length,
      },
      occurrences: returnedOccurrences, occurrences_truncated: occurrences.length > 200,
      pending_one_time_transactions: upcoming, pending_truncated: pending.results.length > 100,
      conversion_status: warnings.length ? 'partial' : 'complete', warnings,
    }
  }

  async portfolio(args: Record<string, unknown>) {
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const [accounts, rates, activity] = await Promise.all([
      this.accounts(), this.rates(currency),
      this.env.DB.prepare('SELECT * FROM investment_transactions ORDER BY date ASC, rowid ASC').all<InvestmentTransactionRow>(),
    ])
    const investmentAccounts = accounts.filter(item => item.type === 'investment' && !bool(item.exclude_from_net_worth))
    const quotes = await this.liveQuotes(investmentAccounts.filter(account => account.asset_type !== 'manual' && Boolean(account.symbol)))
    const holdings = []
    const warnings: string[] = []
    let total = 0
    for (const account of investmentAccounts) {
      const accountActivity = activity.results.filter(transaction => transaction.account_id === account.id)
      const activityQuantity = accountActivity.reduce((sum, transaction) => sum + (transaction.type === 'buy' ? transaction.quantity : -transaction.quantity), 0)
      const nativeNetInvested = accountActivity.reduce((sum, transaction) => sum + (transaction.type === 'buy' ? transaction.total_amount : -transaction.total_amount), 0)
      const investmentCurrency = account.asset_type === 'manual' ? account.currency : 'USD'
      const netInvested = this.convert(nativeNetInvested, investmentCurrency, currency, rates)
      if (nativeNetInvested && investmentCurrency !== currency && !rates.values[investmentCurrency]) warnings.push(`Exchange rate unavailable for ${investmentCurrency}; invested amount for ${account.name} was excluded from ${currency} totals`)
      if (account.asset_type !== 'manual' && accountActivity.length && Math.abs(activityQuantity - account.balance) > 0.000001) warnings.push(`Stored quantity and investment activity differ for ${account.name}`)
      let nativeValue = account.balance
      let quote: Record<string, unknown> | null = null
      if (account.asset_type !== 'manual' && account.symbol) {
        const liveQuote = quotes.get(account.id)
        if (liveQuote) {
          nativeValue = account.balance * liveQuote.price
          quote = { price: liveQuote.price, currency: liveQuote.currency, market_state: liveQuote.marketState }
          const quoteCurrency = liveQuote.currency
          const converted = this.convert(nativeValue, quoteCurrency, currency, rates)
          if (quoteCurrency !== currency && !rates.values[quoteCurrency]) warnings.push(`Exchange rate unavailable for ${quoteCurrency}; ${account.symbol} was excluded from ${currency} totals`)
          total += converted
          holdings.push({ account_id: account.id, name: account.name, symbol: account.symbol, asset_type: account.asset_type, quantity: account.balance, activity_quantity: round(activityQuantity), native_value: round(nativeValue), native_currency: liveQuote.currency, value: round(converted), currency, native_net_invested: round(nativeNetInvested), investment_currency: investmentCurrency, net_invested: round(netInvested), gain_loss: round(converted - netInvested), gain_loss_percent: netInvested > 0 ? round((converted - netInvested) / netInvested * 100) : null, quote })
          continue
        }
        warnings.push(`Live quote unavailable for ${account.symbol}`)
        nativeValue = 0
      }
      const converted = this.convert(nativeValue, account.currency, currency, rates)
      total += converted
      holdings.push({ account_id: account.id, name: account.name, symbol: account.symbol || null, asset_type: account.asset_type || 'manual', quantity: account.asset_type === 'manual' ? null : account.balance, activity_quantity: account.asset_type === 'manual' ? null : round(activityQuantity), native_value: round(nativeValue), native_currency: account.currency, value: round(converted), currency, native_net_invested: round(nativeNetInvested), investment_currency: investmentCurrency, net_invested: round(netInvested), gain_loss: account.asset_type === 'manual' ? null : round(converted - netInvested), gain_loss_percent: account.asset_type !== 'manual' && netInvested > 0 ? round((converted - netInvested) / netInvested * 100) : null, quote })
    }
    warnings.push(...this.conversionWarnings(investmentAccounts.filter(account => account.asset_type === 'manual'), currency, rates))
    const withAllocation = holdings.map(holding => ({ ...holding, allocation_percent: total ? round(holding.value / total * 100) : 0 }))
    const totalInvested = holdings.reduce((sum, holding) => sum + holding.net_invested, 0)
    const comparableHoldings = holdings.filter(holding => typeof holding.gain_loss === 'number')
    const comparableInvested = comparableHoldings.reduce((sum, holding) => sum + holding.net_invested, 0)
    const totalGainLoss = comparableHoldings.reduce((sum, holding) => sum + Number(holding.gain_loss), 0)
    const uniqueWarnings = [...new Set(warnings)]
    return {
      as_of: new Date().toISOString(), currency, total_value: round(total), total_invested: round(totalInvested),
      total_gain_loss: round(totalGainLoss), total_gain_loss_percent: comparableInvested > 0 ? round(totalGainLoss / comparableInvested * 100) : null,
      gain_loss_coverage: { holdings_with_cost_basis: comparableHoldings.length, holdings_total: holdings.length, comparable_invested: round(comparableInvested) },
      holdings: withAllocation, warnings: uniqueWarnings, valuation_status: uniqueWarnings.length ? 'partial' : 'complete',
    }
  }

  async investmentActivity(args: Record<string, unknown>) {
    const startDate = optionalDate(args.start_date, 'start_date')
    const endDate = optionalDate(args.end_date, 'end_date')
    if (startDate && endDate) assertDateRange(startDate, endDate)
    const accountIds = stringArray(args.account_ids, 'account_ids')
    const transactionType = args.type === undefined ? undefined : enumValue(args.type, ['buy', 'sell'] as const, 'buy', 'type')
    const limit = clampLimit(args.limit)
    const offset = decodeCursor(args.cursor)
    const clauses: string[] = []
    const values: (string | number)[] = []
    if (startDate) { clauses.push('it.date >= ?'); values.push(startDate) }
    if (endDate) { clauses.push('it.date <= ?'); values.push(endDate) }
    if (accountIds?.length) { clauses.push(`it.account_id IN (${accountIds.map(() => '?').join(',')})`); values.push(...accountIds) }
    if (transactionType) { clauses.push('it.type = ?'); values.push(transactionType) }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const query = `SELECT it.*, a.name AS account_name, a.symbol AS account_symbol, a.asset_type AS account_asset_type, a.currency AS account_currency FROM investment_transactions it JOIN accounts a ON a.id = it.account_id ${where} ORDER BY it.date DESC, it.rowid DESC LIMIT ? OFFSET ?`
    const rows = (await this.env.DB.prepare(query).bind(...values, limit + 1, offset).all<Record<string, unknown>>()).results
    const hasMore = rows.length > limit
    return {
      as_of: new Date().toISOString(),
      filters: { start_date: startDate || null, end_date: endDate || null, account_ids: accountIds || [], type: transactionType || null },
      activities: rows.slice(0, limit).map(row => ({ ...row, transaction_currency: row.account_asset_type === 'manual' ? row.account_currency : 'USD', notes_are_untrusted_data: true })),
      pagination: { limit, returned: Math.min(limit, rows.length), next_cursor: hasMore ? encodeCursor(offset + limit) : null, truncated: hasMore },
      currency_note: 'Market-priced investment transactions are recorded in USD by the current Finance Manager UI; manual assets use their account currency.',
    }
  }
}
