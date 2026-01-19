import { useState, useEffect } from 'react'
import { API_BASE_URL, apiFetch } from '../../config'
import { usePrivacy } from '../../context/PrivacyContext'
import { getMasterCurrency } from '../settings-module/Settings'
import type { Account, Transaction, MarketQuote, Category, PortfolioStats } from './types'
import { calculatePosition, convertToDisplayCurrency } from './utils'
import { PortfolioSummary } from './PortfolioSummary'
import { HoldingsList } from './HoldingsList'
import { InvestmentDetailModal } from './InvestmentDetailModal'

export function Investments() {
  const [investmentAccounts, setInvestmentAccounts] = useState<Account[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  const [currencyDisplay, setCurrencyDisplay] = useState<'HUF' | 'USD'>('HUF')
  
  const { privacyMode } = usePrivacy()

  useEffect(() => {
    setMasterCurrency(getMasterCurrency())
  }, [])

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
          description: itx.notes || `${itx.quantity} shares @ $${itx.price}`,
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
          console.log(`Fetched quote for ${symbol}:`, data) // Debug log
          newQuotes[symbol] = data
        }
      } catch (error) {
        console.error(`Failed to fetch quote for ${symbol}:`, error)
      }
    }))
    setQuotes(newQuotes)
    
    // Fetch exchange rates for manual assets (USD base)
    try {
      const ratesRes = await fetch('https://open.er-api.com/v6/latest/USD')
      const ratesData = await ratesRes.json()
      setExchangeRates(ratesData.rates || {})
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error)
    }
    
    setRefreshing(false)
    setLoading(false)
    
    // Debug: Log accounts and transactions after fetch
    console.log('=== INVESTMENTS LOADED ===')
    console.log('Investment Accounts:', investments)
    console.log('All Investment Transactions:', allInvestmentTxs)
    console.log('========================')
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
    
    console.log('=== PORTFOLIO DEBUG ===')
    positions.forEach(pos => {
      console.log(`Account: ${pos.account.name} (${pos.account.symbol})`)
      console.log(`  Balance in DB: ${pos.account.balance}`)
      console.log(`  Actual Quantity (calculated): ${pos.actualQuantity}`)
      console.log(`  Current Price: ${pos.currentPrice}`)
      console.log(`  Current Value: ${pos.currentValue}`)
      console.log(`  Currency: ${pos.account.currency}`)
      console.log(`  Transactions:`, pos.transactions.map(t => ({ quantity: t.quantity, amount: t.amount })))
    })
    console.log('======================')
    
    // Sort positions by current value (descending, most to least)
    const sortedPositions = [...positions].sort((a, b) => b.currentValue - a.currentValue)
    
    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0)
    const totalInvested = positions.reduce((sum, pos) => sum + pos.netInvested, 0)
    const totalGainLoss = totalValue - totalInvested
    const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
    
    return { totalValue, totalInvested, totalGainLoss, totalGainLossPercent, positions: sortedPositions }
  }

  const stats = calculatePortfolioStats()

  const convertCurrency = (usdValue: number) => 
    convertToDisplayCurrency(usdValue, currencyDisplay, exchangeRates, masterCurrency)

  return (
    <div className="space-y-6">
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
        convertToDisplayCurrency={convertCurrency}
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
