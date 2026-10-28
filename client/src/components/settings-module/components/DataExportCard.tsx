import { useState } from 'react'
import { SettingsSection } from './SettingsSection'
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
    <SettingsSection
      title="Data export"
      description="Exports contain unmasked financial data, including when privacy mode is on."
    >
      {(['csv', 'json'] as const).map((format) => (
        <div className="settings-row settings-export-row" key={format}>
          <span className="settings-export-badge">{format.toUpperCase()}</span>
          <div className="settings-row-copy">
            <p className="settings-row-label">{format === 'csv' ? 'Cash ledger' : 'Full archive'}</p>
            <p className="settings-description">
              {format === 'csv'
                ? 'Posted cash transactions, including transfer legs and native currencies.'
                : 'All saved app data, including history and settings.'}
            </p>
            <p className="settings-description settings-export-detail">
              {format === 'csv'
                ? 'Excludes pending/cancelled rows and investment buy/sell history.'
                : 'Accounts, categories, every transaction state, investment history, recurring schedules, saved app/browser settings, audit logs, and forecast history. Includes durable MCP batch/replay records; excludes expiring proposals and credentials. Preserves stored values and links.'}
            </p>
          </div>
          <Button onClick={() => handleExport(format)} variant="outline" size="sm" disabled={isExporting}>
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : format.toUpperCase()}
          </Button>
        </div>
      ))}
      <p className="settings-footnote px-4 pb-4">Import and restore are not supported.</p>
    </SettingsSection>
  )
}
