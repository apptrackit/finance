import { useState, useEffect } from 'react'
import { Plus, Search, RefreshCw, TrendingUp, TrendingDown, DollarSign, Trash2, Edit2 } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'

type Investment = {
  id: string
  symbol: string
  name?: string
  type: 'stock' | 'crypto' | 'manual'
  quantity: number
  purchase_price?: number
  manual_price?: number
  currency: string
  updated_at: number
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

export function Investments() {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  
  // Add Modal State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [quantity, setQuantity] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualForm, setManualForm] = useState({
    symbol: '',
    name: '',
    price: '',
    quantity: ''
  })

  const fetchInvestments = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/investments`)
      const data = await res.json()
      setInvestments(data)
      return data
    } catch (error) {
      console.error('Failed to fetch investments:', error)
      return []
    }
  }

  const fetchQuotes = async (invs: Investment[]) => {
    const newQuotes: Record<string, MarketQuote> = {}
    
    // Filter out manual investments that don't have a symbol or are explicitly manual type
    // Although manual type might still have a symbol we want to track? 
    // The prompt says "If the api cant find an asset the user should be able to manually add a stock".
    // So manual ones might not have a valid symbol for the API.
    
    const symbolsToFetch = invs
      .filter(i => i.type !== 'manual' && i.symbol)
      .map(i => i.symbol)
      
    // Remove duplicates
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
    const data = await fetchInvestments()
    await fetchQuotes(data)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery) return
    
    setSearching(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/market/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.quotes || [])
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearching(false)
    }
  }

  const handleAddInvestment = async () => {
    try {
      const body = manualMode ? {
        symbol: manualForm.symbol || 'MANUAL',
        name: manualForm.name,
        type: 'manual',
        quantity: parseFloat(manualForm.quantity),
        manual_price: parseFloat(manualForm.price),
        currency: 'USD' // Default
      } : {
        symbol: selectedAsset.symbol,
        name: selectedAsset.shortname || selectedAsset.longname,
        type: selectedAsset.quoteType === 'CRYPTOCURRENCY' ? 'crypto' : 'stock',
        quantity: parseFloat(quantity),
        currency: 'USD' // Yahoo usually returns USD for US stocks, but we might need to handle others
      }

      await apiFetch(`${API_BASE_URL}/investments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      setIsAddModalOpen(false)
      resetForm()
      loadData()
    } catch (error) {
      console.error('Failed to add investment:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this investment?')) return
    try {
      await apiFetch(`${API_BASE_URL}/investments/${id}`, { method: 'DELETE' })
      loadData()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const resetForm = () => {
    setSearchQuery('')
    setSearchResults([])
    setSelectedAsset(null)
    setQuantity('')
    setManualMode(false)
    setManualForm({ symbol: '', name: '', price: '', quantity: '' })
  }

  const calculateTotalValue = () => {
    return investments.reduce((sum, inv) => {
      let price = 0
      if (inv.type === 'manual') {
        price = inv.manual_price || 0
      } else {
        const quote = quotes[inv.symbol]
        price = quote?.regularMarketPrice || inv.purchase_price || 0
      }
      return sum + (price * inv.quantity)
    }, 0)
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Total Portfolio Value</h3>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div className="text-3xl font-bold">
            ${calculateTotalValue().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        
        <div className="flex items-center justify-end">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Investment
          </button>
        </div>
      </div>

      {/* Investment List */}
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold">Your Assets</h3>
          <button 
            onClick={loadData} 
            disabled={refreshing}
            className={`p-2 rounded-lg hover:bg-secondary/50 transition-colors ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        
        <div className="divide-y divide-border/50">
          {investments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No investments yet. Add one to start tracking!
            </div>
          ) : (
            investments.map(inv => {
              const quote = quotes[inv.symbol]
              const price = inv.type === 'manual' ? (inv.manual_price || 0) : (quote?.regularMarketPrice || 0)
              const value = price * inv.quantity
              const change = quote?.regularMarketChangePercent || 0
              
              return (
                <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      inv.type === 'crypto' ? 'bg-orange-100 text-orange-600' : 
                      inv.type === 'manual' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {inv.type === 'crypto' ? '₿' : inv.type === 'manual' ? 'M' : '$'}
                    </div>
                    <div>
                      <div className="font-medium">{inv.symbol}</div>
                      <div className="text-xs text-muted-foreground">{inv.name}</div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="font-medium">${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.quantity} shares @ ${price.toLocaleString()}
                      {inv.type !== 'manual' && (
                        <span className={`ml-2 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <button 
                      onClick={() => handleDelete(inv.id)}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Add Investment Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold">Add Investment</h3>
              <button onClick={() => { setIsAddModalOpen(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex gap-2 p-1 bg-secondary/50 rounded-lg">
                <button 
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${!manualMode ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setManualMode(false)}
                >
                  Search
                </button>
                <button 
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${manualMode ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setManualMode(true)}
                >
                  Manual
                </button>
              </div>

              {!manualMode ? (
                <>
                  {!selectedAsset ? (
                    <div className="space-y-4">
                      <form onSubmit={handleSearch} className="flex gap-2">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search symbol (e.g. AAPL, BTC-USD)"
                          className="flex-1 px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                          autoFocus
                        />
                        <button 
                          type="submit" 
                          disabled={searching}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                        >
                          {searching ? '...' : <Search className="h-4 w-4" />}
                        </button>
                      </form>
                      
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {searchResults.map((result: any) => (
                          <button
                            key={result.symbol}
                            onClick={() => setSelectedAsset(result)}
                            className="w-full p-3 text-left hover:bg-secondary/50 rounded-lg transition-colors flex justify-between items-center"
                          >
                            <div>
                              <div className="font-medium">{result.symbol}</div>
                              <div className="text-xs text-muted-foreground">{result.shortname || result.longname}</div>
                            </div>
                            <div className="text-xs px-2 py-1 bg-secondary rounded text-muted-foreground">
                              {result.quoteType}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3 bg-secondary/30 rounded-lg flex justify-between items-center">
                        <div>
                          <div className="font-bold">{selectedAsset.symbol}</div>
                          <div className="text-sm text-muted-foreground">{selectedAsset.shortname}</div>
                        </div>
                        <button onClick={() => setSelectedAsset(null)} className="text-xs text-primary hover:underline">Change</button>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Quantity</label>
                        <input
                          type="number"
                          step="any"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="0.00"
                        />
                      </div>
                      
                      <button
                        onClick={handleAddInvestment}
                        disabled={!quantity}
                        className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        Add to Portfolio
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={manualForm.name}
                      onChange={(e) => setManualForm({...manualForm, name: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Asset Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Symbol (Optional)</label>
                    <input
                      type="text"
                      value={manualForm.symbol}
                      onChange={(e) => setManualForm({...manualForm, symbol: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g. GOLD"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity</label>
                      <input
                        type="number"
                        step="any"
                        value={manualForm.quantity}
                        onChange={(e) => setManualForm({...manualForm, quantity: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Price per Unit</label>
                      <input
                        type="number"
                        step="any"
                        value={manualForm.price}
                        onChange={(e) => setManualForm({...manualForm, price: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddInvestment}
                    disabled={!manualForm.name || !manualForm.quantity || !manualForm.price}
                    className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    Add Manual Asset
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
