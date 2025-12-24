import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'
import { InvestmentChart } from './InvestmentChart'
import { usePrivacy } from '../context/PrivacyContext'
import { getMasterCurrency } from './Settings'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment' | 'credit'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  updated_at: number
}

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  quantity?: number
  description?: string
  date: string
  is_recurring: boolean
  linked_transaction_id?: string
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
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
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  
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

  const calculatePosition = (account: Account) => {
    const transactions = getAccountTransactions(account.id)
    
    // Calculate actual quantity from transactions (don't trust account.balance)
    const actualQuantity = transactions.reduce((sum, tx) => sum + (tx.quantity || 0), 0)
    
    // Get current market price if available
    let currentPrice = 0
    if (account.asset_type !== 'manual' && account.symbol && quotes[account.symbol]) {
      currentPrice = quotes[account.symbol].regularMarketPrice || 0
    }
    
    // Calculate current value in USD
    let currentValue = 0
    if (account.asset_type === 'manual') {
      // For manual: balance is in account's currency, convert to USD
      const balanceInAccountCurrency = account.balance
      if (account.currency === 'USD') {
        currentValue = balanceInAccountCurrency
      } else {
        const rate = exchangeRates[account.currency]
        if (rate) {
          currentValue = balanceInAccountCurrency / rate
        } else {
          console.warn(`No exchange rate for ${account.currency}, using raw value`)
          currentValue = balanceInAccountCurrency
        }
      }
    } else {
      // For crypto/stock: use calculated quantity, multiply by USD price
      currentValue = actualQuantity * currentPrice
    }
    
    // Calculate invested amount from investment transactions
    // For manual assets: initial balance + transactions
    // For stock/crypto: transactions already have the total_amount (quantity × price at purchase time)
    let netInvested = 0
    let initialInvestment = 0
    
    if (account.asset_type === 'manual') {
      // For manual: need to get initial balance from account creation
      // We'll use a proxy: if no transactions, balance is initial
      // If there are transactions, we need to subtract transaction gains to get initial
      const totalAdded = transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0)
      
      const totalWithdrawn = transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
      
      const transactionNet = totalAdded - totalWithdrawn
      
      // Initial investment = current balance - transaction gains
      if (account.currency === 'USD') {
        initialInvestment = account.balance - transactionNet
      } else {
        const rate = exchangeRates[account.currency]
        if (rate) {
          initialInvestment = (account.balance - transactionNet) / rate
        } else {
          initialInvestment = account.balance - transactionNet
        }
      }
      
      netInvested = initialInvestment + transactionNet
    } else {
      // For stock/crypto: count all transactions as invested
      const totalInvested = transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0)
      
      const totalWithdrawn = transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
      
      netInvested = totalInvested - totalWithdrawn
    }
    
    // For manual assets, gain/loss should only be from transactions
    // For stock/crypto, gain/loss is current value - invested
    const gainLoss = account.asset_type === 'manual' 
      ? (transactions.reduce((sum, tx) => sum + tx.amount, 0)) 
      : (currentValue - netInvested)
    const gainLossPercent = netInvested > 0 ? (gainLoss / netInvested) * 100 : 0
    
    // For display purposes, store the value in the original currency for manual assets
    const displayValue = account.asset_type === 'manual' ? account.balance : currentValue
    
    return {
      account,
      netInvested,
      currentValue, // USD value for portfolio totals
      displayValue, // Original currency value for display
      currentPrice,
      gainLoss,
      gainLossPercent,
      transactions,
      actualQuantity
    }
  }

  const calculatePortfolioStats = () => {
    const positions = investmentAccounts.map(acc => calculatePosition(acc))
    
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
    
    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0)
    const totalInvested = positions.reduce((sum, pos) => sum + pos.netInvested, 0)
    const totalGainLoss = totalValue - totalInvested
    const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
    
    return { totalValue, totalInvested, totalGainLoss, totalGainLossPercent, positions }
  }

  const handleOpenDetail = (account: Account) => {
    setSelectedAccount(account)
  }

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Transfer'
    const cat = categories.find(c => c.id === categoryId)
    return cat ? `${cat.icon} ${cat.name}` : 'Unknown'
  }

  const formatValue = (value: number, account?: Account) => {
    if (!account || account.asset_type !== 'manual') {
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    // For manual assets, use their currency
    const currencySymbols: Record<string, string> = {
      HUF: 'Ft',
      EUR: '€',
      USD: '$',
      GBP: '£'
    }
    const symbol = currencySymbols[account.currency] || account.currency
    const decimals = account.currency === 'HUF' ? 0 : 2
    const formatted = Math.abs(value).toLocaleString('hu-HU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
    return account.currency === 'HUF' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
  }

  const formatMasterCurrency = (value: number) => {
    const currencySymbols: Record<string, string> = {
      HUF: 'Ft',
      EUR: '€',
      USD: '$',
      GBP: '£'
    }
    const symbol = currencySymbols[masterCurrency] || masterCurrency
    const decimals = masterCurrency === 'HUF' ? 0 : 2
    const formatted = Math.abs(value).toLocaleString('hu-HU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
    return masterCurrency === 'HUF' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
  }

  const convertToMasterCurrency = (usdValue: number) => {
    if (masterCurrency === 'USD') return usdValue
    const rate = exchangeRates[masterCurrency]
    return rate ? usdValue * rate : usdValue
  }

  const stats = calculatePortfolioStats()

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        {loading ? (
          <>
            <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
              <div className="h-10 w-40 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            </div>
            <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
              <div className="h-10 w-40 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            </div>
            <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
              <div className="h-10 w-40 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            </div>
          </>
        ) : (
          <>
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Total Portfolio Value</h3>
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div className={`text-4xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••••' : formatMasterCurrency(convertToMasterCurrency(stats.totalValue))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {investmentAccounts.length} investment{investmentAccounts.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Total Invested</h3>
                <DollarSign className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className={`text-4xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••••' : formatMasterCurrency(convertToMasterCurrency(stats.totalInvested))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Net deposited</p>
            </div>
            
            <div className={`p-6 rounded-2xl border shadow-sm ${stats.totalGainLoss >= 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Total Return</h3>
                {stats.totalGainLoss >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
              </div>
              <div className={`text-4xl font-bold ${stats.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••••' : `${stats.totalGainLoss >= 0 ? '+' : '-'}${formatMasterCurrency(convertToMasterCurrency(Math.abs(stats.totalGainLoss)))}`}
              </div>
              <div className={`text-sm font-medium mt-2 ${stats.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••' : `${stats.totalGainLossPercent >= 0 ? '+' : ''}${stats.totalGainLossPercent.toFixed(2)}%`}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Holdings List */}
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold text-lg">Your Holdings</h3>
          <button 
            onClick={fetchData} 
            disabled={refreshing}
            className={`p-2 rounded-lg hover:bg-secondary/50 transition-colors ${refreshing ? 'animate-spin' : ''}`}
            title="Refresh prices"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        
        <div className="divide-y divide-border/50">
          {loading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : investmentAccounts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted/50 mb-4">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No investment accounts yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create an investment account to start tracking your portfolio
              </p>
              <p className="text-xs text-muted-foreground">
                Go to Dashboard → Accounts → Add Account → Choose "Investment" type
              </p>
            </div>
          ) : (
            stats.positions.map(position => {
              const quote = position.account.symbol ? quotes[position.account.symbol] : null
              const priceChange = quote?.regularMarketChangePercent || 0
              
              return (
                <div 
                  key={position.account.id} 
                  className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors cursor-pointer group"
                  onClick={() => handleOpenDetail(position.account)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm ${
                      position.account.asset_type === 'crypto' 
                        ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' 
                        : position.account.asset_type === 'manual' 
                        ? 'bg-gradient-to-br from-gray-400 to-gray-600 text-white' 
                        : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'
                    }`}>
                      {position.account.symbol?.slice(0, 3).toUpperCase() || position.account.name.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-lg flex items-center gap-2">
                        {position.account.symbol || position.account.name}
                        {position.account.asset_type !== 'manual' && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${priceChange >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                        {privacyMode === 'hidden' ? '•••• invested' : `${formatValue(position.netInvested, position.account)} invested`}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••••' : formatValue(position.displayValue, position.account)}
                    </div>
                    {position.account.asset_type !== 'manual' && (
                      <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                        {privacyMode === 'hidden' ? '•••• ' : `${position.actualQuantity > 0 ? '+' : ''}${position.actualQuantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} `}
                        {position.account.currency}
                      </div>
                    )}
                    <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '•••• ' : `${position.account.symbol || position.account.name}`} {position.currentPrice > 0 && `@ $${position.currentPrice.toLocaleString()}`}
                    </div>
                    <div className={`text-sm font-semibold mt-1 flex items-center justify-end gap-1 ${position.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {position.gainLoss >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {privacyMode === 'hidden' ? '••••' : `${position.gainLoss >= 0 ? '+' : ''}${formatValue(Math.abs(position.gainLoss), position.account)} (${position.gainLossPercent >= 0 ? '+' : ''}${position.gainLossPercent.toFixed(2)}%)`}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Investment Detail Modal */}
      {selectedAccount && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-6xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-bold text-2xl">{selectedAccount.symbol || selectedAccount.name}</h2>
                  <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                    selectedAccount.asset_type === 'crypto' 
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' 
                      : selectedAccount.asset_type === 'manual' 
                      ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' 
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {selectedAccount.asset_type?.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{selectedAccount.name}</p>
                
                {(() => {
                  const position = calculatePosition(selectedAccount)
                  return (
                    <div className="flex gap-6 mt-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Current Value</div>
                        <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '••••••' : formatValue(position.displayValue, selectedAccount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Net Invested</div>
                        <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '••••••' : formatValue(position.netInvested, selectedAccount)}
                        </div>
                      </div>
                      {position.currentPrice > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground">Current Price</div>
                          <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {privacyMode === 'hidden' ? '••••••' : formatValue(position.currentPrice, selectedAccount)}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-muted-foreground">Total Return</div>
                        <div className={`text-lg font-bold ${position.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '••••••' : `${position.gainLoss >= 0 ? '+' : ''}${formatValue(Math.abs(position.gainLoss), selectedAccount)} (${position.gainLossPercent >= 0 ? '+' : ''}${position.gainLossPercent.toFixed(2)}%)`}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <button 
                onClick={() => setSelectedAccount(null)} 
                className="p-2 hover:bg-secondary rounded-lg transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedAccount.asset_type !== 'manual' && selectedAccount.symbol && (
                <div className="bg-secondary/20 rounded-xl p-4">
                  <InvestmentChart 
                    symbol={selectedAccount.symbol}
                    transactions={getAccountTransactions(selectedAccount.id)}
                  />
                </div>
              )}
              
              <div>
                <h3 className="font-semibold text-lg mb-4">Transaction History</h3>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    <strong>💡 How to log investment transactions:</strong><br/>
                    For stock/crypto investments, log the <strong>dollar amount</strong> you invested, not the number of shares.<br/>
                    Example: If you bought 5 shares of AAPL for $1,400, log an income transaction of <strong>$1,400</strong> with description "Bought 5 AAPL shares"
                  </p>
                </div>
                
                <div className="space-y-2">
                  {(() => {
                    const txs = getAccountTransactions(selectedAccount.id)
                    if (txs.length === 0) {
                      return (
                        <div className="p-12 text-center bg-secondary/20 rounded-xl">
                          <p className="text-muted-foreground">No transactions yet</p>
                          <p className="text-sm text-muted-foreground mt-1">Go to Dashboard to add income, expense, or swap transactions</p>
                        </div>
                      )
                    }
                    
                    return [...txs]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(tx => (
                        <div 
                          key={tx.id} 
                          className="p-4 bg-secondary/30 hover:bg-secondary/50 rounded-xl flex justify-between items-center transition-colors cursor-pointer"
                          onClick={() => {
                            console.log('=== TRANSACTION DEBUG ===')
                            console.log('Transaction:', tx)
                            console.log('ID:', tx.id)
                            console.log('Amount (USD):', tx.amount)
                            console.log('Quantity (shares):', tx.quantity)
                            console.log('Description:', tx.description)
                            console.log('Date:', tx.date)
                            console.log('Account:', selectedAccount)
                            console.log('Account Balance:', selectedAccount.balance)
                            console.log('Account Currency:', selectedAccount.currency)
                            console.log('========================')
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-medium ${
                              tx.amount > 0
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {tx.amount > 0 ? '↑' : '↓'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                  {getCategoryName(tx.category_id)}
                                </span>
                              </div>
                              <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                {new Date(tx.date).toLocaleString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                                {tx.description && ` • ${tx.description}`}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-xl font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                              {privacyMode === 'hidden' ? '••••••' : (
                                tx.quantity !== undefined 
                                  ? `${tx.quantity > 0 ? '+' : ''}${Math.abs(tx.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${selectedAccount.currency}`
                                  : `${tx.amount > 0 ? '+' : ''}$${Math.abs(tx.amount).toFixed(2)}`
                              )}
                            </div>
                            {tx.quantity !== undefined && (
                              <div className="text-sm text-muted-foreground">
                                ${Math.abs(tx.amount).toFixed(2)} USD
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
