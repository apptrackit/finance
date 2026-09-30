import { sumAvailable, validRates, convertCurrency } from '../../../../shared/currency'
import { MissingExchangeRates } from '../common/MissingExchangeRates'
import { useState, useEffect } from 'react'
import { API_BASE_URL, apiFetch } from '../../config'
import { usePrivacy } from '../../context/PrivacyContext'
import type { Account, Transaction, MarketQuote, Category, PortfolioStats } from './types'
import { calculatePosition, convertToDisplayCurrency } from './utils'
import { PortfolioSummary } from './PortfolioSummary'
import { HoldingsList } from './HoldingsList'
import { InvestmentDetailModal } from './InvestmentDetailModal'

const formatInvestmentTransactionDescription = (transaction: any, quoteCurrency: string) => {
  const price = Number(transaction.price)
  const notes = transaction.notes as string | undefined
  if (notes?.startsWith('Transfer from ') && Number.isFinite(price) && price > 0) {
    const source = notes.replace(/\s*\([^)]*\)/, '')
    const noteSuffix = source.match(/\s-\s.*$/)?.[0] || ''
    const sourceName = source.replace(/\s-\s.*$/, '').trim()
    return `${sourceName} (${transaction.quantity} shares @ ${quoteCurrency} ${price.toFixed(2)}/share)${noteSuffix}`
  }
  return notes || `${transaction.quantity} shares @ ${quoteCurrency} ${price}`
}

export function Investments() {
  const [investmentAccounts, setInvestmentAccounts] = useState<Account[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [currencyDisplay, setCurrencyDisplay] = useState<'HUF' | 'USD'>('HUF')
  
  const { privacyMode } = usePrivacy()


  const fetchData = async () => {
    setRefreshing(true)
    if (investmentAccounts.length === 0) setLoading(true)
    
    // Fetch accounts
    const accountsRes = await apiFetch(`${API_BASE_URL}/accounts`)
    const allAccounts = await accountsRes.json()
    const investments = allAccounts.filter((acc: Account) => acc.type === 'investment')
    setInvestmentAccounts(investments)
    
    // Fetch investment transactions for all investment accounts
    const allInvestmentTxs: Transaction[] = []
    for (const acc of investments) {
      const txRes = await apiFetch(`${API_BASE_URL}/investment-transactions?account_id=${acc.id}`)
      const txData = await txRes.json()
      // Convert investment transactions to regular transaction format for display
      txData.forEach((itx: any) => {
        allInvestmentTxs.push({
          id: itx.id,
          account_id: itx.account_id,
          amount: itx.type === 'buy' ? itx.total_amount : -itx.total_amount,
          quantity: itx.type === 'buy' ? itx.quantity : -itx.quantity,
          price: itx.price,
          description: formatInvestmentTransactionDescription(itx, acc.quote_currency || 'trading currency'),
          date: itx.date,
          is_recurring: false
        })
      })
    }
    setAllTransactions(allInvestmentTxs)
    
    // Fetch categories
    const catRes = await apiFetch(`${API_BASE_URL}/categories`)
    const catData = await catRes.json()
    setCategories(catData)
    
    // Fetch market quotes for the newly fetched investment accounts
    const symbolsToFetch = investments
      .filter((acc: Account) => acc.asset_type !== 'manual' && acc.symbol)
      .map((acc: Account) => acc.symbol!)
    const uniqueSymbols = [...new Set(symbolsToFetch)] as string[]
    
    const newQuotes: Record<string, MarketQuote> = {}
    await Promise.all(uniqueSymbols.map(async (symbol: string) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
        if (res.ok) {
          const data = await res.json()
          newQuotes[symbol] = data
        }
      } catch {
        console.error('Failed to fetch market quote')
      }
    }))
    setQuotes(newQuotes)
    
    // Fetch exchange rates for manual assets (USD base)
    try {
      const ratesRes = await fetch('https://open.er-api.com/v6/latest/USD')
      if (!ratesRes.ok) throw new Error('Rates unavailable')
      const ratesData = await ratesRes.json()
      setExchangeRates(validRates(ratesData.rates))
    } catch {
      setExchangeRates({})
    }
    
    setRefreshing(false)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const getAccountTransactions = (accountId: string) => {
    return allTransactions.filter(tx => tx.account_id === accountId)
  }

  const calculatePortfolioStats = (): PortfolioStats => {
    const positions = investmentAccounts.map(acc => 
      calculatePosition(acc, getAccountTransactions(acc.id), quotes, exchangeRates)
    )
    
    // Sort positions by current value (descending, most to least)
    const sortedPositions = [...positions].sort((a, b) => (b.currentValue ?? -Infinity) - (a.currentValue ?? -Infinity))
    
    const totalValue = sumAvailable(positions.map(pos => pos.currentValue))
    const totalInvested = sumAvailable(positions.map(pos => pos.netInvested))
    const totalGainLoss = totalValue === null || totalInvested === null ? null : totalValue - totalInvested
    const totalGainLossPercent = totalInvested === null || totalGainLoss === null ? null : totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
    
    return { totalValue, totalInvested, totalGainLoss, totalGainLossPercent, positions: sortedPositions }
  }

  const stats = calculatePortfolioStats()

  const convertDisplayCurrency = (usdValue: number | null) =>
    convertToDisplayCurrency(usdValue, currencyDisplay, exchangeRates)

  const missingCurrencies = [...new Set([
    ...stats.positions.flatMap(position => position.missingCurrencies),
    ...convertCurrency(1, 'USD', currencyDisplay, exchangeRates, 'USD').missingCurrencies,
  ])].sort()

  return (
    <div className="space-y-6">
      {!loading && <MissingExchangeRates currencies={missingCurrencies} targetCurrency={currencyDisplay}
        onRetry={() => { void fetchData() }} retrying={refreshing} />}
      {/* Currency Toggle */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setCurrencyDisplay('HUF')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            currencyDisplay === 'HUF'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
          }`}
        >
          HUF
        </button>
        <button
          onClick={() => setCurrencyDisplay('USD')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            currencyDisplay === 'USD'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
          }`}
        >
          USD
        </button>
      </div>

      {/* Portfolio Summary */}
      <PortfolioSummary
        stats={stats}
        loading={loading}
        privacyMode={privacyMode}
        displayCurrency={currencyDisplay}
        convertToDisplayCurrency={convertDisplayCurrency}
        investmentAccountsCount={investmentAccounts.length}
      />

      {/* Holdings List */}
      <HoldingsList
        positions={stats.positions}
        quotes={quotes}
        loading={loading}
        refreshing={refreshing}
        privacyMode={privacyMode}
        onRefresh={fetchData}
        onOpenDetail={setSelectedAccount}
      />

      {/* Investment Detail Modal */}
      <InvestmentDetailModal
        account={selectedAccount}
        categories={categories}
        allTransactions={allTransactions}
        quotes={quotes}
        exchangeRates={exchangeRates}
        privacyMode={privacyMode}
        onClose={() => setSelectedAccount(null)}
      />
    </div>
  )
}
