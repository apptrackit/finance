import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Plus, X, ArrowDownLeft, ArrowUpRight, Receipt, RefreshCw, Pencil, Trash2, Check, ArrowRightLeft, Coins } from 'lucide-react'
import { format } from 'date-fns'

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  is_recurring: boolean
}

type Account = {
  id: string
  name: string
  balance: number
  currency: string
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

// LocalStorage keys for remembering last used values
const STORAGE_KEYS = {
  expenseAccount: 'finance_last_expense_account',
  expenseCategory: 'finance_last_expense_category',
  incomeAccount: 'finance_last_income_account',
  incomeCategory: 'finance_last_income_category',
  transferFrom: 'finance_last_transfer_from',
  transferTo: 'finance_last_transfer_to',
}

export function TransactionList({ 
  transactions, 
  accounts, 
  onTransactionAdded 
}: { 
  transactions: Transaction[], 
  accounts: Account[],
  onTransactionAdded: () => void 
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [formData, setFormData] = useState({
    account_id: '',
    to_account_id: '',
    category_id: '',
    amount: '',
    amount_to: '',
    fee: '0',
    description: '',
    date: new Date().toISOString().split('T')[0],
    is_recurring: false,
    type: 'expense' as 'expense' | 'income' | 'transfer'
  })
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null)
  const [isLoadingRate, setIsLoadingRate] = useState(false)

  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(console.error)
  }, [])

  // Fetch exchange rate when transfer accounts are selected
  useEffect(() => {
    if (formData.type !== 'transfer' || !formData.account_id || !formData.to_account_id) {
      setSuggestedRate(null)
      setExchangeRate(null)
      return
    }

    const fromAccount = accounts.find(a => a.id === formData.account_id)
    const toAccount = accounts.find(a => a.id === formData.to_account_id)
    
    if (!fromAccount || !toAccount || fromAccount.currency === toAccount.currency) {
      setSuggestedRate(null)
      setExchangeRate(null)
      return
    }

    const fetchRate = async () => {
      setIsLoadingRate(true)
      try {
        const response = await fetch(`/api/transfers/exchange-rate?from=${fromAccount.currency}&to=${toAccount.currency}`)
        const data = await response.json()
        if (data.rate) {
          // If rate rounds to 0 with 2 decimals, keep more precision
          let roundedRate = Math.round(data.rate * 100) / 100
          if (roundedRate === 0 && data.rate > 0) {
            // Find minimum decimals needed to show non-zero value
            for (let decimals = 3; decimals <= 8; decimals++) {
              const factor = Math.pow(10, decimals)
              roundedRate = Math.round(data.rate * factor) / factor
              if (roundedRate > 0) break
            }
          }
          setSuggestedRate(roundedRate)
          setExchangeRate(roundedRate)
        }
      } catch (error) {
        console.error('Failed to fetch exchange rate:', error)
      } finally {
        setIsLoadingRate(false)
      }
    }

    fetchRate()
  }, [formData.account_id, formData.to_account_id, formData.type, accounts])

  // Auto-calculate amount_to when amount or rate changes
  useEffect(() => {
    if (formData.type !== 'transfer') return

    const fromAccount = accounts.find(a => a.id === formData.account_id)
    const toAccount = accounts.find(a => a.id === formData.to_account_id)
    const isDifferentCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency

    if (isDifferentCurrency && formData.amount && exchangeRate) {
      const calculated = parseFloat(formData.amount) * exchangeRate
      setFormData(prev => ({ ...prev, amount_to: calculated.toFixed(2) }))
    } else if (!isDifferentCurrency && formData.amount) {
      setFormData(prev => ({ ...prev, amount_to: formData.amount }))
    }
  }, [formData.amount, exchangeRate, formData.type, formData.account_id, formData.to_account_id, accounts])

  // Load saved defaults when opening the form
  const loadSavedDefaults = (type: 'expense' | 'income' | 'transfer') => {
    if (type === 'expense') {
      const savedAccount = localStorage.getItem(STORAGE_KEYS.expenseAccount) || ''
      const savedCategory = localStorage.getItem(STORAGE_KEYS.expenseCategory) || ''
      return { account_id: savedAccount, category_id: savedCategory, to_account_id: '', fee: '0' }
    } else if (type === 'income') {
      const savedAccount = localStorage.getItem(STORAGE_KEYS.incomeAccount) || ''
      const savedCategory = localStorage.getItem(STORAGE_KEYS.incomeCategory) || ''
      return { account_id: savedAccount, category_id: savedCategory, to_account_id: '', fee: '0' }
    } else {
      const savedFrom = localStorage.getItem(STORAGE_KEYS.transferFrom) || ''
      const savedTo = localStorage.getItem(STORAGE_KEYS.transferTo) || ''
      return { account_id: savedFrom, to_account_id: savedTo, category_id: '', fee: '0', amount_to: '' }
    }
  }

  // Save defaults to localStorage
  const saveDefaults = (type: 'expense' | 'income' | 'transfer') => {
    if (type === 'expense') {
      if (formData.account_id) localStorage.setItem(STORAGE_KEYS.expenseAccount, formData.account_id)
      if (formData.category_id) localStorage.setItem(STORAGE_KEYS.expenseCategory, formData.category_id)
    } else if (type === 'income') {
      if (formData.account_id) localStorage.setItem(STORAGE_KEYS.incomeAccount, formData.account_id)
      if (formData.category_id) localStorage.setItem(STORAGE_KEYS.incomeCategory, formData.category_id)
    } else {
      if (formData.account_id) localStorage.setItem(STORAGE_KEYS.transferFrom, formData.account_id)
      if (formData.to_account_id) localStorage.setItem(STORAGE_KEYS.transferTo, formData.to_account_id)
    }
  }

  const resetForm = () => {
    const defaults = loadSavedDefaults('expense')
    setFormData({
      account_id: defaults.account_id,
      to_account_id: '',
      category_id: defaults.category_id,
      amount: '',
      amount_to: '',
      fee: '0',
      description: '',
      date: new Date().toISOString().split('T')[0],
      is_recurring: false,
      type: 'expense'
    })
    setExchangeRate(null)
    setSuggestedRate(null)
  }

  // When opening the Add form, load defaults
  const handleOpenForm = () => {
    const defaults = loadSavedDefaults('expense')
    setFormData({
      account_id: defaults.account_id,
      to_account_id: '',
      category_id: defaults.category_id,
      amount: '',
      amount_to: '',
      fee: '0',
      description: '',
      date: new Date().toISOString().split('T')[0],
      is_recurring: false,
      type: 'expense'
    })
    setIsAdding(true)
  }

  // Handle type change with saved defaults
  const handleTypeChange = (newType: 'expense' | 'income' | 'transfer') => {
    const defaults = loadSavedDefaults(newType)
    setFormData({
      ...formData,
      type: newType,
      account_id: defaults.account_id,
      to_account_id: defaults.to_account_id,
      category_id: defaults.category_id,
      amount_to: defaults.amount_to || '',
      fee: defaults.fee,
      is_recurring: newType === 'transfer' ? false : formData.is_recurring
    })
    setExchangeRate(null)
    setSuggestedRate(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const amount = parseFloat(formData.amount)

      if (formData.type === 'transfer') {
        // Handle transfer
        const fee = parseFloat(formData.fee) || 0
        const amountTo = parseFloat(formData.amount_to) || amount
        await fetch('/api/transfers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_account_id: formData.account_id,
            to_account_id: formData.to_account_id,
            amount_from: amount,
            amount_to: amountTo,
            fee: fee,
            exchange_rate: exchangeRate,
            description: formData.description,
            date: formData.date
          })
        })
        saveDefaults('transfer')
      } else {
        // Handle expense/income
        const finalAmount = formData.type === 'expense' ? -Math.abs(amount) : Math.abs(amount)

        if (editingId) {
          await fetch(`/api/transactions/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: formData.account_id,
              category_id: formData.category_id || null,
              amount: finalAmount,
              description: formData.description,
              date: formData.date,
              is_recurring: formData.is_recurring
            })
          })
          setEditingId(null)
        } else {
          await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: formData.account_id,
              category_id: formData.category_id || null,
              amount: finalAmount,
              description: formData.description,
              date: formData.date,
              is_recurring: formData.is_recurring
            })
          })
        }
        saveDefaults(formData.type)
      }
      setIsAdding(false)
      resetForm()
      onTransactionAdded()
    } catch (error) {
      console.error('Failed to save transaction', error)
    }
  }

  const handleEdit = (tx: Transaction) => {
    const isIncome = tx.amount >= 0
    setFormData({
      account_id: tx.account_id,
      to_account_id: '',
      category_id: tx.category_id || '',
      amount: Math.abs(tx.amount).toString(),
      amount_to: '',
      fee: '0',
      description: tx.description || '',
      date: tx.date,
      is_recurring: tx.is_recurring,
      type: isIncome ? 'income' : 'expense'
    })
    setEditingId(tx.id)
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    try {
      await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      onTransactionAdded()
    } catch (error) {
      console.error('Failed to delete transaction', error)
    }
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingId(null)
    resetForm()
  }

  const getCategoryName = (id?: string) => {
    if (!id) return 'Uncategorized'
    const cat = categories.find(c => c.id === id)
    return cat ? cat.name : 'Unknown'
  }

  const getCategoryIcon = (id?: string) => {
    if (!id) return '📄'
    const cat = categories.find(c => c.id === id)
    return cat?.icon || '📄'
  }

  const getAccountName = (id: string) => {
    const acc = accounts.find(a => a.id === id)
    return acc ? acc.name : 'Unknown'
  }

  const getAccountCurrency = (id: string) => {
    const acc = accounts.find(a => a.id === id)
    return acc ? acc.currency : 'HUF'
  }

  // For transfer preview
  const fromAccount = accounts.find(a => a.id === formData.account_id)
  const toAccount = accounts.find(a => a.id === formData.to_account_id)
  const transferAmount = parseFloat(formData.amount) || 0
  const transferFee = parseFloat(formData.fee) || 0
  const totalDeduction = transferAmount + transferFee

  // Group transactions by date
  const groupedTransactions = transactions.reduce((groups, tx) => {
    const date = tx.date
    if (!groups[date]) groups[date] = []
    groups[date].push(tx)
    return groups
  }, {} as Record<string, Transaction[]>)

  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Transactions</CardTitle>
            <p className="text-xs text-muted-foreground">{transactions.length} total</p>
          </div>
        </div>
        <Button 
          onClick={() => isAdding ? handleCancel() : handleOpenForm()} 
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
            {/* Transaction Type Selector - 3 options now */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`p-3 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                  formData.type === 'expense' 
                    ? 'border-destructive/50 bg-destructive/10 text-destructive' 
                    : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                <span className="text-sm font-medium">Expense</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`p-3 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                  formData.type === 'income' 
                    ? 'border-success/50 bg-success/10 text-success' 
                    : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
                }`}
              >
                <ArrowDownLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Income</span>
              </button>
              <button
                type="button"
                disabled={!!editingId}
                onClick={() => handleTypeChange('transfer')}
                className={`p-3 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                  formData.type === 'transfer' 
                    ? 'border-primary/50 bg-primary/10 text-primary' 
                    : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
                } ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Transfer</span>
              </button>
            </div>

            {/* Transfer Form */}
            {formData.type === 'transfer' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="from_account">From Account</Label>
                    <Select 
                      id="from_account" 
                      value={formData.account_id} 
                      onChange={e => setFormData({...formData, account_id: e.target.value})}
                      required
                    >
                      <option value="">Select Account</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.balance.toLocaleString('hu-HU')} {acc.currency})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="to_account">To Account</Label>
                    <Select 
                      id="to_account" 
                      value={formData.to_account_id} 
                      onChange={e => setFormData({...formData, to_account_id: e.target.value})}
                      required
                    >
                      <option value="">Select Account</option>
                      {accounts
                        .filter(acc => acc.id !== formData.account_id)
                        .map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.balance.toLocaleString('hu-HU')} {acc.currency})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_amount">
                      Amount to Send {fromAccount && `(${fromAccount.currency})`}
                    </Label>
                    <Input 
                      id="transfer_amount" 
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      value={formData.amount} 
                      onChange={e => {
                        const value = e.target.value
                        // Allow empty or valid number with max 2 decimals
                        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                          setFormData({...formData, amount: value})
                        }
                      }} 
                      placeholder="0.00" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_amount_to">
                      Amount to Receive {toAccount && `(${toAccount.currency})`}
                    </Label>
                    <Input 
                      id="transfer_amount_to" 
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      value={formData.amount_to} 
                      onChange={e => {
                        const value = e.target.value
                        // Allow empty or valid number with max 2 decimals
                        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                          setFormData({...formData, amount_to: value})
                        }
                      }} 
                      placeholder="0.00" 
                      required
                      disabled={!fromAccount || !toAccount || fromAccount.currency === toAccount.currency}
                    />
                  </div>
                </div>

                {/* Exchange Rate Section */}
                {fromAccount && toAccount && fromAccount.currency !== toAccount.currency && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 space-y-2">
                    <Label htmlFor="exchange_rate" className="text-xs font-medium text-blue-900 dark:text-blue-100">
                      Exchange Rate
                    </Label>
                    {isLoadingRate ? (
                      <p className="text-sm text-muted-foreground">Loading exchange rate...</p>
                    ) : (
                      <>
                        {suggestedRate && (
                          <p className="text-xs text-muted-foreground">
                            Suggested: 1 {fromAccount.currency} = {suggestedRate < 0.01 ? suggestedRate.toFixed(8).replace(/\.?0+$/, '') : suggestedRate.toFixed(2)} {toAccount.currency}
                          </p>
                        )}
                        <Input 
                          id="exchange_rate"
                          type="number" 
                          step="any"
                          min="0.00000001"
                          value={exchangeRate || ''} 
                          onChange={e => {
                            const value = e.target.value
                            if (value === '') {
                              setExchangeRate(null)
                              return
                            }
                            const rate = parseFloat(value)
                            if (!isNaN(rate) && rate > 0) {
                              setExchangeRate(rate)
                            }
                          }} 
                          placeholder="Enter custom rate"
                          className="bg-white dark:bg-background"
                        />
                        {exchangeRate && formData.amount && (
                          <p className="text-xs text-muted-foreground">
                            {parseFloat(formData.amount).toFixed(2)} {fromAccount.currency} = {(parseFloat(formData.amount) * exchangeRate).toFixed(2)} {toAccount.currency}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="transfer_fee" className="flex items-center gap-1">
                      <Coins className="h-3 w-3" />
                      Transfer Fee {fromAccount && `(${fromAccount.currency})`}
                    </Label>
                    <Input 
                      id="transfer_fee" 
                      type="number" 
                      step="0.01" 
                      min="0"
                      value={formData.fee} 
                      onChange={e => {
                        const value = e.target.value
                        // Allow empty or valid number with max 2 decimals
                        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                          setFormData({...formData, fee: value})
                        }
                      }} 
                      placeholder="0.00" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_date">Date</Label>
                    <Input 
                      id="transfer_date" 
                      type="date" 
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})} 
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer_description">Note (optional)</Label>
                  <Input 
                    id="transfer_description" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    placeholder="e.g. Monthly savings" 
                  />
                </div>

                {/* Transfer Preview */}
                {fromAccount && toAccount && transferAmount > 0 && (
                  <div className="p-3 rounded-lg bg-background/50 border border-border space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
                    <div className="flex items-center justify-between text-sm">
                      <span>{fromAccount.name}</span>
                      <span className="text-destructive font-medium">-{totalDeduction.toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {fromAccount.currency}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>{toAccount.name}</span>
                      <span className="text-success font-medium">+{(parseFloat(formData.amount_to) || transferAmount).toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {toAccount.currency}</span>
                    </div>
                    {transferFee > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                        <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> Fee</span>
                        <span>{transferFee.toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {fromAccount.currency}</span>
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full">
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transfer Funds
                </Button>
              </div>
            ) : (
              /* Expense/Income Form */
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input 
                      id="amount" 
                      type="number" 
                      step="1" 
                      value={formData.amount} 
                      onChange={e => setFormData({...formData, amount: e.target.value})} 
                      placeholder="0" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account">Account</Label>
                    <Select 
                      id="account" 
                      value={formData.account_id} 
                      onChange={e => setFormData({...formData, account_id: e.target.value})}
                      required
                    >
                      <option value="">Select Account</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select 
                      id="category" 
                      value={formData.category_id} 
                      onChange={e => setFormData({...formData, category_id: e.target.value})}
                    >
                      <option value="">Select Category</option>
                      {categories
                        .filter(c => c.type === formData.type)
                        .map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input 
                      id="date" 
                      type="date" 
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})} 
                      required 
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input 
                      id="description" 
                      value={formData.description} 
                      onChange={e => setFormData({...formData, description: e.target.value})} 
                      placeholder="e.g. Grocery shopping" 
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border">
                    <input 
                      type="checkbox" 
                      id="recurring" 
                      checked={formData.is_recurring} 
                      onChange={e => setFormData({...formData, is_recurring: e.target.checked})}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                    />
                    <Label htmlFor="recurring" className="flex items-center gap-2 cursor-pointer">
                      <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      Recurring monthly
                    </Label>
                  </div>
                </div>
                <Button type="submit" className="w-full" variant={formData.type === 'income' ? 'success' : 'default'}>
                  {editingId ? <Check className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {editingId ? 'Save Changes' : `Add ${formData.type === 'income' ? 'Income' : 'Expense'}`}
                </Button>
              </>
            )}
          </form>
        )}

        <div className="space-y-4">
          {sortedDates.map(date => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {format(new Date(date), 'EEEE, MMM d')}
                </div>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-1">
                {groupedTransactions[date].map(tx => (
                  <div 
                    key={tx.id} 
                    className="group flex items-center justify-between p-3 rounded-xl hover:bg-secondary/30 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-lg ${
                        tx.amount >= 0 
                          ? 'bg-success/10' 
                          : 'bg-secondary'
                      }`}>
                        {getCategoryIcon(tx.category_id)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{tx.description || getCategoryName(tx.category_id)}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{getAccountName(tx.account_id)}</span>
                          {tx.is_recurring && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-primary">
                                <RefreshCw className="h-3 w-3" />
                                Recurring
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`font-bold text-sm ${tx.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {tx.amount >= 0 ? '+' : '-'}
                        {Math.abs(tx.amount).toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {getAccountCurrency(tx.account_id)}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8"
                          onClick={() => handleEdit(tx)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(tx.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {transactions.length === 0 && !isAdding && (
            <div className="text-center py-12">
              <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                <Receipt className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No transactions yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Record your first transaction to start tracking</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
