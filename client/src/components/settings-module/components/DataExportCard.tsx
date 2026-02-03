import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Button } from '../../common/button'
import { Download } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../../../config'
import { useAlert } from '../../../context/AlertContext'
import { getMasterCurrency } from '../settings.storage'
import type { Account, Category, Transaction } from '../types'

export function DataExportCard() {
  const { showAlert } = useAlert()
  const [isExporting, setIsExporting] = useState(false)

  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      const [accountsRes, transactionsRes, categoriesRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/accounts`),
        apiFetch(`${API_BASE_URL}/transactions`),
        apiFetch(`${API_BASE_URL}/categories`)
      ])

      const accounts: Account[] = await accountsRes.json()
      const transactions: Transaction[] = await transactionsRes.json()
      const categories: Category[] = await categoriesRes.json()

      const accountMap = new Map(accounts.map(a => [a.id, a]))
      const categoryMap = new Map(categories.map(c => [c.id, c]))

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
      showAlert({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export data. Please try again.'
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportJSON = async () => {
    setIsExporting(true)
    try {
      const [accountsRes, transactionsRes, categoriesRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/accounts`),
        apiFetch(`${API_BASE_URL}/transactions`),
        apiFetch(`${API_BASE_URL}/categories`)
      ])

      const accounts: Account[] = await accountsRes.json()
      const transactions: Transaction[] = await transactionsRes.json()
      const categories: Category[] = await categoriesRes.json()

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
      showAlert({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export data. Please try again.'
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
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
  )
}
