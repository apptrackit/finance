import { useState, useEffect } from 'react'
import { Modal } from '../common/modal'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { Plus, Trash2, AlertCircle, Percent } from 'lucide-react'

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type Account = {
  id: string
  name: string
  currency: string
  type: 'cash' | 'investment'
}

export type BulkTransaction = {
  id: string
  description: string
  amount: string
  category_id: string
  account_id: string
  date: string
  type: 'expense' | 'income'
  exclude_from_estimate: boolean
}

interface BulkTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (transactions: BulkTransaction[]) => Promise<void>
  accounts: Account[]
  categories: Category[]
  defaultAccountId?: string
  defaultDate?: string
}

export function BulkTransactionModal({
  isOpen,
  onClose,
  onConfirm,
  accounts,
  categories,
  defaultAccountId = '',
  defaultDate = new Date().toISOString().split('T')[0]
}: BulkTransactionModalProps) {
  const [totalAmount, setTotalAmount] = useState('')
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense')
  const [transactions, setTransactions] = useState<BulkTransaction[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setTotalAmount('')
      setTransactionType('expense')
      setTransactions([createEmptyTransaction()])
    }
  }, [isOpen])

  const createEmptyTransaction = (): BulkTransaction => ({
    id: crypto.randomUUID(),
    description: '',
    amount: '',
    category_id: '',
    account_id: defaultAccountId || accounts.find(a => a.type === 'cash')?.id || '',
    date: defaultDate,
    type: transactionType,
    exclude_from_estimate: false
  })

  const addTransaction = () => {
    const lastTx = transactions[transactions.length - 1]
    setTransactions([
      ...transactions,
      {
        ...createEmptyTransaction(),
        account_id: lastTx?.account_id || defaultAccountId || '',
        date: lastTx?.date || defaultDate,
        type: transactionType
      }
    ])
  }

  const removeTransaction = (id: string) => {
    if (transactions.length > 1) {
      setTransactions(transactions.filter(t => t.id !== id))
    }
  }

  const updateTransaction = (id: string, field: keyof BulkTransaction, value: string | boolean) => {
    setTransactions(transactions.map(t => {
      if (t.id !== id) return t
      return { ...t, [field]: value }
    }))
  }

  const formatAmount = (value: string): string => {
    const cleaned = value.replace(/\s/g, '')
    if (!/^\d*\.?\d*$/.test(cleaned)) return value
    
    if (cleaned.includes('.')) {
      const [integer, decimal] = cleaned.split('.')
      return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + (decimal || '')
    }
    return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  }

  const parsedTotal = parseFloat(totalAmount.replace(/\s/g, '')) || 0
  const allocatedAmount = transactions.reduce((sum, t) => {
    return sum + (parseFloat(t.amount.replace(/\s/g, '')) || 0)
  }, 0)
  const remaining = parsedTotal - allocatedAmount

  const isValid = 
    parsedTotal > 0 &&
    Math.abs(remaining) < 0.01 &&
    transactions.every(t => 
      t.amount && 
      parseFloat(t.amount.replace(/\s/g, '')) > 0 && 
      t.account_id
    )

  const handleConfirm = async () => {
    if (!isValid || isSubmitting) return
    
    setIsSubmitting(true)
    try {
      // Set the type for all transactions based on transactionType
      const finalTransactions = transactions.map(t => ({
        ...t,
        type: transactionType
      }))
      await onConfirm(finalTransactions)
      onClose()
    } catch (error) {
      console.error('Failed to create bulk transactions', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEqualSplit = () => {
    if (parsedTotal <= 0 || transactions.length === 0) return
    const amountPerSplit = parsedTotal / transactions.length
    setTransactions(transactions.map(t => ({
      ...t,
      amount: formatAmount(amountPerSplit.toFixed(2))
    })))
  }

  const handleAutoBalance = () => {
    // Put all remaining amount into the last transaction
    if (transactions.length > 0 && remaining > 0) {
      const lastTx = transactions[transactions.length - 1]
      const currentAmount = parseFloat(lastTx.amount.replace(/\s/g, '')) || 0
      const newAmount = currentAmount + remaining
      
      setTransactions(transactions.map((t, idx) => 
        idx === transactions.length - 1 
          ? { ...t, amount: formatAmount(newAmount.toFixed(2)) }
          : t
      ))
    }
  }

  const handleQuickFill = () => {
    if (transactions.length === 1 && parsedTotal > 0) {
      setTransactions([{ ...transactions[0], amount: formatAmount(parsedTotal.toFixed(2)) }])
    }
  }

  const getPercentage = (amount: string) => {
    const val = parseFloat(amount.replace(/\s/g, '')) || 0
    if (parsedTotal === 0) return 0
    return (val / parsedTotal) * 100
  }

  const filteredCategories = categories.filter(c => c.type === transactionType)
  const defaultAccount = accounts.find(a => a.type === 'cash')
  const accountCurrency = defaultAccount?.currency || 'HUF'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Add Transactions">
      <div className="space-y-3 sm:space-y-5">
        {/* Total Amount Input */}
        <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 border border-border/30 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Total Amount</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={totalAmount}
              onChange={e => setTotalAmount(formatAmount(e.target.value))}
              placeholder="Enter total amount to split"
              className="h-11 sm:h-10 text-lg font-semibold"
            />
          </div>
          
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTransactionType('expense')}
              className={`p-3 sm:p-2.5 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] ${
                transactionType === 'expense' 
                  ? 'border-destructive/50 bg-destructive/10 text-destructive' 
                  : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
              }`}
            >
              <span className="text-sm font-medium">− Expense</span>
            </button>
            <button
              type="button"
              onClick={() => setTransactionType('income')}
              className={`p-3 sm:p-2.5 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] ${
                transactionType === 'income' 
                  ? 'border-success/50 bg-success/10 text-success' 
                  : 'border-border bg-background/50 text-muted-foreground hover:bg-background'
              }`}
            >
              <span className="text-sm font-medium">+ Income</span>
            </button>
          </div>

          {/* Allocation Status */}
          {parsedTotal > 0 && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Allocated:</span>
                <span className={`font-medium ${Math.abs(remaining) < 0.01 ? 'text-green-500' : 'text-foreground'}`}>
                  {allocatedAmount.toLocaleString()} / {parsedTotal.toLocaleString()} {accountCurrency}
                </span>
              </div>
              {Math.abs(remaining) >= 0.01 && (
                <div className="flex items-center gap-2 mt-2 text-xs sm:text-sm">
                  <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500 flex-shrink-0" />
                  <span className="text-orange-500 font-medium">
                    Remaining: {remaining.toFixed(2)} {accountCurrency}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {parsedTotal > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEqualSplit}
              className="flex-1"
            >
              <Percent className="h-3 w-3 mr-1" />
              Split Equally
            </Button>
            {Math.abs(remaining) >= 0.01 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoBalance}
                className="flex-1"
              >
                Auto-Balance
              </Button>
            )}
          </div>
        )}

        {/* Quick Fill Button */}
        {transactions.length === 1 && parsedTotal > 0 && allocatedAmount === 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleQuickFill}
            className="w-full"
          >
            Fill with total amount
          </Button>
        )}

        {/* Transactions */}
        <div className="space-y-3 max-h-[45vh] sm:max-h-80 overflow-y-auto -mx-1 px-1">
          {transactions.map((tx, index) => {
            const percentage = getPercentage(tx.amount)
            const txAmount = parseFloat(tx.amount.replace(/\s/g, '')) || 0
            
            return (
              <div key={tx.id} className="bg-secondary/20 rounded-lg p-3 border border-border/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Transaction {index + 1}
                    </span>
                    {txAmount > 0 && (
                      <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                        {percentage.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {transactions.length > 1 && (
                    <button
                      onClick={() => removeTransaction(tx.id)}
                      className="text-red-500 hover:text-red-600 transition-colors p-1.5 -mr-1 active:scale-95"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Visual Slider */}
                {parsedTotal > 0 && (
                  <div className="py-1">
                    <input
                      type="range"
                      min="0"
                      max={parsedTotal}
                      step={parsedTotal / 1000}
                      value={txAmount}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value)
                        updateTransaction(tx.id, 'amount', formatAmount(value.toFixed(2)))
                      }}
                      className="w-full h-3 sm:h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary touch-manipulation"
                      style={{
                        background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${percentage}%, hsl(var(--secondary)) ${percentage}%, hsl(var(--secondary)) 100%)`
                      }}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`amount-${tx.id}`} className="text-[11px] sm:text-xs">Amount</Label>
                    <Input
                      id={`amount-${tx.id}`}
                      type="text"
                      inputMode="decimal"
                      value={tx.amount}
                      onChange={e => updateTransaction(tx.id, 'amount', formatAmount(e.target.value))}
                      placeholder="0"
                      className="h-10 sm:h-9 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`account-${tx.id}`} className="text-[11px] sm:text-xs">Account</Label>
                    <Select
                      id={`account-${tx.id}`}
                      value={tx.account_id}
                      onChange={e => updateTransaction(tx.id, 'account_id', e.target.value)}
                      className="h-10 sm:h-9 text-sm"
                    >
                      <option value="">Select account</option>
                      {accounts.filter(a => a.type === 'cash').map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`category-${tx.id}`} className="text-[11px] sm:text-xs">Category</Label>
                    <Select
                      id={`category-${tx.id}`}
                      value={tx.category_id}
                      onChange={e => updateTransaction(tx.id, 'category_id', e.target.value)}
                      className="h-10 sm:h-9 text-sm"
                    >
                      <option value="">Select category</option>
                      {filteredCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`date-${tx.id}`} className="text-[11px] sm:text-xs">Date</Label>
                    <Input
                      id={`date-${tx.id}`}
                      type="date"
                      value={tx.date}
                      onChange={e => updateTransaction(tx.id, 'date', e.target.value)}
                      className="h-10 sm:h-9 text-sm"
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor={`desc-${tx.id}`} className="text-[11px] sm:text-xs">Description</Label>
                    <Input
                      id={`desc-${tx.id}`}
                      value={tx.description}
                      onChange={e => updateTransaction(tx.id, 'description', e.target.value)}
                      placeholder="e.g., Grocery shopping"
                      className="h-10 sm:h-9 text-sm"
                    />
                  </div>

                  {transactionType === 'expense' && (
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={tx.exclude_from_estimate}
                          onChange={e => updateTransaction(tx.id, 'exclude_from_estimate', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">
                          Exclude from estimate (one-time)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Add Transaction Button */}
        <Button
          type="button"
          variant="outline"
          onClick={addTransaction}
          className="w-full h-11 sm:h-10"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Another Transaction
        </Button>

        {/* Actions */}
        <div className="flex gap-2 sm:gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 h-11 sm:h-10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting}
            className="flex-1 h-11 sm:h-10 text-sm"
          >
            {isSubmitting ? 'Adding...' : `Add ${transactions.length} Transaction${transactions.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
