import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Button } from '../../common/button'
import { Download } from 'lucide-react'
import { useAlert } from '../../../context/AlertContext'
import { createCSVExport, createJSONExport } from '../data-export'

export function DataExportCard() {
  const { showAlert } = useAlert()
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async (format: 'csv' | 'json') => {
    setIsExporting(true)
    try {
      const content = await (format === 'csv' ? createCSVExport() : createJSONExport())
      const blob = new Blob([content], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;'
      })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      try {
        link.href = url
        link.download = `finance-export-${new Date().toISOString().split('T')[0]}.${format}`
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Export Failed',
        message: error instanceof Error ? error.message : 'Failed to export data. Please try again.'
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
            Download a posted cash ledger as CSV or a versioned archive of your saved app data as JSON.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => handleExport('csv')}
            variant="outline"
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'CSV'}
          </Button>

          <Button
            onClick={() => handleExport('json')}
            variant="outline"
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'JSON'}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>CSV:</strong> Posted cash transactions, including transfer legs and native currencies. Excludes pending/cancelled rows and investment buy/sell history.</p>
          <p><strong>JSON:</strong> Accounts, categories, every transaction state, investment history, recurring schedules, saved app/browser settings, audit logs, and forecast history. Includes durable MCP batch/replay records; excludes expiring proposals and credentials.</p>
          <p>JSON preserves stored values and links. Import and restore are not supported. Exports contain unmasked financial data, including when privacy mode is on.</p>
        </div>
      </CardContent>
    </Card>
  )
}
