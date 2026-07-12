import { useState, useEffect } from 'react'
import { Modal } from '../common/modal'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { Plus, Trash2, AlertCircle, Percent } from 'lucide-react'
import { AmountInput } from '../common/amount-input'
import { formatAmount, formatCalculatedAmount, parseAmount } from '../../lib/amount'

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

export type SplitTransaction = {
  id: string
  description: string
  amount: number
  category_id: string
  date: string
}

type SplitDraft = Omit<SplitTransaction, 'amount'> & { amount: string }

interface SplitTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (splits: SplitTransaction[]) => void
  totalAmount: number
  accountCurrency: string
  categories: Category[]
  defaultDate?: string
}

export function SplitTransactionModal({
  isOpen,
  onClose,
  onConfirm,
  totalAmount,
  accountCurrency,
  categories,
  defaultDate = new Date().toISOString().split('T')[0]
}: SplitTransactionModalProps) {
  const [splits, setSplits] = useState<SplitDraft[]>([
    {
      id: crypto.randomUUID(),
      description: '',
      amount: '',
      category_id: '',
      date: defaultDate
    }
  ])

  // Reset splits when modal opens
  useEffect(() => {
    if (isOpen) {
      setSplits([
        {
          id: crypto.randomUUID(),
          description: '',
          amount: '',
          category_id: '',
          date: defaultDate
        }
      ])
    }
  }, [isOpen, defaultDate])

  const addSplit = () => {
    setSplits([
      ...splits,
      {
        id: crypto.randomUUID(),
        description: '',
        amount: '',
        category_id: '',
        date: defaultDate
      }
    ])
  }

  const removeSplit = (id: string) => {
    if (splits.length > 1) {
      setSplits(splits.filter(s => s.id !== id))
    }
  }

  const updateSplit = (id: string, field: keyof SplitDraft, value: string) => {
    setSplits(splits.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const updateSplitAmount = (id: string, value: number) => {
    // Ensure the amount doesn't exceed remaining budget
    const otherSplitsTotal = splits
      .filter(s => s.id !== id)
      .reduce((sum, s) => sum + (parseAmount(s.amount) || 0), 0)
    
    const maxAmount = Math.max(Math.abs(totalAmount) - Math.abs(otherSplitsTotal), 0)
    const clampedValue = Math.min(Math.abs(value), maxAmount)
    
    setSplits(splits.map(s => s.id === id
      ? { ...s, amount: formatCalculatedAmount(clampedValue, { maximumFractionDigits: 8 }) }
      : s
    ))
  }

  const handleEqualSplit = () => {
    const absoluteTotal = Math.abs(totalAmount)
    const amountPerSplit = absoluteTotal / splits.length
    let allocated = 0

    setSplits(splits.map((s, index) => {
      const value = index === splits.length - 1
        ? absoluteTotal - allocated
        : amountPerSplit
      const amount = formatCalculatedAmount(value, { maximumFractionDigits: 8 })
      allocated += parseAmount(amount) || 0
      return { ...s, amount }
    }))
  }

  const handleAutoBalance = () => {
    // Put all remaining amount into the last split
    if (splits.length > 0) {
      const otherSplitsTotal = splits
        .slice(0, -1)
        .reduce((sum, s) => sum + (parseAmount(s.amount) || 0), 0)
      const remainingForLast = Math.max(Math.abs(totalAmount) - otherSplitsTotal, 0)
      
      setSplits(splits.map((s, idx) => 
        idx === splits.length - 1 
          ? { ...s, amount: formatCalculatedAmount(remainingForLast, { maximumFractionDigits: 8 }) }
          : s
      ))
    }
  }

  
  const direction = totalAmount < 0 ? -1 : 1
  const totalSplitAmount = direction * splits.reduce((sum, split) => sum + (parseAmount(split.amount) || 0), 0)
  const remaining = totalAmount - totalSplitAmount
  const isValid = Math.abs(remaining) < 0.01 && splits.every(s => (parseAmount(s.amount) || 0) > 0)

  const getSplitPercentage = (amount: number) => {
    if (totalAmount === 0) return 0
    return (Math.abs(amount) / Math.abs(totalAmount)) * 100
  }

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(splits.map(split => ({
        ...split,
        amount: direction * (parseAmount(split.amount) || 0)
      })))
      onClose()
    }
  }

  const handleQuickFill = () => {
    if (splits.length === 1 && totalAmount !== 0) {
      setSplits([{
        ...splits[0],
        amount: formatCalculatedAmount(Math.abs(totalAmount), { maximumFractionDigits: 8 })
      }])
    }
  }

  // Determine transaction type based on amount
  const transactionType = totalAmount >= 0 ? 'income' : 'expense'
  const filteredCategories = categories.filter(c => c.type === transactionType)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Split Adjustment">
      <div className="space-y-4 sm:space-y-6">
        {/* Info */}
        <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 border border-border/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
            <span className="text-xs sm:text-sm font-medium">Total Amount:</span>
            <span className={`text-base sm:text-lg font-semibold ${totalAmount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalAmount >= 0 ? '+' : '-'}{formatCalculatedAmount(Math.abs(totalAmount), { maximumFractionDigits: 8 })} {accountCurrency}
            </span>
          </div>
          {Math.abs(remaining) > 0.01 && (
            <div className="flex items-center gap-2 mt-2 text-xs sm:text-sm">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500 flex-shrink-0" />
              <span className="text-orange-500 font-medium">
                Remaining: {remaining >= 0 ? '+' : '-'}{formatCalculatedAmount(Math.abs(remaining), { maximumFractionDigits: 8 })} {accountCurrency}
              </span>
            </div>
          )}
        </div>

        {/* Quick Actions */}
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
          {Math.abs(remaining) > 0.01 && (
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

        {/* Splits */}
        <div className="space-y-3 sm:space-y-4 max-h-[60vh] sm:max-h-96 overflow-y-auto">
          {splits.map((split, index) => {
            const absAmount = parseAmount(split.amount) || 0
            const percentage = getSplitPercentage(absAmount)
            const maxSliderValue = Math.abs(totalAmount)
            
            return (
              <div key={split.id} className="bg-secondary/20 rounded-lg p-3 sm:p-4 border border-border/30 space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">Split {index + 1}</span>
                    <span className="text-xs px-1.5 sm:px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  {splits.length > 1 && (
                    <button
                      onClick={() => removeSplit(split.id)}
                      className="text-red-500 hover:text-red-600 transition-colors p-1 -mr-1 active:scale-95"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Visual Slider */}
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="text-xs">Adjust amount</span>
                    <span className="font-medium text-foreground text-xs sm:text-sm">
                      {totalAmount >= 0 ? '+' : '-'}{formatCalculatedAmount(absAmount, { maximumFractionDigits: 8 })} {accountCurrency}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={maxSliderValue}
                    step={maxSliderValue / 1000}
                    value={absAmount}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value)
                      updateSplitAmount(split.id, totalAmount < 0 ? -value : value)
                    }}
                    className="w-full h-2.5 sm:h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary touch-manipulation"
                    style={{
                      background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${percentage}%, hsl(var(--secondary)) ${percentage}%, hsl(var(--secondary)) 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0</span>
                    <span>{formatAmount(maxSliderValue)} {accountCurrency}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor={`desc-${split.id}`}>Description</Label>
                    <Input
                      id={`desc-${split.id}`}
                      value={split.description}
                      onChange={e => updateSplit(split.id, 'description', e.target.value)}
                      placeholder="e.g., Groceries, Rent, Salary..."
                    />
                  </div>

                  <div>
                    <Label htmlFor={`amount-${split.id}`}>Amount</Label>
                    <AmountInput
                      id={`amount-${split.id}`}
                      step="0.01"
                      value={split.amount}
                      onValueChange={value => {
                        const numericValue = parseAmount(value)
                        const otherSplitsTotal = splits
                          .filter(item => item.id !== split.id)
                          .reduce((sum, item) => sum + (parseAmount(item.amount) || 0), 0)
                        const maxAmount = Math.max(Math.abs(totalAmount) - otherSplitsTotal, 0)

                        if (numericValue !== null && numericValue > maxAmount) {
                          updateSplitAmount(split.id, maxAmount)
                        } else {
                          updateSplit(split.id, 'amount', value)
                        }
                      }}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`category-${split.id}`}>Category</Label>
                    <Select
                      id={`category-${split.id}`}
                      value={split.category_id}
                      onChange={e => updateSplit(split.id, 'category_id', e.target.value)}
                    >
                      <option value="">Select category</option>
                      {filteredCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor={`date-${split.id}`}>Date</Label>
                    <Input
                      id={`date-${split.id}`}
                      type="date"
                      value={split.date}
                      onChange={e => updateSplit(split.id, 'date', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick Fill Button */}
        {splits.length === 1 && totalAmount !== 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleQuickFill}
            className="w-full"
          >
            Fill with total amount
          </Button>
        )}

        {/* Add Split Button */}
        <Button
          type="button"
          variant="outline"
          onClick={addSplit}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Another Split
        </Button>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className="flex-1"
          >
            Confirm Split
          </Button>
        </div>
      </div>
    </Modal>
  )
}
