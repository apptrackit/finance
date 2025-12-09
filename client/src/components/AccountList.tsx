import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Plus, X, Wallet, TrendingUp, Building, Pencil, Trash2, Check, Search } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'
import { usePrivacy } from '../context/PrivacyContext'
import { useAlert } from '../context/AlertContext'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
}

const accountIcons = {
  cash: Wallet,
  investment: TrendingUp,
}

const accountColors = {
  cash: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400',
  investment: 'from-blue-500/20 to-blue-500/5 text-blue-400',
}

const currencySymbols: Record<string, string> = {
  HUF: 'Ft',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

export function AccountList({ accounts, onAccountAdded, loading }: { accounts: Account[], onAccountAdded: () => void, loading?: boolean }) {
  const { confirm } = useAlert()
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

  const { privacyMode, shouldHideInvestment } = usePrivacy()

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
                  required
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

        <div className="space-y-2">
          {accounts.map(account => {
            const Icon = accountIcons[account.type] || Wallet
            const colorClass = accountColors[account.type] || accountColors.cash

            return (
              <div
                key={account.id}
                className="group flex items-center justify-between p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border/50 transition-all duration-200"
                onClick={() => setActiveAccountId(activeAccountId === account.id ? null : account.id)}
              >
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {account.name}
                      {account.symbol && <span className="ml-2 text-xs text-muted-foreground">({account.symbol})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{account.type === 'cash' ? 'Cash / Bank' : 'Investment'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className={`font-bold text-sm ${account.balance >= 0 ? 'text-foreground' : 'text-destructive'} ${privacyMode === 'hidden' || (account.type === 'investment' && shouldHideInvestment()) ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' || (account.type === 'investment' && shouldHideInvestment()) ? (
                        '••••••'
                      ) : (
                        <>
                          {account.balance < 0 && '-'}
                          {account.type === 'investment'
                            ? `${Math.abs(account.balance).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${account.currency}`
                            : formatCurrency(account.balance, account.currency)
                          }
                        </>
                      )}
                    </p>
                  </div>
                  <div className={`flex gap-1 transition-opacity ${activeAccountId === account.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(account)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(account.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}

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
        </div>
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
