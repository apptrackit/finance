import { useEffect, useState, useCallback } from 'react'
import { API_BASE_URL, apiFetch } from '../config'
import { getMasterCurrency } from '../components/settings-module/Settings'

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
  confirmed_at?: number | null
  cancelled_at?: number | null
  created_at?: number | null
  updated_at?: number | null
}

const formatInvestmentTransactionDescription = (transaction: any) => {
  const price = Number(transaction.price)
  const fallback = `${transaction.quantity} shares @ $${price}`
  const notes = transaction.notes as string | undefined

  // Older investment transfers recorded the cash-to-share FX rate in their
  // note. Show the stored purchase price instead; the rate is not the price
  // per share and rounds down to 0.0000 for HUF purchases.
  if (notes?.startsWith('Transfer from ') && Number.isFinite(price) && price > 0) {
    const source = notes.replace(/\s*\([^)]*\)/, '')
    const noteSuffix = source.match(/\s-\s.*$/)?.[0] || ''
    const sourceName = source.replace(/\s-\s.*$/, '').trim()
    return `${sourceName} (${transaction.quantity} shares @ $${price.toFixed(2)}/share)${noteSuffix}`
  }

  return notes || fallback
}

const mapInvestmentTransaction = (transaction: any) => ({
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

export function useFinanceData(
  dateRange: { startDate: string; endDate: string },
  masterCurrency: string
) {
  const [netWorth, setNetWorth] = useState<number | null>(null)
  const [investmentValue, setInvestmentValue] = useState<number>(0)
  const [investmentLoading, setInvestmentLoading] = useState<boolean>(false)
  const [investmentError, setInvestmentError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [upcomingTransactions, setUpcomingTransactions] = useState<Transaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [investmentRefreshKey, setInvestmentRefreshKey] = useState(0)

  const fetchData = useCallback(async () => {
    setTransactionsLoading(true)
    setInvestmentRefreshKey(prev => prev + 1)
    const currency = getMasterCurrency()

    apiFetch(`${API_BASE_URL}/dashboard/net-worth?currency=${currency}`)
      .then(res => res.json())
      .then(data => setNetWorth(data.net_worth))
      .catch(err => console.error(err))

    const accountsRes = await apiFetch(`${API_BASE_URL}/accounts`)
    const accountsData: Account[] = await accountsRes.json()
    setAccounts(accountsData)

    const regularTxPromise = apiFetch(
      `${API_BASE_URL}/transactions/date-range?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
    )
      .then(res => res.json())
      .catch(() => [])

    const upcomingTxPromise = apiFetch(`${API_BASE_URL}/transactions/upcoming`)
      .then(res => res.json())
      .catch(() => [])

    const investmentAccounts = accountsData.filter(acc => acc.type === 'investment')

    const investmentTxPromises = investmentAccounts.map(acc =>
      apiFetch(`${API_BASE_URL}/investment-transactions?account_id=${acc.id}`)
        .then(res => res.json())
        .then((txs: any[]) =>
          txs
            .filter(itx => itx.date >= dateRange.startDate && itx.date <= dateRange.endDate)
          .map(mapInvestmentTransaction))
        .catch(() => [])
    )

    const [regularTxs, upcomingTxs, ...investmentTxArrays] = await Promise.all([regularTxPromise, upcomingTxPromise, ...investmentTxPromises])
    const allTxs = [...regularTxs, ...investmentTxArrays.flat()].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    setTransactions(allTxs)
    setUpcomingTransactions(upcomingTxs)

    apiFetch(`${API_BASE_URL}/categories`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(err => console.error(err))
      .finally(() => setTransactionsLoading(false))
  }, [dateRange.startDate, dateRange.endDate])

  const fetchAllTransactions = useCallback(async () => {
    try {
      const accountsData = accounts.length > 0
        ? accounts
        : await apiFetch(`${API_BASE_URL}/accounts`).then(res => res.json())

      const regularTxPromise = apiFetch(`${API_BASE_URL}/transactions`)
        .then(res => res.json())
        .catch(() => [])

      const investmentAccounts = accountsData.filter((acc: Account) => acc.type === 'investment')

      const investmentTxPromises = investmentAccounts.map((acc: Account) =>
        apiFetch(`${API_BASE_URL}/investment-transactions?account_id=${acc.id}`)
          .then(res => res.json())
          .then((txs: any[]) => txs.map(mapInvestmentTransaction))
          .catch(() => [])
      )

      const [regularTxs, ...investmentTxArrays] = await Promise.all([regularTxPromise, ...investmentTxPromises])
      const allTxs = [...regularTxs, ...investmentTxArrays.flat()].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      setAllTransactions(allTxs)
    } catch (error) {
      console.error('Failed to fetch all transactions:', error)
    }
  }, [accounts])

  const fetchInvestmentValue = useCallback(async () => {
    setInvestmentLoading(true)
    setInvestmentError(null)
    try {
      const investmentAccounts = accounts.filter(a => a.type === 'investment')
      if (investmentAccounts.length === 0) {
        setInvestmentValue(0)
        setInvestmentLoading(false)
        return
      }

      const symbolsToFetch = investmentAccounts
        .filter(acc => acc.asset_type !== 'manual' && acc.symbol)
        .map(acc => acc.symbol!)
      const uniqueSymbols = [...new Set(symbolsToFetch)]

      const quotePromises = uniqueSymbols.map(symbol =>
        apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
          .then(res => res.json())
          .then(data => ({ symbol, data }))
          .catch(() => ({ symbol, data: null }))
      )
      const quotesArray = await Promise.all(quotePromises)
      const quotes: Record<string, MarketQuote> = {}
      let failedQuotes = 0
      quotesArray.forEach(({ symbol, data }) => {
        if (data) quotes[symbol] = data
        else failedQuotes++
      })

      if (uniqueSymbols.length > 0 && failedQuotes === uniqueSymbols.length) {
        throw new Error('Failed to fetch market data. Yahoo Finance API may be temporarily unavailable.')
      }

      let totalValueInMasterCurrency = 0
      const ratesResponse = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`)
      const ratesData = await ratesResponse.json()
      const rates = ratesData.rates || {}

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
            valueInAccountCurrency = masterToQuoteRate ? valueInQuoteCurrency / masterToQuoteRate : valueInQuoteCurrency
          }
          totalValueInMasterCurrency += valueInAccountCurrency
          continue
        }

        if (acc.currency === masterCurrency) {
          totalValueInMasterCurrency += valueInAccountCurrency
        } else {
          const rate = rates[acc.currency]
          totalValueInMasterCurrency += rate ? valueInAccountCurrency / rate : valueInAccountCurrency
        }
      }

      setInvestmentValue(totalValueInMasterCurrency)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch investment data'
      setInvestmentError(errorMessage)
      setInvestmentValue(0)
    } finally {
      setInvestmentLoading(false)
    }
  }, [accounts, masterCurrency])

  // Initial load
  useEffect(() => {
    fetchData()
    fetchAllTransactions()
  }, [])

  // Re-fetch when date range changes (but not on initial mount — fetchData handles that)
  useEffect(() => {
    if (accounts.length > 0) {
      fetchData()
    }
  }, [dateRange.startDate, dateRange.endDate])

  // Re-calculate investment value when accounts or master currency changes
  useEffect(() => {
    if (accounts.length > 0) {
      fetchInvestmentValue()
    }
  }, [accounts, masterCurrency])

  // Fetch exchange rates for display
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`)
        const data = await response.json()
        if (data.rates) setExchangeRates(data.rates)
      } catch {
        console.error('Failed to fetch exchange rates')
      }
    }
    fetchRates()
  }, [masterCurrency])

  const handleDataChange = useCallback(() => {
    fetchData()
    fetchAllTransactions()
  }, [fetchData, fetchAllTransactions])

  return {
    netWorth,
    investmentValue,
    investmentLoading,
    investmentError,
    accounts,
    transactions,
    allTransactions,
    upcomingTransactions,
    transactionsLoading,
    categories,
    exchangeRates,
    investmentRefreshKey,
    handleDataChange,
    fetchInvestmentValue,
  }
}
