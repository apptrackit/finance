import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Button } from '../../common/button'
import { Label } from '../../common/label'
import { Select } from '../../common/select'
import { Save, Settings as SettingsIcon } from 'lucide-react'
import { CURRENCIES, STORAGE_KEY } from '../constants'
import { getMasterCurrency } from '../settings.storage'
import { useUnsavedChanges } from '../../../navigation/UnsavedChanges'

export function CurrencySettingsCard() {
  const [savedCurrency, setSavedCurrency] = useState(getMasterCurrency)
  const [masterCurrency, setMasterCurrency] = useState(savedCurrency)
  const [isSaving, setIsSaving] = useState(false)
  useUnsavedChanges(masterCurrency !== savedCurrency && !isSaving)

  const handleSave = () => {
    setIsSaving(true)
    localStorage.setItem(STORAGE_KEY, masterCurrency)
    setSavedCurrency(masterCurrency)

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
