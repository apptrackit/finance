import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Plus, X, Wallet, TrendingUp, Building, Pencil, Trash2, Check } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
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

export function AccountList({ accounts, onAccountAdded }: { accounts: Account[], onAccountAdded: () => void }) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'cash',
    balance: '',
    currency: 'HUF'
  })

  const resetForm = () => {
    setFormData({ name: '', type: 'cash', balance: '', currency: 'HUF' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await apiFetch(`${API_BASE_URL}/accounts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            balance: parseFloat(formData.balance) || 0
          }),
        })
        setEditingId(null)
      } else {
        await apiFetch(`${API_BASE_URL}/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            balance: parseFloat(formData.balance) || 0
          }),
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
      currency: account.currency
    })
    setEditingId(account.id)
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this account and all its transactions?')) return
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
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  placeholder="e.g. OTP Bank" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select 
                  id="type" 
                  value={formData.type} 
                  onChange={e => setFormData({...formData, type: e.target.value as any})}
                >
                  <option value="cash">💵 Cash / Bank</option>
                  <option value="investment">📈 Investment</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select 
                  id="currency" 
                  value={formData.currency} 
                  onChange={e => setFormData({...formData, currency: e.target.value})}
                >
                  <option value="HUF">🇭🇺 HUF</option>
                  <option value="EUR">🇪🇺 EUR</option>
                  <option value="USD">🇺🇸 USD</option>
                  <option value="GBP">🇬🇧 GBP</option>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="balance">Current Balance</Label>
                <Input 
                  id="balance" 
                  type="number" 
                  step={formData.currency === 'HUF' ? '1' : '0.01'}
                  value={formData.balance} 
                  onChange={e => setFormData({...formData, balance: e.target.value})} 
                  placeholder="0" 
                  required 
                />
              </div>
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
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{account.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{account.type === 'cash' ? 'Cash / Bank' : 'Investment'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className={`font-bold text-sm ${account.balance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                      {account.balance < 0 && '-'}
                      {formatCurrency(account.balance, account.currency)}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8"
                      onClick={() => handleEdit(account)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(account.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
          
          {accounts.length === 0 && !isAdding && (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No accounts yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add your first account to get started</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
