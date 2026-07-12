import type { AccountRow, BudgetRow, CategoryRow, Env, InvestmentTransactionRow, RecurringScheduleRow, TransactionRow } from './types'
import { addUtcDays, daysBetween, periodEndDates, recurringDates } from './date-series'
import { assertDate, assertDateRange, clampLimit, decodeCursor, defaultMonthRange, encodeCursor, enumValue, optionalDate, previousRange, stringArray } from './validation'

type Rates = { values: Record<string, number>; available: boolean }

function bool(value: number | boolean | undefined) {
  return value === true || value === 1
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function inScope(account: AccountRow, budget: any) {
  if (budget.account_scope === 'all' && account.type === 'investment') return false
  if (budget.account_scope === 'cash' && account.type !== 'cash') return false
  if (budget.account_scope === 'selected' && !budget.account_ids.includes(account.id)) return false
  return true
}

export class FinanceService {
  constructor(private env: Env) {}

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

  async listDimensions() {
    const [accounts, categories, range] = await Promise.all([
      this.accounts(), this.categories(),
      this.env.DB.prepare("SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM transactions WHERE status = 'posted'")
        .first<{ min_date?: string; max_date?: string }>(),
    ])
    return {
      as_of: new Date().toISOString(),
      default_currency: 'HUF',
      supported_currencies: ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'RON'],
      available_date_range: { start_date: range?.min_date || null, end_date: range?.max_date || null },
      accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, excluded_from_net_worth: bool(a.exclude_from_net_worth), excluded_from_cash_balance: bool(a.exclude_from_cash_balance), locked: bool(a.is_locked) })),
      categories,
      semantics: {
        posted_transactions_affect_balances: true,
        pending_transactions_are_projected_only: true,
        linked_transactions_are_transfers: true,
        investment_account_balance_meaning: 'quantity for market-priced assets; monetary balance for manual assets',
      },
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
      const convertedBalance = isInvestment ? null : round(this.convert(account.balance, account.currency, currency, rates))
      if (!isInvestment && !bool(account.exclude_from_cash_balance)) cashTotal += convertedBalance || 0
      if (!isInvestment && !bool(account.exclude_from_net_worth)) nonInvestmentNetWorth += convertedBalance || 0
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
      transactions: results.slice(0, limit).map(row => ({ ...row, is_transfer: Boolean(row.linked_transaction_id), description_is_untrusted_data: true })),
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
      includeProjected ? this.env.DB.prepare("SELECT * FROM transactions WHERE status = 'pending' AND date >= ? AND date <= ? ORDER BY date").bind(startDate, endDate).all<TransactionRow>() : Promise.resolve({ results: [] as TransactionRow[] }),
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

  async balanceTrend(args: Record<string, unknown>) {
    const startDate = assertDate(args.start_date, 'start_date')
    const endDate = assertDate(args.end_date, 'end_date')
    const days = assertDateRange(startDate, endDate)
    const interval = enumValue(args.interval, ['day', 'week', 'month'] as const, days > 400 ? 'month' : days > 120 ? 'week' : 'day', 'interval')
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const includeAccounts = args.include_accounts === true
    const [allAccounts, transactions, rates] = await Promise.all([this.accounts(), this.postedAfter(startDate), this.rates(currency)])
    const accounts = allAccounts.filter(account => account.type !== 'investment')
    const accountIds = new Set(accounts.map(account => account.id))
    const relevantTransactions = transactions.filter(transaction => accountIds.has(transaction.account_id))
    const warnings = this.conversionWarnings(accounts, currency, rates)
    const points = periodEndDates(startDate, endDate, interval)
    const series = points.map(date => {
      let cashBalance = 0
      let netWorth = 0
      const accountBalances = []
      for (const account of accounts) {
        const laterChange = relevantTransactions
          .filter(transaction => transaction.account_id === account.id && transaction.date > date)
          .reduce((sum, transaction) => sum + transaction.amount, 0)
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

  async budgetStatus(args: Record<string, unknown>) {
    const asOf = optionalDate(args.as_of, 'as_of') || new Date().toISOString().slice(0, 10)
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const includeInactive = args.include_inactive === true
    const [accounts, categories, budgetRows, rates] = await Promise.all([
      this.accounts(), this.categories(), this.env.DB.prepare('SELECT * FROM budgets ORDER BY start_date DESC').all<BudgetRow>(), this.rates(currency),
    ])
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const rateCache = new Map<string, Rates>([[currency, rates]])
    const budgets = []
    for (const budget of budgetRows.results) {
      if (!includeInactive && (asOf < budget.start_date || asOf > budget.end_date)) continue
      const budgetCurrency = String(budget.currency || currency).toUpperCase()
      let budgetRates = rateCache.get(budgetCurrency)
      if (!budgetRates) {
        budgetRates = await this.rates(budgetCurrency)
        rateCache.set(budgetCurrency, budgetRates)
      }
      const spendEndDate = asOf < budget.start_date ? null : (asOf < budget.end_date ? asOf : budget.end_date)
      const pendingStartDate = asOf > budget.start_date ? asOf : budget.start_date
      const [accountIds, categoryIds, transactions, pending] = await Promise.all([
        this.env.DB.prepare('SELECT account_id FROM budget_accounts WHERE budget_id = ?').bind(budget.id).all<{ account_id: string }>(),
        this.env.DB.prepare('SELECT category_id FROM budget_categories WHERE budget_id = ?').bind(budget.id).all<{ category_id: string }>(),
        spendEndDate ? this.postedBetween(budget.start_date, spendEndDate) : Promise.resolve([] as TransactionRow[]),
        this.env.DB.prepare("SELECT * FROM transactions WHERE status = 'pending' AND date >= ? AND date <= ? ORDER BY date").bind(pendingStartDate, budget.end_date).all<TransactionRow>(),
      ])
      const scopedBudget = { ...budget, account_ids: accountIds.results.map(row => row.account_id), category_ids: categoryIds.results.map(row => row.category_id) }
      let spent = 0
      for (const transaction of transactions) {
        const account = accountMap.get(transaction.account_id)
        if (!account || transaction.amount >= 0 || transaction.linked_transaction_id || !inScope(account, scopedBudget)) continue
        if (budget.category_scope === 'selected' && !scopedBudget.category_ids.includes(transaction.category_id || '')) continue
        spent += Math.abs(this.convert(transaction.amount, account.currency, budgetCurrency, budgetRates))
      }
      let pendingSpend = 0
      for (const transaction of pending.results) {
        const account = accountMap.get(transaction.account_id)
        if (!account || transaction.amount >= 0 || transaction.linked_transaction_id || !inScope(account, scopedBudget)) continue
        if (budget.category_scope === 'selected' && !scopedBudget.category_ids.includes(transaction.category_id || '')) continue
        pendingSpend += Math.abs(this.convert(transaction.amount, account.currency, budgetCurrency, budgetRates))
      }
      const totalDays = daysBetween(budget.start_date, budget.end_date)
      const elapsedDays = asOf < budget.start_date ? 0 : Math.min(totalDays, daysBetween(budget.start_date, asOf > budget.end_date ? budget.end_date : asOf))
      const paceForecast = elapsedDays ? spent / elapsedDays * totalDays : 0
      const forecastSpend = Math.max(spent + pendingSpend, paceForecast)
      const riskStatus = spent > budget.amount ? 'exceeded' : forecastSpend > budget.amount ? 'at_risk' : asOf < budget.start_date ? 'upcoming' : asOf > budget.end_date ? 'ended' : 'on_track'
      const scopedAccounts = accounts.filter(account => inScope(account, scopedBudget))
      const budgetWarnings = this.conversionWarnings(scopedAccounts, budgetCurrency, budgetRates)
      budgets.push({
        id: budget.id, name: budget.name || null, period: budget.period, start_date: budget.start_date, end_date: budget.end_date,
        currency: budgetCurrency, amount: budget.amount, spent: round(spent), pending_spend: round(pendingSpend), forecast_spend: round(forecastSpend),
        remaining: round(budget.amount - spent), utilization_percent: budget.amount ? round(spent / budget.amount * 100) : 0,
        forecast_utilization_percent: budget.amount ? round(forecastSpend / budget.amount * 100) : 0, risk_status: riskStatus,
        days_elapsed: elapsedDays, days_total: totalDays,
        account_scope: budget.account_scope, account_ids: scopedBudget.account_ids,
        account_names: scopedAccounts.map(account => account.name), category_scope: budget.category_scope, category_ids: scopedBudget.category_ids,
        category_names: scopedBudget.category_ids.map(id => categoryMap.get(id)?.name).filter(Boolean),
        conversion_status: budgetWarnings.length ? 'partial' : 'complete', warnings: budgetWarnings,
      })
    }
    return {
      as_of: new Date().toISOString(), evaluated_on: asOf, default_currency_for_legacy_budgets: currency,
      budgets, include_inactive: includeInactive,
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
      this.env.DB.prepare("SELECT * FROM transactions WHERE status = 'pending' AND date >= ? AND date <= ? ORDER BY date ASC, rowid DESC LIMIT 101").bind(startDate, endDate).all<TransactionRow>(),
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

  async spendingForecast(args: Record<string, unknown>) {
    const asOf = optionalDate(args.as_of, 'as_of') || new Date().toISOString().slice(0, 10)
    const period = enumValue(args.period, ['week', 'month'] as const, 'month', 'period')
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const categoryIds = stringArray(args.category_ids, 'category_ids')
    const requestedLookback = args.lookback_periods === undefined ? (period === 'month' ? 6 : 12) : args.lookback_periods
    if (typeof requestedLookback !== 'number' || !Number.isInteger(requestedLookback) || requestedLookback < 1 || requestedLookback > 24) throw new Error('lookback_periods must be an integer from 1 to 24')
    const asOfDate = new Date(`${asOf}T00:00:00Z`)
    const currentStartDate = period === 'month'
      ? new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), 1))
      : new Date(asOfDate.getTime() - ((asOfDate.getUTCDay() + 6) % 7) * 86_400_000)
    const currentEndDate = period === 'month'
      ? new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() + 1, 0))
      : new Date(currentStartDate.getTime() + 6 * 86_400_000)
    const ranges: Array<{ start: string; end: string }> = []
    for (let index = requestedLookback; index >= 1; index--) {
      if (period === 'month') {
        const start = new Date(Date.UTC(currentStartDate.getUTCFullYear(), currentStartDate.getUTCMonth() - index, 1))
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
        ranges.push({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) })
      } else {
        const start = new Date(currentStartDate.getTime() - index * 7 * 86_400_000)
        ranges.push({ start: start.toISOString().slice(0, 10), end: new Date(start.getTime() + 6 * 86_400_000).toISOString().slice(0, 10) })
      }
    }
    const earliest = ranges[0].start
    const [accounts, categories, transactions, pending, schedules, rates] = await Promise.all([
      this.accounts(), this.categories(), this.postedBetween(earliest, asOf),
      this.env.DB.prepare("SELECT * FROM transactions WHERE status = 'pending' AND date > ? AND date <= ? ORDER BY date").bind(asOf, currentEndDate.toISOString().slice(0, 10)).all<TransactionRow>(),
      this.env.DB.prepare('SELECT * FROM recurring_schedules WHERE is_active = 1').all<RecurringScheduleRow>(),
      this.rates(currency),
    ])
    const accountMap = new Map(accounts.map(account => [account.id, account]))
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const qualifies = (transaction: TransactionRow) => {
      const account = accountMap.get(transaction.account_id)
      return Boolean(account && account.type !== 'investment' && transaction.amount < 0 && !transaction.linked_transaction_id && !bool(transaction.exclude_from_estimate) && (!categoryIds?.length || (transaction.category_id && categoryIds.includes(transaction.category_id))))
    }
    const convertedExpense = (transaction: TransactionRow) => {
      const account = accountMap.get(transaction.account_id)!
      return Math.abs(this.convert(transaction.amount, account.currency, currency, rates))
    }
    const history = ranges.map(range => {
      const matching = transactions.filter(transaction => qualifies(transaction) && transaction.date >= range.start && transaction.date <= range.end)
      return { ...range, amount: round(matching.reduce((sum, transaction) => sum + convertedExpense(transaction), 0)), transaction_count: matching.length }
    })
    const currentStart = currentStartDate.toISOString().slice(0, 10)
    const currentTransactions = transactions.filter(transaction => qualifies(transaction) && transaction.date >= currentStart && transaction.date <= asOf)
    const currentActual = currentTransactions.reduce((sum, transaction) => sum + convertedExpense(transaction), 0)
    const historicalAverage = history.reduce((sum, item) => sum + item.amount, 0) / history.length
    const elapsedDays = daysBetween(currentStart, asOf)
    const totalDays = daysBetween(currentStart, currentEndDate.toISOString().slice(0, 10))
    const runRateProjection = elapsedDays ? currentActual / elapsedDays * totalDays : 0
    let knownUpcoming = pending.results.filter(qualifies).reduce((sum, transaction) => sum + convertedExpense(transaction), 0)
    for (const schedule of schedules.results) {
      if (schedule.type !== 'transaction' || schedule.amount >= 0 || (categoryIds?.length && (!schedule.category_id || !categoryIds.includes(schedule.category_id)))) continue
      const account = accountMap.get(schedule.account_id)
      if (!account || account.type === 'investment') continue
      const occurrences = recurringDates(schedule, addUtcDays(asOf, 1), currentEndDate.toISOString().slice(0, 10), 100)
      knownUpcoming += occurrences.length * Math.abs(this.convert(schedule.amount, account.currency, currency, rates))
    }
    const planningEstimate = Math.max(currentActual, historicalAverage, runRateProjection, currentActual + knownUpcoming)
    const categoryTotals = new Map<string, number>()
    for (const transaction of transactions.filter(transaction => qualifies(transaction) && transaction.date < currentStart)) {
      const key = transaction.category_id || 'uncategorized'
      categoryTotals.set(key, (categoryTotals.get(key) || 0) + convertedExpense(transaction))
    }
    const categoryBreakdown = [...categoryTotals.entries()].map(([id, amount]) => ({ category_id: id, category_name: categoryMap.get(id)?.name || 'Uncategorized', historical_average: round(amount / history.length) })).sort((a, b) => b.historical_average - a.historical_average)
    const periodsWithData = history.filter(item => item.transaction_count > 0).length
    const warnings = this.conversionWarnings(accounts.filter(account => account.type !== 'investment'), currency, rates)
    return {
      as_of: new Date().toISOString(), evaluated_on: asOf, period, currency,
      current_period: { start_date: currentStart, end_date: currentEndDate.toISOString().slice(0, 10), actual_to_date: round(currentActual), elapsed_days: elapsedDays, total_days: totalDays },
      forecast: { planning_estimate: round(planningEstimate), historical_average: round(historicalAverage), run_rate_projection: round(runRateProjection), known_upcoming_expenses: round(knownUpcoming), confidence_percent: round(periodsWithData / history.length * 100) },
      history, category_breakdown: categoryBreakdown, filters: { category_ids: categoryIds || [], exclude_from_estimate_respected: true },
      conversion_status: warnings.length ? 'partial' : 'complete', warnings,
      methodology: 'Planning estimate is the maximum of actual spend, historical average, current run rate, and actual plus known upcoming expenses.',
    }
  }

  async budgetsAndRecurring(args: Record<string, unknown>) {
    const [budgets, recurring] = await Promise.all([this.budgetStatus(args), this.recurringForecast(args)])
    return { as_of: new Date().toISOString(), budgets, recurring, deprecated: 'Use get_budget_status and get_recurring_forecast for focused results.' }
  }

  async portfolio(args: Record<string, unknown>) {
    const currency = typeof args.currency === 'string' ? args.currency.toUpperCase() : 'HUF'
    const [accounts, rates, activity] = await Promise.all([
      this.accounts(), this.rates(currency),
      this.env.DB.prepare('SELECT * FROM investment_transactions ORDER BY date ASC, rowid ASC').all<InvestmentTransactionRow>(),
    ])
    const investmentAccounts = accounts.filter(item => item.type === 'investment' && !bool(item.exclude_from_net_worth))
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
        try {
          const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(account.symbol)}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
          const data = await response.json<any>()
          const meta = data?.chart?.result?.[0]?.meta
          if (!response.ok || !meta?.regularMarketPrice) throw new Error()
          nativeValue = account.balance * meta.regularMarketPrice
          quote = { price: meta.regularMarketPrice, currency: meta.currency || 'USD', market_state: meta.marketState || null }
          const quoteCurrency = String(meta.currency || 'USD')
          const converted = this.convert(nativeValue, quoteCurrency, currency, rates)
          if (quoteCurrency !== currency && !rates.values[quoteCurrency]) warnings.push(`Exchange rate unavailable for ${quoteCurrency}; ${account.symbol} was excluded from ${currency} totals`)
          total += converted
          holdings.push({ account_id: account.id, name: account.name, symbol: account.symbol, asset_type: account.asset_type, quantity: account.balance, activity_quantity: round(activityQuantity), native_value: round(nativeValue), native_currency: meta.currency || 'USD', value: round(converted), currency, native_net_invested: round(nativeNetInvested), investment_currency: investmentCurrency, net_invested: round(netInvested), gain_loss: round(converted - netInvested), gain_loss_percent: netInvested > 0 ? round((converted - netInvested) / netInvested * 100) : null, quote })
          continue
        } catch {
          warnings.push(`Live quote unavailable for ${account.symbol}`)
          nativeValue = 0
        }
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
