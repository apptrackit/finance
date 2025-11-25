import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Settings as SettingsIcon, Save } from 'lucide-react'

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

export default function Settings() {
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  const [isSaving, setIsSaving] = useState(false)

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

  return (
    <div className="max-w-2xl mx-auto">
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
    </div>
  )
}

export function getMasterCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || 'HUF'
}
