import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Settings as SettingsIcon, Save, Download, Plus, Trash2, Tag, Pencil, Check, X, Eye, EyeOff } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'
import { usePrivacy } from '../context/PrivacyContext'

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
  
  const { defaultPrivacyMode, setDefaultPrivacyMode } = usePrivacy()
  
  // Category management state
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense')
  const [newCategoryIcon, setNewCategoryIcon] = useState('📌')
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  
  // Edit category state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryType, setEditCategoryType] = useState<'income' | 'expense'>('expense')
  const [editCategoryIcon, setEditCategoryIcon] = useState('📌')
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false)

  useEffect(() => {
    // Load saved currency from localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setMasterCurrency(saved)
    }
    
    // Load categories
    loadCategories()
  }, [])
  
  const loadCategories = async () => {
    try {
      setIsLoadingCategories(true)
      const res = await apiFetch(`${API_BASE_URL}/categories`)
      const data = await res.json()
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setIsLoadingCategories(false)
    }
  }
  
  // Helper function to extract only the first emoji from a string
  const extractSingleEmoji = (str: string): string => {
    // Match emoji unicode characters
    const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu
    const matches = str.match(emojiRegex)
    return matches ? matches[0] : '📌'
  }
  
  // Handle emoji input for new category
  const handleNewIconChange = (value: string) => {
    if (value === '') {
      setNewCategoryIcon('📌')
    } else {
      setNewCategoryIcon(extractSingleEmoji(value))
    }
  }
  
  // Handle emoji input for edit category
  const handleEditIconChange = (value: string) => {
    if (value === '') {
      setEditCategoryIcon('📌')
    } else {
      setEditCategoryIcon(extractSingleEmoji(value))
    }
  }
  
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('Please enter a category name')
      return
    }
    
    setIsAddingCategory(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          type: newCategoryType,
          icon: newCategoryIcon
        })
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create category')
      }
      
      const newCategory = await res.json()
      setCategories([...categories, newCategory])
      
      // Reset form
      setNewCategoryName('')
      setNewCategoryIcon('📌')
      setNewCategoryType('expense')
    } catch (error) {
      console.error('Failed to add category:', error)
      alert(error instanceof Error ? error.message : 'Failed to add category')
    } finally {
      setIsAddingCategory(false)
    }
  }
  
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return
    }
    
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete category')
      }
      
      setCategories(categories.filter(c => c.id !== id))
    } catch (error) {
      console.error('Failed to delete category:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete category')
    }
  }
  
  const handleStartEdit = (category: Category) => {
    setEditingCategoryId(category.id)
    setEditCategoryName(category.name)
    setEditCategoryType(category.type)
    setEditCategoryIcon(category.icon || '📌')
  }
  
  const handleCancelEdit = () => {
    setEditingCategoryId(null)
    setEditCategoryName('')
    setEditCategoryType('expense')
    setEditCategoryIcon('📌')
  }
  
  const handleUpdateCategory = async (id: string) => {
    if (!editCategoryName.trim()) {
      alert('Please enter a category name')
      return
    }
    
    setIsUpdatingCategory(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editCategoryName.trim(),
          type: editCategoryType,
          icon: editCategoryIcon
        })
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update category')
      }
      
      const updatedCategory = await res.json()
      setCategories(categories.map(c => c.id === id ? updatedCategory : c))
      
      // Reset edit state
      handleCancelEdit()
    } catch (error) {
      console.error('Failed to update category:', error)
      alert(error instanceof Error ? error.message : 'Failed to update category')
    } finally {
      setIsUpdatingCategory(false)
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
        apiFetch(`${API_BASE_URL}/accounts`),
        apiFetch(`${API_BASE_URL}/transactions`),
        apiFetch(`${API_BASE_URL}/categories`)
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
        apiFetch(`${API_BASE_URL}/accounts`),
        apiFetch(`${API_BASE_URL}/transactions`),
        apiFetch(`${API_BASE_URL}/categories`)
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

  const incomeCategories = categories.filter(c => c.type === 'income')
  const expenseCategories = categories.filter(c => c.type === 'expense')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              <Tag className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Manage your income and expense categories</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add New Category */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Add New Category</h3>
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-end">
              <div className="space-y-2">
                <Label htmlFor="category-icon">Icon</Label>
                <button
                  type="button"
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector('input')
                    if (input) {
                      input.focus()
                      input.click()
                    }
                  }}
                  className="w-16 h-10 rounded-md border border-input bg-background text-center text-2xl hover:bg-accent cursor-pointer flex items-center justify-center"
                >
                  <Input
                    id="category-icon"
                    type="text"
                    inputMode="none"
                    value={newCategoryIcon}
                    onChange={e => handleNewIconChange(e.target.value)}
                    onFocus={e => {
                      e.target.setAttribute('inputmode', 'text')
                      // Trigger emoji picker on mobile
                      if ('virtualKeyboard' in navigator) {
                        (navigator as any).virtualKeyboard.show()
                      }
                    }}
                    className="w-full h-full text-center text-2xl border-0 bg-transparent p-0 focus:ring-0 focus:outline-none cursor-pointer"
                    style={{ caretColor: 'transparent' }}
                  />
                </button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-name">Name</Label>
                <Input
                  id="category-name"
                  type="text"
                  placeholder="e.g., Dining Out"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-type">Type</Label>
                <Select
                  id="category-type"
                  value={newCategoryType}
                  onChange={e => setNewCategoryType(e.target.value as 'income' | 'expense')}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </Select>
              </div>
              <Button 
                onClick={handleAddCategory}
                disabled={isAddingCategory || !newCategoryName.trim()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </div>

          {/* Income Categories */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-green-600">Income Categories</h3>
            {isLoadingCategories ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : incomeCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No income categories yet</p>
            ) : (
              <div className="space-y-2">
                {incomeCategories.map(category => (
                  editingCategoryId === category.id ? (
                    // Edit mode
                    <div
                      key={category.id}
                      className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center p-3 rounded-lg border bg-accent"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input')
                          if (input) {
                            input.focus()
                            input.click()
                          }
                        }}
                        className="w-14 h-10 rounded-md border border-input bg-background text-center text-2xl hover:bg-accent cursor-pointer flex items-center justify-center"
                      >
                        <Input
                          type="text"
                          inputMode="none"
                          value={editCategoryIcon}
                          onChange={e => handleEditIconChange(e.target.value)}
                          onFocus={e => {
                            e.target.setAttribute('inputmode', 'text')
                            if ('virtualKeyboard' in navigator) {
                              (navigator as any).virtualKeyboard.show()
                            }
                          }}
                          className="w-full h-full text-center text-2xl border-0 bg-transparent p-0 focus:ring-0 focus:outline-none cursor-pointer"
                          style={{ caretColor: 'transparent' }}
                        />
                      </button>
                      <Input
                        type="text"
                        value={editCategoryName}
                        onChange={e => setEditCategoryName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(category.id)}
                      />
                      <Select
                        value={editCategoryType}
                        onChange={e => setEditCategoryType(e.target.value as 'income' | 'expense')}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdateCategory(category.id)}
                        disabled={isUpdatingCategory}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={isUpdatingCategory}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    // View mode
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{category.icon}</span>
                        <span className="font-medium">{category.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(category)}
                          className="hover:bg-accent"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCategory(category.id, category.name)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Expense Categories */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-red-600">Expense Categories</h3>
            {isLoadingCategories ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : expenseCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expense categories yet</p>
            ) : (
              <div className="space-y-2">
                {expenseCategories.map(category => (
                  editingCategoryId === category.id ? (
                    // Edit mode
                    <div
                      key={category.id}
                      className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center p-3 rounded-lg border bg-accent"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input')
                          if (input) {
                            input.focus()
                            input.click()
                          }
                        }}
                        className="w-14 h-10 rounded-md border border-input bg-background text-center text-2xl hover:bg-accent cursor-pointer flex items-center justify-center"
                      >
                        <Input
                          type="text"
                          inputMode="none"
                          value={editCategoryIcon}
                          onChange={e => handleEditIconChange(e.target.value)}
                          onFocus={e => {
                            e.target.setAttribute('inputmode', 'text')
                            if ('virtualKeyboard' in navigator) {
                              (navigator as any).virtualKeyboard.show()
                            }
                          }}
                          className="w-full h-full text-center text-2xl border-0 bg-transparent p-0 focus:ring-0 focus:outline-none cursor-pointer"
                          style={{ caretColor: 'transparent' }}
                        />
                      </button>
                      <Input
                        type="text"
                        value={editCategoryName}
                        onChange={e => setEditCategoryName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(category.id)}
                      />
                      <Select
                        value={editCategoryType}
                        onChange={e => setEditCategoryType(e.target.value as 'income' | 'expense')}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdateCategory(category.id)}
                        disabled={isUpdatingCategory}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={isUpdatingCategory}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    // View mode
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{category.icon}</span>
                        <span className="font-medium">{category.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(category)}
                          className="hover:bg-accent"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCategory(category.id, category.name)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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

      {/* Privacy Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              {defaultPrivacyMode === 'hidden' ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <CardTitle>Privacy Mode</CardTitle>
              <CardDescription>Control how your financial data is displayed</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-secondary/20">
              <div className="space-y-1">
                <div className="font-medium">Hide values on startup</div>
                <div className="text-sm text-muted-foreground">
                  When enabled, all monetary values will be hidden (••••••) when you open the app.
                  You can toggle visibility anytime using the eye icon in the header.
                </div>
              </div>
              <button
                onClick={() => setDefaultPrivacyMode(defaultPrivacyMode === 'hidden' ? 'visible' : 'hidden')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  defaultPrivacyMode === 'hidden' ? 'bg-primary' : 'bg-muted'
                }`}
                role="switch"
                aria-checked={defaultPrivacyMode === 'hidden'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    defaultPrivacyMode === 'hidden' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-2">
                <Eye className="h-3 w-3" />
                <span><strong>Visible:</strong> All values shown normally</span>
              </p>
              <p className="flex items-center gap-2">
                <EyeOff className="h-3 w-3" />
                <span><strong>Hidden:</strong> Values replaced with •••••• for privacy</span>
              </p>
            </div>
          </div>
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
    </div>
  )
}

export function getMasterCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || 'HUF'
}
