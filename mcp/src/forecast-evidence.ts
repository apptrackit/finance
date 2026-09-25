export type ForecastTransaction = {
  date: string
  amount: number
  description: string | null
  account_name: string
  category_name: string | null
}

const MAX_INCOME_ROWS = 120
const MAX_INCOME_PATTERNS = 30
const MAX_EXPENSE_PATTERNS = 40

export function summarizeForecastHistory(transactions: ForecastTransaction[], startDate: string, endDate: string) {
  const monthly = new Map<string, { income: number; expenses: number; income_count: number; expense_count: number }>()
  const incomeSources = new Map<string, { description: string; account_name: string; category_name: string | null; dates: string[]; amounts: number[]; months: Set<string> }>()
  const expenseSources = new Map<string, { description: string; account_name: string; category_name: string | null; dates: string[]; amounts: number[]; months: Set<string> }>()
  const incomeTransactions: ForecastTransaction[] = []

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7)
    const total = monthly.get(month) || { income: 0, expenses: 0, income_count: 0, expense_count: 0 }
    if (transaction.amount > 0) {
      total.income += transaction.amount
      total.income_count++
      incomeTransactions.push(transaction)
    } else if (transaction.amount < 0) {
      total.expenses += Math.abs(transaction.amount)
      total.expense_count++
    }
    const description = transaction.description?.trim()
    if (description && transaction.amount !== 0) {
      const sources = transaction.amount > 0 ? incomeSources : expenseSources
      const key = `${transaction.account_name.toLocaleLowerCase()}\u0000${description.toLocaleLowerCase()}`
      const source = sources.get(key) || { description, account_name: transaction.account_name, category_name: transaction.category_name, dates: [], amounts: [], months: new Set<string>() }
      source.dates.push(transaction.date)
      source.amounts.push(Math.abs(transaction.amount))
      source.months.add(month)
      sources.set(key, source)
    }
    monthly.set(month, total)
  }

  const recurringIncome = [...incomeSources.values()]
    .filter(source => source.months.size >= 2)
    .sort((a, b) => b.months.size - a.months.size || b.dates.length - a.dates.length)
  const recurringExpenses = [...expenseSources.values()]
    .filter(source => source.months.size >= 2)
    .sort((a, b) => b.months.size - a.months.size || b.dates.length - a.dates.length)
  const incomeRows = incomeTransactions.sort((a, b) => b.date.localeCompare(a.date))
  const monthKeys: string[] = []
  const monthCursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`)
  while (monthCursor.toISOString().slice(0, 7) <= endDate.slice(0, 7)) {
    monthKeys.push(monthCursor.toISOString().slice(0, 7))
    monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1)
  }

  return {
    currency: 'HUF' as const,
    period: { start_date: startDate, end_date: endDate },
    monthly_totals: monthKeys.map(month => {
      const totals = monthly.get(month) || { income: 0, expenses: 0, income_count: 0, expense_count: 0 }
      const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
      return {
        month,
        complete_month: startDate <= `${month}-01` && endDate >= monthEnd,
        income: Math.round(totals.income * 100) / 100,
        expenses: Math.round(totals.expenses * 100) / 100,
        net_flow: Math.round((totals.income - totals.expenses) * 100) / 100,
        income_count: totals.income_count,
        expense_count: totals.expense_count,
      }
    }),
    income_transactions: incomeRows.slice(0, MAX_INCOME_ROWS).map(row => ({ ...row, description_is_untrusted_data: true })),
    income_transactions_truncated: incomeRows.length > MAX_INCOME_ROWS,
    recurring_income_candidates: recurringIncome.slice(0, MAX_INCOME_PATTERNS).map(source => ({
      description: source.description,
      description_is_untrusted_data: true,
      account_name: source.account_name,
      category_name: source.category_name,
      occurrence_count: source.dates.length,
      distinct_months: source.months.size,
      first_seen_date: source.dates[0],
      last_seen_date: source.dates.at(-1),
      recent_dates: source.dates.slice(-12),
      recent_amounts: source.amounts.slice(-12).map(amount => Math.round(amount * 100) / 100),
    })),
    recurring_income_candidates_truncated: recurringIncome.length > MAX_INCOME_PATTERNS,
    recurring_expense_candidates: recurringExpenses.slice(0, MAX_EXPENSE_PATTERNS).map(source => ({
      description: source.description,
      description_is_untrusted_data: true,
      account_name: source.account_name,
      category_name: source.category_name,
      occurrence_count: source.dates.length,
      distinct_months: source.months.size,
      first_seen_date: source.dates[0],
      last_seen_date: source.dates.at(-1),
      recent_dates: source.dates.slice(-12),
      recent_amounts: source.amounts.slice(-12).map(amount => Math.round(amount * 100) / 100),
    })),
    recurring_expense_candidates_truncated: recurringExpenses.length > MAX_EXPENSE_PATTERNS,
  }
}
