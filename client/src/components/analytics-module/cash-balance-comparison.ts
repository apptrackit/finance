import { addDays, endOfMonth, format, getDaysInMonth, parseISO, startOfMonth, subMonths } from 'date-fns'
import { convertCurrency } from '../../../../shared/currency'
import type { Account, Transaction } from './types'

export type CashBalanceComparisonPoint = {
  day: number
  selectedDate: string | null
  previousDate: string | null
  selected: number | null
  previous: number | null
}

export type CashBalanceComparison = {
  selectedMonth: string
  previousMonth: string
  points: CashBalanceComparisonPoint[]
  unavailableReason: string | null
}

export function comparisonDelta(selected: number | null, previous: number | null) {
  if (selected === null || previous === null) return null
  const amount = selected - previous
  return { amount, percentage: previous > 0 ? amount / previous * 100 : null }
}

// The caller supplies complete posted history and current account balances.
// There is no durable opening-date history: never claim coverage before the
// earliest posted cash record, even though reverse reconstruction is possible.
export function buildCashBalanceMonthComparison({
  accounts, transactions, selectedMonth, today, masterCurrency, exchangeRates,
}: {
  accounts: Account[]
  transactions: Transaction[]
  selectedMonth: string
  today: string
  masterCurrency: string
  exchangeRates: Record<string, number>
}): CashBalanceComparison {
  const selectedStart = startOfMonth(parseISO(selectedMonth))
  const previousStart = subMonths(selectedStart, 1)
  const previousMonth = format(previousStart, 'yyyy-MM-dd')
  const result: CashBalanceComparison = {
    selectedMonth: format(selectedStart, 'yyyy-MM-dd'), previousMonth,
    points: [], unavailableReason: null,
  }
  if (result.selectedMonth > today) {
    return { ...result, unavailableReason: 'Comparison is available for current and past months only.' }
  }

  const cashAccounts = accounts.filter(account => account.type !== 'investment' && !account.exclude_from_cash_balance)
  const accountById = new Map(cashAccounts.map(account => [account.id, account]))
  const posted = transactions.filter(transaction => accountById.has(transaction.account_id)
    && (transaction.status === undefined || transaction.status === 'posted') && transaction.date <= today)
  const firstDate = posted.reduce<string | null>((first, transaction) =>
    first === null || transaction.date < first ? transaction.date : first, null)
  if (firstDate === null || firstDate > previousMonth) {
    return { ...result, unavailableReason: 'Not enough cash history to cover the full previous month.' }
  }

  let balance = 0
  for (const account of cashAccounts) {
    const converted = convertCurrency(account.balance, account.currency, masterCurrency, exchangeRates).value
    if (converted === null) return { ...result, unavailableReason: 'Comparison is unavailable until exchange rates recover.' }
    balance += converted
  }
  const movements = new Map<string, number>()
  for (const transaction of posted) {
    const account = accountById.get(transaction.account_id)!
    const amount = convertCurrency(transaction.amount, account.currency, masterCurrency, exchangeRates).value
    if (amount === null) return { ...result, unavailableReason: 'Comparison is unavailable until exchange rates recover.' }
    movements.set(transaction.date, (movements.get(transaction.date) ?? 0) + amount)
  }

  const end = [format(endOfMonth(selectedStart), 'yyyy-MM-dd'), today].sort()[0]
  for (const [date, amount] of movements) {
    if (date > end) balance -= amount
  }
  const balances = new Map<string, number>()
  // At most two months are expanded, regardless of the ledger's age.
  for (let date = parseISO(end); format(date, 'yyyy-MM-dd') >= previousMonth; date = addDays(date, -1)) {
    const key = format(date, 'yyyy-MM-dd')
    balances.set(key, balance)
    balance -= movements.get(key) ?? 0
  }

  const selectedDays = getDaysInMonth(selectedStart)
  const previousDays = getDaysInMonth(previousStart)
  result.points = Array.from({ length: Math.max(selectedDays, previousDays) }, (_, index) => {
    const day = index + 1
    const selectedDate = day <= selectedDays ? format(addDays(selectedStart, index), 'yyyy-MM-dd') : null
    const previousDate = day <= previousDays ? format(addDays(previousStart, index), 'yyyy-MM-dd') : null
    return {
      day, selectedDate, previousDate,
      selected: selectedDate === null ? null : balances.get(selectedDate) ?? null,
      previous: previousDate === null ? null : balances.get(previousDate) ?? null,
    }
  })
  return result
}
