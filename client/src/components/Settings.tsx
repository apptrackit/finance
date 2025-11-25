import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Settings as SettingsIcon, Save, Download, Key, Eye, EyeOff, Copy, Check } from 'lucide-react'

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
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInfo, setApiKeyInfo] = useState<{ id: string; name: string; created_at: number; last_used_at?: number } | null>(null)
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [apiEnabled, setApiEnabled] = useState(false)
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    // Load saved currency from localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setMasterCurrency(saved)
    }
    
    // Load API key info
    fetchApiKeyInfo()
  }, [])

  const fetchApiKeyInfo = async () => {
    try {
      const response = await fetch('/api/api-keys')
      const data = await response.json()
      if (data.length > 0) {
        setHasApiKey(true)
        setApiKeyInfo(data[0])
        setApiEnabled(true)
      }
    } catch (error) {
      console.error('Failed to fetch API key info:', error)
    }
  }

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

  const handleExportJSON = async () => {
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

      // Build JSON structure
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        accounts,
        transactions,
        categories,
        settings: {
          masterCurrency: getMasterCurrency()
        }
      }

      // Create download
      const jsonContent = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `finance-export-${new Date().toISOString().split('T')[0]}.json`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export JSON:', error)
      alert('Failed to export data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleSaveApiKey = async () => {
    if (apiKey.length < 16) {
      alert('API key must be at least 16 characters long')
      return
    }
    
    setIsSavingApiKey(true)
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey, name: 'API Key' })
      })
      
      if (response.ok) {
        setHasApiKey(true)
        await fetchApiKeyInfo()
        alert('API key saved successfully')
      } else {
        alert('Failed to save API key')
      }
    } catch (error) {
      console.error('Failed to save API key:', error)
      alert('Failed to save API key')
    } finally {
      setIsSavingApiKey(false)
    }
  }

  const handleGenerateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let key = ''
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setApiKey(key)
  }

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyEndpoint = () => {
    const endpoint = `${window.location.origin}/api/export?api_key=YOUR_API_KEY`
    navigator.clipboard.writeText(endpoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToggleApi = async (enabled: boolean) => {
    if (enabled) {
      setShowWarning(true)
    } else {
      // Warn before disabling
      if (!confirm('Disabling API access will delete all API keys. External applications will no longer be able to access your data. Continue?')) {
        return
      }
      
      // Disable API by deleting all keys
      try {
        const response = await fetch('/api/api-keys')
        const keys = await response.json()
        
        // Delete all keys
        await Promise.all(keys.map((key: { id: string }) => 
          fetch(`/api/api-keys/${key.id}`, { method: 'DELETE' })
        ))
        
        setApiEnabled(false)
        setHasApiKey(false)
        setApiKeyInfo(null)
        setApiKey('')
      } catch (error) {
        console.error('Failed to disable API:', error)
        alert('Failed to disable API access')
      }
    }
  }

  const handleConfirmEnable = () => {
    setApiEnabled(true)
    setShowWarning(false)
    // Clear any existing keys when enabling
    setApiKey('')
    setHasApiKey(false)
    setApiKeyInfo(null)
  }

  const handleCancelEnable = () => {
    setShowWarning(false)
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
              Export all your transactions, accounts, and categories in your preferred format.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={handleExportCSV} 
              variant="outline"
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'CSV'}
            </Button>
            
            <Button 
              onClick={handleExportJSON} 
              variant="outline"
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'JSON'}
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>CSV:</strong> Best for Excel, Google Sheets, and data analysis</p>
            <p><strong>JSON:</strong> Complete backup with all data and settings</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                <Key className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>API Access</CardTitle>
                <CardDescription>Enable external access to your financial data</CardDescription>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={apiEnabled}
                onChange={(e) => handleToggleApi(e.target.checked)}
              />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary peer-focus:ring-offset-2 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showWarning && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-destructive text-sm font-bold">!</span>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-semibold text-destructive">Security Warning</p>
                  <p className="text-xs text-muted-foreground">
                    Enabling API access allows external applications to read ALL your financial data including accounts, transactions, and categories. Only enable this if you:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                    <li>Trust the application that will use this API</li>
                    <li>Understand the security implications</li>
                    <li>Will keep your API key secure and private</li>
                    <li>Know that anyone with your API key can access your data</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleConfirmEnable}
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                >
                  I Understand, Enable API
                </Button>
                <Button 
                  onClick={handleCancelEnable}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!apiEnabled && !showWarning && (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">API access is currently disabled</p>
              <p className="text-xs mt-1">Enable the toggle above to configure API access</p>
            </div>
          )}

          {apiEnabled && !showWarning && (
            <>
          <div className="space-y-3">
            <Label htmlFor="api-key">API Key</Label>
            {hasApiKey && apiKeyInfo ? (
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-sm font-medium mb-1">API Key Active</p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(apiKeyInfo.created_at).toLocaleDateString()}
                  </p>
                  {apiKeyInfo.last_used_at && (
                    <p className="text-xs text-muted-foreground">
                      Last used: {new Date(apiKeyInfo.last_used_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  To update your API key, enter a new one below.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Create an API key to allow external applications to access your financial data.
              </p>
            )}
            
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input 
                    id="api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="Enter or generate API key (min 16 chars)"
                    className="pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1 hover:bg-secondary rounded"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {apiKey && (
                      <button
                        type="button"
                        onClick={handleCopyApiKey}
                        className="p-1 hover:bg-secondary rounded"
                      >
                        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleGenerateApiKey}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Generate Random Key
                </Button>
                <Button 
                  onClick={handleSaveApiKey}
                  size="sm"
                  className="flex-1"
                  disabled={isSavingApiKey || apiKey.length < 16}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSavingApiKey ? 'Saving...' : hasApiKey ? 'Update Key' : 'Save Key'}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">API Endpoint</Label>
              <Button
                onClick={handleCopyEndpoint}
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
              >
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                Copy
              </Button>
            </div>
            <code className="block text-xs bg-secondary/50 p-2 rounded border border-border break-all">
              GET {window.location.origin}/api/export
            </code>
            <p className="text-xs text-muted-foreground">
              Include your API key in the <code className="bg-secondary px-1 rounded">X-API-Key</code> header or as <code className="bg-secondary px-1 rounded">api_key</code> query parameter.
            </p>
          </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function getMasterCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || 'HUF'
}
