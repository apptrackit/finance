import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Settings as SettingsIcon, Save, Download } from 'lucide-react'

const CURRENCIES = [
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
]

const STORAGE_KEY = 'finance_master_currency'

type Account = {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  updated_at: number
}

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  is_recurring: boolean
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

export default function Settings() {
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    // Load saved currency from localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setMasterCurrency(saved)
    }
  }, [])

  const handleSave = () => {
    setIsSaving(true)
    localStorage.setItem(STORAGE_KEY, masterCurrency)
    
    // Simulate save delay for UX
    setTimeout(() => {
      setIsSaving(false)
      // Reload to apply changes
      window.location.reload()
    }, 500)
  }

  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      // Fetch all data
      const [accountsRes, transactionsRes, categoriesRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/transactions'),
        fetch('/api/categories')
      ])

      const accounts: Account[] = await accountsRes.json()
      const transactions: Transaction[] = await transactionsRes.json()
      const categories: Category[] = await categoriesRes.json()

      // Create a map for quick lookups
      const accountMap = new Map(accounts.map(a => [a.id, a]))
      const categoryMap = new Map(categories.map(c => [c.id, c]))

      // Build CSV content
      const headers = ['Date', 'Account', 'Account Currency', 'Category', 'Type', 'Amount', 'Description', 'Recurring']
      const rows = transactions.map(tx => {
        const account = accountMap.get(tx.account_id)
        const category = tx.category_id ? categoryMap.get(tx.category_id) : null
        const type = tx.amount >= 0 ? 'Income' : 'Expense'
        
        return [
          tx.date,
          account?.name || 'Unknown',
          account?.currency || '',
          category?.name || 'Uncategorized',
          type,
          tx.amount.toString(),
          tx.description || '',
          tx.is_recurring ? 'Yes' : 'No'
        ]
      })

      // Escape CSV fields (handle commas and quotes)
      const escapeCSV = (field: string) => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`
        }
        return field
      }

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n')

      // Create download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `finance-export-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export CSV:', error)
      alert('Failed to export data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Configure your finance preferences</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-3">Currency</h3>
              <div className="space-y-2">
                <Label htmlFor="master-currency">Master Currency</Label>
                <Select 
                  id="master-currency"
                  value={masterCurrency} 
                  onChange={e => setMasterCurrency(e.target.value)}
                >
                  {CURRENCIES.map(curr => (
                    <option key={curr.code} value={curr.code}>
                      {curr.name} ({curr.symbol})
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  This currency will be used for net worth, statistics, and all aggregated views. 
                  Accounts in other currencies will be automatically converted.
                </p>
              </div>
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            className="w-full"
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              <Download className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Data Export</CardTitle>
              <CardDescription>Download your financial data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Export all your transactions, accounts, and categories to a CSV file. 
              This file can be opened in Excel, Google Sheets, or any spreadsheet application.
            </p>
          </div>

          <Button 
            onClick={handleExportCSV} 
            className="w-full"
            variant="outline"
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function getMasterCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || 'HUF'
}
