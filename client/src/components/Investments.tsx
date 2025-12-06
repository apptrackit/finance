import { useState, useEffect } from 'react'
import { Plus, RefreshCw, DollarSign, Trash2, BarChart2, TrendingUp, TrendingDown } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'
import { InvestmentChart } from './InvestmentChart'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { usePrivacy } from '../context/PrivacyContext'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  updated_at: number
}

type InvestmentTransaction = {
  id: string
  account_id: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
  created_at: number
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

export function Investments() {
  const [investmentAccounts, setInvestmentAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Record<string, InvestmentTransaction[]>>({})
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  
  const { privacyMode } = usePrivacy()
  
  // Transaction modal state
  const [txForm, setTxForm] = useState({
    type: 'buy' as 'buy' | 'sell',
    quantity: '',
    price: '',
    date: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    notes: ''
  })

  const fetchInvestmentAccounts = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/accounts`)
      const data = await res.json()
      const investments = data.filter((acc: Account) => acc.type === 'investment')
      setInvestmentAccounts(investments)
      return investments
    } catch (error) {
      console.error('Failed to fetch investment accounts:', error)
      return []
    }
  }

  const fetchTransactions = async (accountId: string) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/investment-transactions?account_id=${accountId}`)
      const data = await res.json()
      setTransactions(prev => ({ ...prev, [accountId]: data }))
      return data
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
      return []
    }
  }

  const fetchAllTransactions = async (accounts: Account[]) => {
    await Promise.all(accounts.map(acc => fetchTransactions(acc.id)))
  }

  const fetchQuotes = async (accounts: Account[]) => {
    const newQuotes: Record<string, MarketQuote> = {}
    
    const symbolsToFetch = accounts
      .filter(acc => acc.asset_type !== 'manual' && acc.symbol)
      .map(acc => acc.symbol!)
      
    const uniqueSymbols = [...new Set(symbolsToFetch)]

    await Promise.all(uniqueSymbols.map(async (symbol) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`)
        if (res.ok) {
          const data = await res.json()
          newQuotes[symbol] = data
        }
      } catch (error) {
        console.error(`Failed to fetch quote for ${symbol}:`, error)
      }
    }))
    
    setQuotes(prev => ({ ...prev, ...newQuotes }))
  }

  const loadData = async () => {
    setRefreshing(true)
    const accounts = await fetchInvestmentAccounts()
    await fetchAllTransactions(accounts)
    await fetchQuotes(accounts)
    setRefreshing(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const calculatePosition = (account: Account) => {
    const txs = transactions[account.id] || []
    
    // Start with initial balance (could be from account creation or pre-existing holdings)
    let totalQuantity = account.balance
    let totalCostBasis = 0 // Cost basis of current holdings (for gain/loss calculation)
    
    // If there's an initial balance but no transactions, we need to estimate the cost basis
    // We'll assume the initial balance was "bought" at the current market price when account was created
    if (totalQuantity > 0 && txs.length === 0) {
      const quote = account.symbol ? quotes[account.symbol] : null
      const estimatedPrice = quote?.regularMarketPrice || 0
      totalCostBasis = totalQuantity * estimatedPrice
    }
    
    // Process all transactions
    txs.forEach(tx => {
      if (tx.type === 'buy') {
        totalQuantity += tx.quantity
        totalCostBasis += tx.total_amount // Cost basis increases
      } else { // sell
        const sellQuantity = tx.quantity
        const avgCostPerUnit = totalQuantity > 0 ? totalCostBasis / totalQuantity : 0
        const costOfSold = avgCostPerUnit * sellQuantity
        
        totalQuantity -= sellQuantity
        totalCostBasis -= costOfSold // Reduce cost basis proportionally
      }
    })
    
    const avgPrice = totalQuantity > 0 ? totalCostBasis / totalQuantity : 0
    
    return { 
      totalQuantity, 
      avgPrice, 
      totalCostBasis // Cost basis of current holdings
    }
  }

  const handleOpenChart = async (account: Account) => {
    setSelectedAccount(account)
    if (!transactions[account.id]) {
      await fetchTransactions(account.id)
    }
  }

  const handleAddTransaction = () => {
    setShowTransactionModal(true)
  }

  const handleSubmitTransaction = async () => {
    if (!selectedAccount) return
    
    try {
      const totalAmount = parseFloat(txForm.quantity) * parseFloat(txForm.price)
      
      await apiFetch(`${API_BASE_URL}/investment-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedAccount.id,
          type: txForm.type,
          quantity: parseFloat(txForm.quantity),
          price: parseFloat(txForm.price),
          total_amount: totalAmount,
          date: new Date(txForm.date).toISOString(),
          notes: txForm.notes || undefined
        })
      })

      // Reload transactions
      await fetchTransactions(selectedAccount.id)
      setShowTransactionModal(false)
      setTxForm({
        type: 'buy',
        quantity: '',
        price: '',
        date: new Date().toISOString().slice(0, 16),
        notes: ''
      })
    } catch (error) {
      console.error('Failed to add transaction:', error)
      alert('Failed to add transaction')
    }
  }

  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm('Delete this transaction?')) return
    
    try {
      await apiFetch(`${API_BASE_URL}/investment-transactions/${txId}`, { method: 'DELETE' })
      if (selectedAccount) {
        await fetchTransactions(selectedAccount.id)
      }
    } catch (error) {
      console.error('Failed to delete transaction:', error)
    }
  }

  const calculateTotalValue = () => {
    return investmentAccounts.reduce((sum, acc) => {
      const position = calculatePosition(acc)
      const totalQuantity = position.totalQuantity
      let price = 0
      
      if (acc.asset_type === 'manual') {
        // For manual, use the average cost as current price (no market data)
        price = position.avgPrice
      } else if (acc.symbol) {
        const quote = quotes[acc.symbol]
        price = quote?.regularMarketPrice || position.avgPrice
      } else {
        price = position.avgPrice
      }
      
      return sum + (price * totalQuantity)
    }, 0)
  }

  const calculateTotalInvested = () => {
    // Total invested = sum of all cost bases (what you originally paid for current holdings)
    return investmentAccounts.reduce((sum, acc) => {
      const position = calculatePosition(acc)
      return sum + position.totalCostBasis
    }, 0)
  }

  const totalValue = calculateTotalValue()
  const totalInvested = calculateTotalInvested()
  const totalGainLoss = totalValue - totalInvested
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Total Portfolio Value</h3>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div className={`text-3xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
            {privacyMode === 'hidden' ? '••••••' : `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>
        
        <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Total Invested</h3>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={`text-3xl font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
            {privacyMode === 'hidden' ? '••••••' : `$${totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>
        
        <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Total Gain/Loss</h3>
            {totalGainLoss >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
          </div>
          <div className={`text-3xl font-bold ${totalGainLoss >= 0 ? 'text-green-500' : 'text-red-500'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
            {privacyMode === 'hidden' ? '••••••' : `${totalGainLoss >= 0 ? '+' : ''}$${totalGainLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className={`text-sm ${totalGainLoss >= 0 ? 'text-green-500' : 'text-red-500'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
            {privacyMode === 'hidden' ? '••••' : `${totalGainLossPercent >= 0 ? '+' : ''}${totalGainLossPercent.toFixed(2)}%`}
          </div>
        </div>
      </div>

      {/* Investment List */}
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold">Your Investments</h3>
          <button 
            onClick={loadData} 
            disabled={refreshing}
            className={`p-2 rounded-lg hover:bg-secondary/50 transition-colors ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        
        <div className="divide-y divide-border/50">
          {investmentAccounts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No investment accounts yet.</p>
              <p className="text-sm mt-2">Create an investment account from the Accounts section to start tracking.</p>
            </div>
          ) : (
            investmentAccounts.map(acc => {
              const position = calculatePosition(acc)
              const totalQuantity = position.totalQuantity
              const quote = acc.symbol ? quotes[acc.symbol] : null
              const currentPrice = acc.asset_type === 'manual' ? position.avgPrice : (quote?.regularMarketPrice || position.avgPrice)
              const currentValue = currentPrice * totalQuantity
              const gainLoss = currentValue - position.totalCostBasis
              const gainLossPercent = position.totalCostBasis > 0 ? (gainLoss / position.totalCostBasis) * 100 : 0
              
              return (
                <div 
                  key={acc.id} 
                  className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors cursor-pointer"
                  onClick={() => handleOpenChart(acc)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      acc.asset_type === 'crypto' ? 'bg-orange-100 text-orange-600' : 
                      acc.asset_type === 'manual' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {acc.asset_type === 'crypto' ? '₿' : acc.asset_type === 'manual' ? 'M' : '$'}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {acc.symbol || acc.name}
                        {acc.asset_type !== 'manual' && <BarChart2 className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="text-xs text-muted-foreground">{acc.name}</div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`font-medium ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••••' : `$${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </div>
                    <div className={`text-xs text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••' : `${totalQuantity.toFixed(4)} ${acc.currency} @ $${currentPrice.toLocaleString()}`}
                    </div>
                    <div className={`text-xs font-medium ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••' : `${gainLoss >= 0 ? '+' : ''}$${Math.abs(gainLoss).toFixed(2)} (${gainLossPercent >= 0 ? '+' : ''}${gainLossPercent.toFixed(2)}%)`}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Investment Detail Modal with Chart */}
      {selectedAccount && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-lg">{selectedAccount.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedAccount.symbol} • {selectedAccount.asset_type?.toUpperCase()}
                </p>
              </div>
              <button onClick={() => setSelectedAccount(null)} className="text-muted-foreground hover:text-foreground p-2">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {selectedAccount.asset_type !== 'manual' && selectedAccount.symbol && (
                <InvestmentChart 
                  symbol={selectedAccount.symbol}
                  transactions={transactions[selectedAccount.id] || []}
                />
              )}
              
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold">Transactions</h4>
                  <button
                    onClick={handleAddTransaction}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add Transaction
                  </button>
                </div>
                
                <div className="space-y-2">
                  {(transactions[selectedAccount.id] || []).map(tx => (
                    <div key={tx.id} className="p-3 bg-secondary/20 rounded-lg flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${tx.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {tx.type.toUpperCase()}
                          </span>
                          <span className={`font-medium ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {privacyMode === 'hidden' ? '•••• @ ••••' : `${tx.quantity} @ $${tx.price}`}
                          </span>
                        </div>
                        <div className={`text-xs text-muted-foreground mt-1 ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {new Date(tx.date).toLocaleString()} • Total: {privacyMode === 'hidden' ? '••••••' : `$${tx.total_amount.toFixed(2)}`}
                        </div>
                        {tx.notes && <div className="text-xs text-muted-foreground mt-1">{tx.notes}</div>}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(tx.id); }}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  
                  {(transactions[selectedAccount.id] || []).length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No transactions yet. Add a buy or sell transaction to start tracking.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showTransactionModal && selectedAccount && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold">Add Transaction</h3>
              <button onClick={() => setShowTransactionModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex gap-2 p-1 bg-secondary/50 rounded-lg">
                <button 
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${txForm.type === 'buy' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setTxForm({...txForm, type: 'buy'})}
                >
                  Buy
                </button>
                <button 
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${txForm.type === 'sell' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setTxForm({...txForm, type: 'sell'})}
                >
                  Sell
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="any"
                    value={txForm.quantity}
                    onChange={(e) => setTxForm({...txForm, quantity: e.target.value})}
                    placeholder="0.00"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="price">Price per Share</Label>
                  <Input
                    id="price"
                    type="number"
                    step="any"
                    value={txForm.price}
                    onChange={(e) => setTxForm({...txForm, price: e.target.value})}
                    placeholder="0.00"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="date">Date & Time</Label>
                  <Input
                    id="date"
                    type="datetime-local"
                    value={txForm.date}
                    onChange={(e) => setTxForm({...txForm, date: e.target.value})}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Input
                    id="notes"
                    value={txForm.notes}
                    onChange={(e) => setTxForm({...txForm, notes: e.target.value})}
                    placeholder="Optional notes..."
                  />
                </div>
                
                {txForm.quantity && txForm.price && (
                  <div className="p-3 bg-secondary/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Total Amount</div>
                    <div className="text-lg font-bold">
                      ${(parseFloat(txForm.quantity) * parseFloat(txForm.price)).toFixed(2)}
                    </div>
                  </div>
                )}
                
                <button
                  onClick={handleSubmitTransaction}
                  disabled={!txForm.quantity || !txForm.price}
                  className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  Add {txForm.type === 'buy' ? 'Buy' : 'Sell'} Transaction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
