import { useEffect, useState, useCallback } from 'react'
import { API_BASE_URL, apiFetch } from '../config'
import { useLoadableData } from './useLoadableData'
import type { PendingKind, ReviewSource } from '../lib/transaction-review'

export type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  quote_currency?: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  is_locked?: boolean
  updated_at: number
}

export type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  price?: number
  description?: string
  date: string
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  status?: 'posted' | 'pending' | 'cancelled'
  pending_kind?: PendingKind | null
  review_source?: ReviewSource | null
  review_batch_id?: string | null
  review_flags?: unknown
  confirmed_at?: number | null
  cancelled_at?: number | null
  created_at?: number | null
  updated_at?: number | null
}

const formatInvestmentTransactionDescription = (transaction: InvestmentTransaction) => {
  const price = Number(transaction.price)
  const fallback = `${transaction.quantity} shares @ ${Number.isFinite(price) ? price : ''}`.trim()
  const notes = transaction.notes as string | undefined

  // Older investment transfers recorded the cash-to-share FX rate in their
  // note. Show the stored purchase price instead; the rate is not the price
  // per share and rounds down to 0.0000 for HUF purchases.
  if (notes?.startsWith('Transfer from ') && Number.isFinite(price) && price > 0) {
    const source = notes.replace(/\s*\([^)]*\)/, '')
    const noteSuffix = source.match(/\s-\s.*$/)?.[0] || ''
    const sourceName = source.replace(/\s-\s.*$/, '').trim()
    return `${sourceName} (${transaction.quantity} shares @ ${price.toFixed(2)}/share)${noteSuffix}`
  }

  return notes || fallback
}

const mapInvestmentTransaction = (transaction: InvestmentTransaction) => ({
  id: transaction.id,
  account_id: transaction.account_id,
  amount: transaction.type === 'buy' ? transaction.total_amount : -transaction.total_amount,
  quantity: transaction.type === 'buy' ? transaction.quantity : -transaction.quantity,
  price: transaction.price,
  description: formatInvestmentTransactionDescription(transaction),
  date: transaction.date,
  is_recurring: false,
  category_id: undefined,
  linked_transaction_id: undefined,
  created_at: transaction.created_at,
  updated_at: transaction.updated_at ?? transaction.created_at,
})

export type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isAccount = (value: unknown): value is Account => isRecord(value)
  && typeof value.id === 'string' && typeof value.name === 'string'
  && (value.type === 'cash' || value.type === 'investment')
  && isNumber(value.balance) && typeof value.currency === 'string'
const isTransaction = (value: unknown): value is Transaction => isRecord(value)
  && typeof value.id === 'string' && typeof value.account_id === 'string'
  && isNumber(value.amount) && typeof value.date === 'string'
const isCategory = (value: unknown): value is Category => isRecord(value)
  && typeof value.id === 'string' && typeof value.name === 'string'
  && (value.type === 'income' || value.type === 'expense')

type InvestmentTransaction = {
  id: string
  account_id: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
  created_at?: number
  updated_at?: number
}
const isInvestmentTransaction = (value: unknown): value is InvestmentTransaction => isRecord(value)
  && typeof value.id === 'string' && typeof value.account_id === 'string'
  && (value.type === 'buy' || value.type === 'sell') && typeof value.date === 'string'
  && isNumber(value.quantity) && isNumber(value.price) && isNumber(value.total_amount)
  && (value.notes == null || typeof value.notes === 'string')

const readJson = async (url: string): Promise<unknown> => {
  const response = await apiFetch(url, { throwOnError: true })
  return response.json()
}

const readArray = async <T,>(url: string, validate: (value: unknown) => value is T): Promise<T[]> => {
  const data = await readJson(url)
  if (!Array.isArray(data) || !data.every(validate)) throw new Error('Invalid response')
  return data
}

const readExchangeRates = async (currency: string): Promise<Record<string, number>> => {
  const response = await fetch(`https://open.er-api.com/v6/latest/${currency}`)
  if (!response.ok) throw new Error('Exchange rates unavailable')
  const data: unknown = await response.json()
  if (!isRecord(data) || !isRecord(data.rates) || !isNumber(data.rates[currency])
    || !Object.values(data.rates).every(rate => isNumber(rate) && rate > 0)) {
    throw new Error('Invalid exchange rates')
  }
  return data.rates as Record<string, number>
}

// A history snapshot is complete only when both cash and investment reads
// succeed. Never publish a ledger with a failed account's history omitted.
const readHistory = async (accountsPromise: Promise<Account[]>, range?: { startDate: string; endDate: string }) => {
  const regularPromise = readArray(
    range ? `${API_BASE_URL}/transactions/date-range?startDate=${range.startDate}&endDate=${range.endDate}`
      : `${API_BASE_URL}/transactions`, isTransaction)
  const investmentPromise = accountsPromise.then(accounts => Promise.all(accounts
    .filter(account => account.type === 'investment')
    .map(account => readArray(`${API_BASE_URL}/investment-transactions?account_id=${account.id}`, isInvestmentTransaction))))
  const [regular, investment] = await Promise.all([regularPromise, investmentPromise])
  const investmentRows = investment.flat()
    .filter(transaction => !range || (transaction.date >= range.startDate && transaction.date <= range.endDate))
    .map(mapInvestmentTransaction)
  return [...regular, ...investmentRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function useFinanceData(
  dateRange: { startDate: string; endDate: string },
  masterCurrency: string
) {
  const { data: accounts, status: accountsStatus, load: loadAccounts } = useLoadableData<Account[]>([])
  const { data: transactions, status: transactionsStatus, load: loadTransactions } = useLoadableData<Transaction[]>([])
  const { data: allTransactions, status: historyStatus, load: loadHistory } = useLoadableData<Transaction[]>([])
  const { data: upcomingTransactions, status: upcomingStatus, load: loadUpcoming } = useLoadableData<Transaction[]>([])
  const { data: categories, status: categoriesStatus, load: loadCategories } = useLoadableData<Category[]>([])
  const { data: netWorth, status: netWorthStatus, load: loadNetWorth } = useLoadableData<number | null>(null)
  const { data: investmentValue, status: investmentStatus, load: loadInvestmentValue } = useLoadableData(0, false)
  const { data: exchangeRates, status: ratesStatus, load: loadRates } = useLoadableData<Record<string, number>>({})
  const [investmentRefreshKey, setInvestmentRefreshKey] = useState(0)

  const fetchData = useCallback(async () => {
    setInvestmentRefreshKey(previous => previous + 1)
    const accountsPromise = readArray(`${API_BASE_URL}/accounts`, isAccount)
    await Promise.all([
      loadAccounts(() => accountsPromise),
      loadTransactions(() => readHistory(accountsPromise, dateRange)),
      loadHistory(() => readHistory(accountsPromise)),
      loadUpcoming(() => readArray(`${API_BASE_URL}/transactions/upcoming`, isTransaction)),
      loadCategories(() => readArray(`${API_BASE_URL}/categories`, isCategory)),
      loadNetWorth(async () => {
        const data = await readJson(`${API_BASE_URL}/dashboard/net-worth?currency=${masterCurrency}`)
        if (!isRecord(data) || !isNumber(data.net_worth)) throw new Error('Invalid net worth')
        return data.net_worth
      }),
      loadRates(() => readExchangeRates(masterCurrency)),
    ])
  }, [dateRange.startDate, dateRange.endDate, masterCurrency, loadAccounts, loadTransactions,
    loadHistory, loadUpcoming, loadCategories, loadNetWorth, loadRates])

  const fetchInvestmentValue = useCallback(async () => {
    await loadInvestmentValue(async () => {
      const investmentAccounts = accounts.filter(a => a.type === 'investment')
      if (investmentAccounts.length === 0) {
        return 0
      }

      const symbolsToFetch = investmentAccounts
        .filter(acc => acc.asset_type !== 'manual' && acc.symbol)
        .map(acc => acc.symbol!)
      const uniqueSymbols = [...new Set(symbolsToFetch)]

      const quotesArray = await Promise.all(uniqueSymbols.map(async symbol => {
        const data = await readJson(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
        if (!isRecord(data) || !isNumber(data.regularMarketPrice)) {
          throw new Error('Invalid market quote')
        }
        return { symbol, data: data as MarketQuote }
      }))
      const quotes: Record<string, MarketQuote> = Object.fromEntries(quotesArray.map(({ symbol, data }) => [symbol, data]))

      let totalValueInMasterCurrency = 0
      const rates = await readExchangeRates(masterCurrency)

      for (const acc of investmentAccounts) {
        let valueInAccountCurrency = 0

        if (acc.asset_type === 'manual') {
          valueInAccountCurrency = acc.balance
        } else {
          const totalQuantity = acc.balance
          const quote = acc.symbol ? quotes[acc.symbol] : null
          const quotePrice = quote?.regularMarketPrice || 0
          const quoteCurrency = (acc.quote_currency || quote?.currency || 'USD').toUpperCase()
          const valueInQuoteCurrency = quotePrice * totalQuantity

          if (quoteCurrency === masterCurrency) {
            valueInAccountCurrency = valueInQuoteCurrency
          } else {
            const masterToQuoteRate = rates[quoteCurrency]
            if (!masterToQuoteRate) throw new Error('Missing exchange rate')
            valueInAccountCurrency = valueInQuoteCurrency / masterToQuoteRate
          }
          totalValueInMasterCurrency += valueInAccountCurrency
          continue
        }

        if (acc.currency === masterCurrency) {
          totalValueInMasterCurrency += valueInAccountCurrency
        } else {
          const rate = rates[acc.currency]
          if (!rate) throw new Error('Missing exchange rate')
          totalValueInMasterCurrency += valueInAccountCurrency / rate
        }
      }

      return totalValueInMasterCurrency
    })
  }, [accounts, masterCurrency, loadInvestmentValue])

  useEffect(() => { void fetchData() }, [fetchData])
  useEffect(() => {
    if (accountsStatus.loaded) void fetchInvestmentValue()
  }, [accountsStatus.loaded, fetchInvestmentValue])

  return {
    netWorth,
    investmentValue,
    investmentLoading: investmentStatus.loading,
    investmentError: investmentStatus.error ? 'Unable to load investment value.' : null,
    accounts,
    transactions,
    allTransactions,
    upcomingTransactions,
    transactionsLoading: transactionsStatus.loading,
    allTransactionsLoading: historyStatus.loading,
    categories,
    exchangeRates,
    exchangeRatesLoading: ratesStatus.loading,
    investmentRefreshKey,
    handleDataChange: fetchData,
    fetchInvestmentValue,
    dataStatus: {
      accounts: accountsStatus,
      transactions: transactionsStatus,
      history: historyStatus,
      upcoming: upcomingStatus,
      categories: categoriesStatus,
      netWorth: netWorthStatus,
      investment: investmentStatus,
      exchangeRates: ratesStatus,
    },
  }
}
