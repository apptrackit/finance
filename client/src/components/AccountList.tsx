import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Plus, X, Wallet, Building, Pencil, Trash2, Check, Search, Lock, LockOpen } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'
import { usePrivacy } from '../context/PrivacyContext'
import { useAlert } from '../context/AlertContext'
import { useLockedAccounts } from '../context/LockedAccountsContext'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
}

const currencySymbols: Record<string, string> = {
  HUF: 'Ft',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

type MarketQuote = {
  symbol: string
  regularMarketPrice?: number
  shortName?: string
  currency?: string
  regularMarketChangePercent?: number
}

export function AccountList({ accounts, onAccountAdded, loading }: { accounts: Account[], onAccountAdded: () => void, loading?: boolean }) {
  const { confirm } = useAlert()
  const { isLocked, lockAccount, unlockAccount } = useLockedAccounts()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'cash',
    balance: '',
    currency: 'HUF',
    symbol: '',
    asset_type: 'stock' as 'stock' | 'crypto' | 'manual',
    adjustWithTransaction: false
  })

  // For investment account creation
  const [showSymbolSearch, setShowSymbolSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})

  const { privacyMode, shouldHideInvestment } = usePrivacy()

  // Fetch exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD')
        const data = await response.json()
        if (data.rates) {
          setExchangeRates(data.rates)
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error)
      }
    }
    fetchRates()
  }, [])

  // Fetch market quotes for investment accounts
  useEffect(() => {
    const fetchQuotes = async () => {
      const investmentAccounts = accounts.filter(a => a.type === 'investment' && a.symbol && a.asset_type !== 'manual')
      if (investmentAccounts.length === 0) return

      const symbols = [...new Set(investmentAccounts.map(a => a.symbol!))]
      const newQuotes: Record<string, MarketQuote> = {}

      await Promise.all(symbols.map(async (symbol) => {
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

      setQuotes(newQuotes)
    }

    if (accounts.length > 0) {
      fetchQuotes()
    }
  }, [accounts])

  // Calculate percentages for cash and investment accounts
  const calculatePercentages = () => {
    const cashAccounts = accounts.filter(a => a.type === 'cash')
    const investmentAccounts = accounts.filter(a => a.type === 'investment')

    // Calculate total cash value in USD
    const totalCashUSD = cashAccounts.reduce((sum, account) => {
      const rate = exchangeRates[account.currency] || 1
      return sum + (account.balance / rate)
    }, 0)

    // Calculate total investment value in USD (current market value, not cost basis)
    const totalInvestmentUSD = investmentAccounts.reduce((sum, account) => {
      if (account.asset_type === 'manual') {
        // For manual accounts, balance is in the account's currency
        const rate = exchangeRates[account.currency] || 1
        return sum + (account.balance / rate)
      } else if (account.symbol && quotes[account.symbol]) {
        // For stocks/crypto, balance is the quantity, multiply by current price
        const currentPrice = quotes[account.symbol].regularMarketPrice || 0
        return sum + (account.balance * currentPrice)
      }
      return sum
    }, 0)

    // Calculate percentages
    const cashPercentages: Record<string, number> = {}
    cashAccounts.forEach(account => {
      const rate = exchangeRates[account.currency] || 1
      const valueUSD = account.balance / rate
      cashPercentages[account.id] = totalCashUSD > 0 ? (valueUSD / totalCashUSD) * 100 : 0
    })

    const investmentPercentages: Record<string, number> = {}
    investmentAccounts.forEach(account => {
      let valueUSD = 0
      if (account.asset_type === 'manual') {
        const rate = exchangeRates[account.currency] || 1
        valueUSD = account.balance / rate
      } else if (account.symbol && quotes[account.symbol]) {
        const currentPrice = quotes[account.symbol].regularMarketPrice || 0
        valueUSD = account.balance * currentPrice
      }
      investmentPercentages[account.id] = totalInvestmentUSD > 0 ? (valueUSD / totalInvestmentUSD) * 100 : 0
    })

    return { cashPercentages, investmentPercentages, totalCashUSD, totalInvestmentUSD }
  }

  const { cashPercentages, investmentPercentages } = calculatePercentages()

  const resetForm = () => {
    setFormData({ name: '', type: 'cash', balance: '', currency: 'HUF', symbol: '', asset_type: 'stock', adjustWithTransaction: false })
    setShowSymbolSearch(false)
    setSearchQuery('')
    setSearchResults([])
    setManualMode(false)
  }

  const handleTypeChange = (newType: string) => {
    setFormData({ ...formData, type: newType as 'cash' | 'investment' })
  }

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

  const handleSelectAsset = (asset: any) => {
    const assetType = asset.quoteType === 'CRYPTOCURRENCY' ? 'crypto' : 'stock'
    // For crypto, currency is the crypto symbol (e.g., BTC). For stocks, use 'SHARE'
    const currency = assetType === 'crypto' ? asset.symbol.split('-')[0] : 'SHARE'
    setFormData({
      ...formData,
      name: asset.shortname || asset.longname || asset.symbol,
      symbol: asset.symbol,
      asset_type: assetType,
      currency: currency
    })
    setShowSymbolSearch(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleManualAsset = () => {
    setFormData({
      ...formData,
      currency: 'HUF',
      asset_type: 'manual'
    })
    setShowSymbolSearch(false)
    setManualMode(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload: any = {
        name: formData.name,
        type: formData.type,
        balance: parseFloat(formData.balance) || 0,
        currency: formData.currency
      }

      if (formData.type === 'investment') {
        payload.symbol = formData.symbol || null
        payload.asset_type = formData.asset_type
      }

      if (editingId) {
        // Include the adjustWithTransaction flag when editing
        payload.adjustWithTransaction = formData.adjustWithTransaction

        await apiFetch(`${API_BASE_URL}/accounts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setEditingId(null)
      } else {
        await apiFetch(`${API_BASE_URL}/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      setIsAdding(false)
      resetForm()
      onAccountAdded()
    } catch (error) {
      console.error('Failed to save account', error)
    }
  }

  const handleEdit = (account: Account) => {
    setFormData({
      name: account.name,
      type: account.type,
      balance: account.balance.toString(),
      currency: account.currency,
      symbol: account.symbol || '',
      asset_type: account.asset_type || 'stock',
      adjustWithTransaction: false
    })
    // Set manual mode if it's a manual asset
    if (account.asset_type === 'manual') {
      setManualMode(true)
    }
    setEditingId(account.id)
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Account',
      message: 'Delete this account and all its transactions? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })
    
    if (!confirmed) return
    
    try {
      await apiFetch(`${API_BASE_URL}/accounts/${id}`, { method: 'DELETE' })
      onAccountAdded()
    } catch (error) {
      console.error('Failed to delete account', error)
    }
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingId(null)
    resetForm()
  }

  const handleLockToggle = async (accountId: string) => {
    if (isLocked(accountId)) {
      // Unlocking requires confirmation
      const confirmed = await confirm({
        title: 'Unlock Account',
        message: 'Are you sure you want to unlock this account? You will be able to edit, delete, and add transactions again.',
        confirmText: 'Unlock',
        cancelText: 'Cancel'
      })
      
      if (confirmed) {
        unlockAccount(accountId)
      }
    } else {
      // Locking doesn't require confirmation
      lockAccount(accountId)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currencySymbols[currency] || currency
    const formatted = Math.abs(amount).toLocaleString('hu-HU', {
      minimumFractionDigits: currency === 'HUF' ? 0 : 2,
      maximumFractionDigits: currency === 'HUF' ? 0 : 2
    })
    return currency === 'HUF' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
  }

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <Building className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">Accounts</CardTitle>
        </div>
        <Button
          onClick={() => isAdding ? handleCancel() : setIsAdding(true)}
          size="sm"
          variant={isAdding ? "ghost" : "outline"}
          className="h-8"
        >
          {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span className="ml-1">{isAdding ? 'Cancel' : 'Add'}</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdding && (
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-secondary/50 border border-border/50 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="name">Account Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. OTP Bank"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  id="type"
                  value={formData.type}
                  onChange={e => handleTypeChange(e.target.value)}
                >
                  <option value="cash">💵 Cash / Bank</option>
                  <option value="investment">📈 Investment</option>
                </Select>
              </div>

              {formData.type === 'cash' && (
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    id="currency"
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                  >
                    <option value="HUF">🇭🇺 HUF</option>
                    <option value="EUR">🇪🇺 EUR</option>
                    <option value="USD">🇺🇸 USD</option>
                    <option value="GBP">🇬🇧 GBP</option>
                  </Select>
                </div>
              )}

              {formData.type === 'investment' && !formData.symbol && !editingId && (
                <div className="space-y-2">
                  <Label>Asset Symbol</Label>
                  <button
                    type="button"
                    onClick={() => setShowSymbolSearch(true)}
                    className="w-full p-2 border border-border rounded-lg text-left text-sm text-muted-foreground hover:bg-secondary/50 transition-colors"
                  >
                    Search for asset...
                  </button>
                </div>
              )}
              <div className="col-span-2 space-y-2">
                <Label htmlFor="balance">{formData.type === 'investment' ? 'Initial Quantity (0 if tracking from transactions)' : 'Current Balance'}</Label>
                <Input
                  id="balance"
                  type="number"
                  step={formData.type === 'investment' || formData.currency === 'SHARE' ? 'any' : (formData.currency === 'HUF' ? '1' : '0.01')}
                  value={formData.balance}
                  onChange={e => setFormData({ ...formData, balance: e.target.value })}
                  placeholder="0"
                />
              </div>

              {formData.type === 'investment' && formData.symbol && (
                <div className="col-span-2 p-3 bg-secondary/30 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="font-bold">{formData.symbol}</div>
                    <div className="text-sm text-muted-foreground">{formData.name}</div>
                  </div>
                  {!editingId && (
                    <button
                      type="button"
                      onClick={() => { setShowSymbolSearch(true); setFormData({ ...formData, symbol: '', name: '' }) }}
                      className="text-xs text-primary hover:underline"
                    >
                      Change
                    </button>
                  )}
                </div>
              )}

              {formData.type === 'investment' && manualMode && !formData.symbol && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="manual-currency">Currency</Label>
                    <Select
                      id="manual-currency"
                      value={formData.currency}
                      onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    >
                      <option value="HUF">🇭🇺 HUF</option>
                      <option value="EUR">🇪🇺 EUR</option>
                      <option value="USD">🇺🇸 USD</option>
                      <option value="GBP">🇬🇧 GBP</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-symbol">Symbol (Optional)</Label>
                    <Input
                      id="manual-symbol"
                      value={formData.symbol}
                      onChange={e => setFormData({ ...formData, symbol: e.target.value.slice(0, 5) })}
                      placeholder="e.g. MÁP+"
                      maxLength={5}
                    />
                  </div>
                </>
              )}

              {/* Checkbox for adjusting with transaction - only shown when editing */}
              {editingId && (
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg border border-border/30">
                    <input
                      id="adjust-with-transaction"
                      type="checkbox"
                      checked={formData.adjustWithTransaction}
                      onChange={e => setFormData({ ...formData, adjustWithTransaction: e.target.checked })}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    />
                    <Label htmlFor="adjust-with-transaction" className="cursor-pointer text-sm font-normal">
                      Adjust balance with a transaction instead of direct update
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground px-1">
                    {formData.adjustWithTransaction
                      ? "A transaction will be created for the difference between old and new balance"
                      : "Balance will be updated directly without creating a transaction"}
                  </p>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full">
              {editingId ? <Check className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {editingId ? 'Save Changes' : 'Add Account'}
            </Button>
          </form>
        )}

        {/* Cash Accounts Section */}
        {accounts.filter(a => a.type === 'cash').length > 0 && (
          <div className="space-y-3 mb-6">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Cash Accounts</h4>
            <div className="space-y-2">
              {accounts.filter(a => a.type === 'cash').map(account => {
                const percentage = cashPercentages[account.id] || 0
                
                return (
                  <div
                    key={account.id}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300"
                    onClick={() => setActiveAccountId(activeAccountId === account.id ? null : account.id)}
                  >
                    {/* Percentage bar background */}
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                    
                    <div className="relative p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                          <Wallet className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-base truncate">{account.name}</p>
                            <span className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                          <p className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {privacyMode === 'hidden' ? '••••••' : formatCurrency(account.balance, account.currency)}
                          </p>
                        </div>
                      </div>
                      
                      <div className={`flex gap-1 ml-3 transition-opacity ${activeAccountId === account.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-9 w-9 ${isLocked(account.id) ? 'text-amber-500 hover:bg-amber-500/20' : 'hover:bg-emerald-500/20'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleLockToggle(account.id)
                          }}
                          title={isLocked(account.id) ? 'Unlock account' : 'Lock account'}
                        >
                          {isLocked(account.id) ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                        </Button>
                        {!isLocked(account.id) && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 hover:bg-emerald-500/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(account)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-destructive hover:text-destructive hover:bg-red-500/10"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(account.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Investment Accounts Section */}
        {accounts.filter(a => a.type === 'investment').length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Investment Accounts</h4>
            <div className="space-y-2">
              {accounts.filter(a => a.type === 'investment').map(account => {
                const percentage = investmentPercentages[account.id] || 0
                const quote = account.symbol ? quotes[account.symbol] : null
                const priceChange = quote?.regularMarketChangePercent || 0
                
                return (
                  <div
                    key={account.id}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/5 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300"
                    onClick={() => setActiveAccountId(activeAccountId === account.id ? null : account.id)}
                  >
                    {/* Percentage bar background */}
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500/20 to-purple-500/10 transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                    
                    <div className="relative p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shadow-lg font-bold text-sm ${
                          account.asset_type === 'crypto' 
                            ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-orange-500/25' 
                            : account.asset_type === 'manual' 
                            ? 'bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-gray-500/25' 
                            : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/25'
                        }`}>
                          {account.symbol?.slice(0, 3).toUpperCase() || account.name.slice(0, 3).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-base truncate">
                              {account.symbol || account.name}
                            </p>
                            <span className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium">
                              {percentage.toFixed(1)}%
                            </span>
                            {account.asset_type !== 'manual' && priceChange !== 0 && (
                              <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium ${
                                priceChange >= 0 
                                  ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                                  : 'bg-red-500/20 text-red-600 dark:text-red-400'
                              }`}>
                                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-2">
                            <p className={`text-lg font-bold ${privacyMode === 'hidden' || shouldHideInvestment() ? 'select-none' : ''}`}>
                              {privacyMode === 'hidden' || shouldHideInvestment() ? (
                                '••••••'
                              ) : (
                                `${account.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${account.currency}`
                              )}
                            </p>
                            {quote?.regularMarketPrice && (
                              <p className="text-xs text-muted-foreground">
                                @ ${quote.regularMarketPrice.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className={`flex gap-1 ml-3 transition-opacity ${activeAccountId === account.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-9 w-9 ${isLocked(account.id) ? 'text-amber-500 hover:bg-amber-500/20' : 'hover:bg-blue-500/20'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleLockToggle(account.id)
                          }}
                          title={isLocked(account.id) ? 'Unlock account' : 'Lock account'}
                        >
                          {isLocked(account.id) ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                        </Button>
                        {!isLocked(account.id) && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 hover:bg-blue-500/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(account)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-destructive hover:text-destructive hover:bg-red-500/10"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(account.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {accounts.length === 0 && !isAdding && (
          loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No accounts yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add your first account to get started</p>
            </div>
          )
        )}
      </CardContent>

      {/* Symbol Search Modal */}
      {showSymbolSearch && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold">Select Investment Asset</h3>
              <button onClick={() => { setShowSymbolSearch(false); resetForm(); setIsAdding(false); }} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="p-4 space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search symbol (e.g. AAPL, BTC-USD)"
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={searching}
                  size="icon"
                >
                  {searching ? '...' : <Search className="h-4 w-4" />}
                </Button>
              </form>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {searchResults.map((result: any) => (
                  <button
                    key={result.symbol}
                    onClick={() => handleSelectAsset(result)}
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

              <div className="pt-4 border-t border-border">
                <Button
                  onClick={handleManualAsset}
                  variant="outline"
                  className="w-full"
                >
                  Enter Manually
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
