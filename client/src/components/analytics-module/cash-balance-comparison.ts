import { addDays, endOfMonth, endOfYear, format, getDaysInMonth, parseISO, startOfMonth, startOfYear, subMonths, subYears } from 'date-fns'
import { convertCurrency } from '../../../../shared/currency'
import type { Account, Transaction } from './types'

export type CashBalanceComparisonPoint = {
  day: number
  selectedDate: string | null
  previousDate: string | null
  selected: number | null
  previous: number | null
}

export type CashBalanceComparisonUnit = 'month' | 'year'

export type CashBalanceComparison = {
  unit: CashBalanceComparisonUnit
  selectedStart: string
  previousStart: string
  points: CashBalanceComparisonPoint[]
  unavailableReason: string | null
}

export function comparisonDelta(selected: number | null, previous: number | null) {
  if (selected === null || previous === null) return null
  const amount = selected - previous
  return { amount, percentage: previous > 0 ? amount / previous * 100 : null }
}

type ComparisonInput = {
  accounts: Account[]
  transactions: Transaction[]
  today: string
  masterCurrency: string
  exchangeRates: Record<string, number>
}

export const buildCashBalanceMonthComparison = ({ selectedMonth, ...input }: ComparisonInput & { selectedMonth: string }) =>
  buildCashBalanceComparison({ ...input, unit: 'month', selectedDate: selectedMonth })

export const buildCashBalanceYearComparison = ({ selectedYear, ...input }: ComparisonInput & { selectedYear: string }) =>
  buildCashBalanceComparison({ ...input, unit: 'year', selectedDate: selectedYear })

// Calendar slots shared by both periods: day N of the month, or the same
// month/day of the year. A slot missing from one period (the 31st, Feb 29)
// has a null date on that side.
function comparisonSlots(unit: CashBalanceComparisonUnit, selectedStart: Date, previousStart: Date) {
  const slots: { selectedDate: string | null; previousDate: string | null }[] = []
  const months = unit === 'month' ? 1 : 12
  for (let month = 0; month < months; month++) {
    const selectedMonth = new Date(selectedStart.getFullYear(), selectedStart.getMonth() + month, 1)
    const previousMonth = new Date(previousStart.getFullYear(), previousStart.getMonth() + month, 1)
    const selectedDays = getDaysInMonth(selectedMonth), previousDays = getDaysInMonth(previousMonth)
    for (let day = 1; day <= Math.max(selectedDays, previousDays); day++) slots.push({
      selectedDate: day <= selectedDays ? format(addDays(selectedMonth, day - 1), 'yyyy-MM-dd') : null,
      previousDate: day <= previousDays ? format(addDays(previousMonth, day - 1), 'yyyy-MM-dd') : null,
    })
  }
  return slots
}

// The caller supplies complete posted history and current account balances.
// There is no durable opening-date history: never claim coverage before the
// earliest posted cash record, even though reverse reconstruction is possible.
export function buildCashBalanceComparison({
  accounts, transactions, unit, selectedDate, today, masterCurrency, exchangeRates,
}: ComparisonInput & { unit: CashBalanceComparisonUnit; selectedDate: string }): CashBalanceComparison {
  const selectedStart = unit === 'month' ? startOfMonth(parseISO(selectedDate)) : startOfYear(parseISO(selectedDate))
  const previousStart = unit === 'month' ? subMonths(selectedStart, 1) : subYears(selectedStart, 1)
  const previousKey = format(previousStart, 'yyyy-MM-dd')
  const result: CashBalanceComparison = {
    unit, selectedStart: format(selectedStart, 'yyyy-MM-dd'), previousStart: previousKey,
    points: [], unavailableReason: null,
  }
  if (result.selectedStart > today) {
    return { ...result, unavailableReason: `Comparison is available for current and past ${unit}s only.` }
  }

  const cashAccounts = accounts.filter(account => account.type !== 'investment' && !account.exclude_from_cash_balance)
  const accountById = new Map(cashAccounts.map(account => [account.id, account]))
  const posted = transactions.filter(transaction => accountById.has(transaction.account_id)
    && (transaction.status === undefined || transaction.status === 'posted') && transaction.date <= today)
  const firstDate = posted.reduce<string | null>((first, transaction) =>
    first === null || transaction.date < first ? transaction.date : first, null)
  if (firstDate === null || firstDate > previousKey) {
    return { ...result, unavailableReason: `Not enough cash history to cover the full previous ${unit}.` }
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

  const periodEnd = unit === 'month' ? endOfMonth(selectedStart) : endOfYear(selectedStart)
  const end = [format(periodEnd, 'yyyy-MM-dd'), today].sort()[0]
  for (const [date, amount] of movements) {
    if (date > end) balance -= amount
  }
  const balances = new Map<string, number>()
  // At most two periods are expanded, regardless of the ledger's age.
  for (let date = parseISO(end); format(date, 'yyyy-MM-dd') >= previousKey; date = addDays(date, -1)) {
    const key = format(date, 'yyyy-MM-dd')
    balances.set(key, balance)
    balance -= movements.get(key) ?? 0
  }

  result.points = comparisonSlots(unit, selectedStart, previousStart).map(({ selectedDate, previousDate }, index) => ({
    day: index + 1, selectedDate, previousDate,
    selected: selectedDate === null ? null : balances.get(selectedDate) ?? null,
    previous: previousDate === null ? null : balances.get(previousDate) ?? null,
  }))
  return result
}
