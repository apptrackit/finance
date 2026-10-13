import { convertCurrency, sumConversions, validRates, isValidRate } from '../../../shared/currency'
import type { ConversionResult } from '../../../shared/currency'
import { accountValueForOrdering } from '../lib/account-order'
import { useEffect, useState, useCallback, useRef } from 'react'
import { API_BASE_URL, apiFetch, ApiRequestError } from '../config'
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
  archived_at?: number | null
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
  if (!isRecord(data) || !isRecord(data.rates) || !isValidRate(data.rates[currency])) {
    throw new Error('Invalid exchange rates')
  }
  return validRates(data.rates)
}

// Publish only complete snapshots. A mutation between pages invalidates the
// cursor; the normal retry refreshes accounts and history together.
const readHistory = async (accountsPromise: Promise<Account[]>, range?: { startDate: string; endDate: string }, signal?: AbortSignal) => {
  await accountsPromise
  const transactions: Transaction[] = []
  const seenCursors = new Set<string>()
  const seenRows = new Set<string>()
  let cursor: string | null = null
  let revision: number | undefined
  do {
    signal?.throwIfAborted()
    const params = new URLSearchParams({ limit: '500', ...(range ?? {}) })
    if (cursor) params.set('cursor', cursor)
    const response = await apiFetch(`${API_BASE_URL}/transactions/history?${params}`, { throwOnError: true, signal })
    const page: unknown = await response.json()
    if (!isRecord(page) || !Array.isArray(page.transactions) || !page.transactions.every(isTransaction)
      || !Array.isArray(page.investments) || !page.investments.every(isInvestmentTransaction)
      || page.transactions.length + page.investments.length > 500
      || !isNumber(page.revision) || !Number.isSafeInteger(page.revision) || page.revision < 0
      || !(page.nextCursor === null || (typeof page.nextCursor === 'string' && page.nextCursor.length > 0))) {
      throw new Error('Invalid history page')
    }
    if (revision !== undefined && revision !== page.revision) {
      throw new ApiRequestError('History changed', 409, 'HISTORY_CHANGED')
    }
    revision = page.revision
    for (const [kind, rows] of [['cash', page.transactions], ['investment', page.investments]] as const) {
      for (const row of rows) {
        const key = `${kind}:${row.id}`
        if (seenRows.has(key)) throw new Error('Duplicate history row')
        seenRows.add(key)
      }
    }
    transactions.push(...page.transactions, ...page.investments.map(mapInvestmentTransaction))
    cursor = page.nextCursor as string | null
    if (cursor) {
      if (seenCursors.has(cursor) || page.transactions.length + page.investments.length === 0) {
        throw new Error('Invalid history cursor')
      }
      seenCursors.add(cursor)
    }
  } while (cursor)
  return transactions.sort((a, b) => b.date.localeCompare(a.date))
}

export function useFinanceData(
  dateRange: { startDate: string; endDate: string },
  masterCurrency: string,
  { historyEnabled = false, dashboardEnabled = true }: { historyEnabled?: boolean; dashboardEnabled?: boolean } = {}
) {
  const { data: accounts, status: accountsStatus, load: loadAccounts } = useLoadableData<Account[]>([])
  const { data: transactions, status: transactionsStatus, load: loadTransactions, invalidate: invalidateTransactions } = useLoadableData<Transaction[]>([])
  const { data: allTransactions, status: historyStatus, load: loadHistory, invalidate: invalidateHistory } = useLoadableData<Transaction[]>([])
  const { data: upcomingTransactions, status: upcomingStatus, load: loadUpcoming } = useLoadableData<Transaction[]>([])
  const { data: categories, status: categoriesStatus, load: loadCategories } = useLoadableData<Category[]>([])
  const { data: netWorthResult, status: netWorthStatus, load: loadNetWorth } = useLoadableData<{ value: number | null; currency: string; missingCurrencies: string[] } | null>(null)
  const { data: investmentResult, status: investmentStatus, load: loadInvestmentValue } = useLoadableData<{ conversion: ConversionResult; currency: string; quotes: Record<string, MarketQuote> } | null>(null, false)
  const { data: ratesResult, status: ratesStatus, load: loadRates } = useLoadableData<{ rates: Record<string, number>; currency: string }>({ rates: {}, currency: masterCurrency })
  const [investmentRefreshKey, setInvestmentRefreshKey] = useState(0)

  const accountsRequest = useRef<Promise<Account[]>>(Promise.resolve([]))
  const periodAbort = useRef<AbortController | null>(null)
  const historyAbort = useRef<AbortController | null>(null)

  const fetchCore = useCallback(async () => {
    setInvestmentRefreshKey(previous => previous + 1)
    const accountsPromise = readArray(`${API_BASE_URL}/accounts`, isAccount)
    accountsRequest.current = accountsPromise
    await Promise.all([
      loadAccounts(() => accountsPromise),
      loadUpcoming(() => readArray(`${API_BASE_URL}/transactions/upcoming`, isTransaction)),
      loadCategories(() => readArray(`${API_BASE_URL}/categories`, isCategory)),
      loadNetWorth(async () => {
        const data = await readJson(`${API_BASE_URL}/dashboard/net-worth?currency=${masterCurrency}`)
        if (!isRecord(data) || (data.net_worth !== null && !isNumber(data.net_worth))) throw new Error('Invalid net worth')
        return { value: data.net_worth as number | null, currency: masterCurrency,
          missingCurrencies: Array.isArray(data.missing_currencies) && data.missing_currencies.every(item => typeof item === 'string') ? data.missing_currencies as string[] : [] }
      }),
      loadRates(async () => ({ rates: await readExchangeRates(masterCurrency), currency: masterCurrency })),
    ])
  }, [masterCurrency, loadAccounts, loadUpcoming, loadCategories, loadNetWorth, loadRates])

  const fetchPeriod = useCallback(async () => {
    periodAbort.current?.abort()
    const controller = new AbortController()
    periodAbort.current = controller
    await loadTransactions(() => readHistory(accountsRequest.current, dateRange, controller.signal))
  }, [dateRange.startDate, dateRange.endDate, masterCurrency, loadTransactions])

  const fetchHistory = useCallback(async () => {
    historyAbort.current?.abort()
    const controller = new AbortController()
    historyAbort.current = controller
    await loadHistory(() => readHistory(accountsRequest.current, undefined, controller.signal))
  }, [masterCurrency, loadHistory])

  const fetchData = useCallback(async () => {
    // Hidden snapshots become stale without triggering background downloads.
    periodAbort.current?.abort()
    historyAbort.current?.abort()
    invalidateTransactions()
    invalidateHistory()
    await Promise.all([fetchCore(), dashboardEnabled ? fetchPeriod() : undefined,
      historyEnabled ? fetchHistory() : undefined])
  }, [fetchCore, fetchPeriod, fetchHistory, dashboardEnabled, historyEnabled, invalidateTransactions, invalidateHistory])

  const fetchInvestmentValue = useCallback(async () => {
    await loadInvestmentValue(async () => {
      const investmentAccounts = accounts.filter(a => a.type === 'investment' && a.archived_at == null)
      if (investmentAccounts.length === 0) {
        return { conversion: sumConversions([]), currency: masterCurrency, quotes: {} }
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

      // A rate outage makes only required foreign conversions unavailable.
      // Same-currency values do not depend on the rate service.
      const rates = await readExchangeRates(masterCurrency).catch(() => ({}))
      const conversions = investmentAccounts.map(acc => {
        if (acc.asset_type === 'manual') return convertCurrency(acc.balance, acc.currency, masterCurrency, rates)
        const quote = acc.symbol ? quotes[acc.symbol] : null
        const quoteCurrency = (acc.quote_currency || quote?.currency || 'USD').toUpperCase()
        return convertCurrency((quote?.regularMarketPrice || 0) * acc.balance, quoteCurrency, masterCurrency, rates)
      })
      return { conversion: sumConversions(conversions), currency: masterCurrency, quotes }
    })
  }, [accounts, masterCurrency, loadInvestmentValue])

  useEffect(() => { void fetchCore() }, [fetchCore])
  useEffect(() => { if (dashboardEnabled) void fetchPeriod() }, [dashboardEnabled, fetchPeriod])
  useEffect(() => { if (historyEnabled) void fetchHistory() }, [historyEnabled, fetchHistory])
  useEffect(() => () => { periodAbort.current?.abort(); historyAbort.current?.abort() }, [])
  useEffect(() => {
    if (accountsStatus.loaded) void fetchInvestmentValue()
  }, [accountsStatus.loaded, fetchInvestmentValue])

  const usableExchangeRates = !ratesStatus.error && ratesResult.currency === masterCurrency ? ratesResult.rates : {}
  const usableQuotes = !investmentStatus.error && investmentResult?.currency === masterCurrency ? investmentResult.quotes : {}
  const accountSortValues = Object.fromEntries(accounts.map(account => [account.id,
    accountValueForOrdering(account, usableQuotes, masterCurrency, usableExchangeRates).value,
  ]))

  return {
    accountSortValues,
    netWorth: netWorthResult?.currency === masterCurrency ? netWorthResult.value : null,
    netWorthMissingCurrencies: netWorthResult?.currency === masterCurrency ? netWorthResult.missingCurrencies : [],
    investmentValue: investmentResult?.currency === masterCurrency ? investmentResult.conversion.value : null,
    investmentMissingCurrencies: investmentResult?.currency === masterCurrency ? investmentResult.conversion.missingCurrencies : [],
    investmentLoading: investmentStatus.loading,
    investmentError: investmentStatus.error ? 'Unable to load investment value.' : null,
    accounts,
    transactions,
    allTransactions,
    upcomingTransactions,
    transactionsLoading: transactionsStatus.loading,
    allTransactionsLoading: historyStatus.loading,
    categories,
    exchangeRates: ratesResult.rates,
    usableExchangeRates,
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
