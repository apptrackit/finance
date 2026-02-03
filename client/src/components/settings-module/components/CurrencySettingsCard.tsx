import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Button } from '../../common/button'
import { Label } from '../../common/label'
import { Select } from '../../common/select'
import { Save, Settings as SettingsIcon } from 'lucide-react'
import { CURRENCIES, STORAGE_KEY } from '../constants'

export function CurrencySettingsCard() {
  const [masterCurrency, setMasterCurrency] = useState('HUF')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setMasterCurrency(saved)
    }
  }, [])

  const handleSave = () => {
    setIsSaving(true)
    localStorage.setItem(STORAGE_KEY, masterCurrency)

    setTimeout(() => {
      setIsSaving(false)
      window.location.reload()
    }, 500)
  }

  return (
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
  )
}
