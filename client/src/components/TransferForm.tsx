import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Select } from './ui/select'

interface Account {
  id: string
  name: string
  type: string
  balance: number
  currency: string
}

interface TransferFormProps {
  accounts: Account[]
  onTransferComplete: () => void
}

export default function TransferForm({ accounts, onTransferComplete }: TransferFormProps) {
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [fee, setFee] = useState('0')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null)
  const [isLoadingRate, setIsLoadingRate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fromAccount = accounts.find(a => a.id === fromAccountId)
  const toAccount = accounts.find(a => a.id === toAccountId)
  const isDifferentCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency

  // Fetch exchange rate when accounts are selected
  useEffect(() => {
    if (!fromAccount || !toAccount || !isDifferentCurrency) {
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
          setSuggestedRate(data.rate)
          setExchangeRate(data.rate)
        }
      } catch (error) {
        console.error('Failed to fetch exchange rate:', error)
      } finally {
        setIsLoadingRate(false)
      }
    }

    fetchRate()
  }, [fromAccountId, toAccountId, fromAccount, toAccount, isDifferentCurrency])

  // Auto-calculate amountTo when amountFrom or rate changes
  useEffect(() => {
    if (isDifferentCurrency && amountFrom && exchangeRate) {
      const calculated = parseFloat(amountFrom) * exchangeRate
      setAmountTo(calculated.toFixed(2))
    } else if (!isDifferentCurrency && amountFrom) {
      setAmountTo(amountFrom)
    }
  }, [amountFrom, exchangeRate, isDifferentCurrency])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!fromAccountId || !toAccountId || !amountFrom || !amountTo) {
      alert('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: fromAccountId,
          to_account_id: toAccountId,
          amount_from: parseFloat(amountFrom),
          amount_to: parseFloat(amountTo),
          fee: parseFloat(fee) || 0,
          exchange_rate: exchangeRate,
          description: description || undefined,
          date,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Transfer failed')
      }

      // Reset form
      setFromAccountId('')
      setToAccountId('')
      setAmountFrom('')
      setAmountTo('')
      setFee('0')
      setDescription('')
      setDate(new Date().toISOString().split('T')[0])
      setExchangeRate(null)
      setSuggestedRate(null)

      onTransferComplete()
    } catch (error) {
      console.error('Transfer error:', error)
      alert(error instanceof Error ? error.message : 'Failed to create transfer')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExchangeRateChange = (value: string) => {
    const rate = parseFloat(value)
    if (!isNaN(rate) && rate > 0) {
      setExchangeRate(rate)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Between Accounts</CardTitle>
        <CardDescription>Move money from one account to another</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-account">From Account</Label>
              <Select 
                id="from-account"
                value={fromAccountId} 
                onChange={(e) => setFromAccountId(e.target.value)}
              >
                <option value="">Select account</option>
                {accounts
                  .filter(a => a.id !== toAccountId)
                  .map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.balance.toFixed(2)} {account.currency})
                    </option>
                  ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-account">To Account</Label>
              <Select 
                id="to-account"
                value={toAccountId} 
                onChange={(e) => setToAccountId(e.target.value)}
              >
                <option value="">Select account</option>
                {accounts
                  .filter(a => a.id !== fromAccountId)
                  .map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.balance.toFixed(2)} {account.currency})
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount-from">
                Amount to Send {fromAccount && `(${fromAccount.currency})`}
              </Label>
              <Input
                id="amount-from"
                type="number"
                step="0.01"
                value={amountFrom}
                onChange={(e) => setAmountFrom(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount-to">
                Amount to Receive {toAccount && `(${toAccount.currency})`}
              </Label>
              <Input
                id="amount-to"
                type="number"
                step="0.01"
                value={amountTo}
                onChange={(e) => setAmountTo(e.target.value)}
                placeholder="0.00"
                required
                disabled={!isDifferentCurrency}
              />
            </div>
          </div>

          {isDifferentCurrency && (
            <div className="space-y-2 p-4 bg-blue-50 rounded-md border border-blue-200">
              <Label htmlFor="exchange-rate">Exchange Rate</Label>
              {isLoadingRate ? (
                <p className="text-sm text-gray-600">Loading exchange rate...</p>
              ) : (
                <>
                  {suggestedRate && (
                    <p className="text-sm text-gray-600">
                      Suggested: 1 {fromAccount?.currency} = {suggestedRate.toFixed(4)} {toAccount?.currency}
                    </p>
                  )}
                  <Input
                    id="exchange-rate"
                    type="number"
                    step="0.0001"
                    value={exchangeRate || ''}
                    onChange={(e) => handleExchangeRateChange(e.target.value)}
                    placeholder="Enter custom rate"
                  />
                  {exchangeRate && amountFrom && (
                    <p className="text-sm text-gray-600">
                      {amountFrom} {fromAccount?.currency} = {(parseFloat(amountFrom) * exchangeRate).toFixed(2)} {toAccount?.currency}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fee">Fee {fromAccount && `(${fromAccount.currency})`}</Label>
              <Input
                id="fee"
                type="number"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Monthly savings"
            />
          </div>

          {fromAccount && fee && parseFloat(fee) > 0 && (
            <p className="text-sm text-gray-600">
              Total deduction: {(parseFloat(amountFrom || '0') + parseFloat(fee)).toFixed(2)} {fromAccount.currency}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : 'Transfer'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
