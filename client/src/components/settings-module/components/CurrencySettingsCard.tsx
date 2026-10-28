import { useState } from 'react'
import { Button } from '../../common/button'
import { Select } from '../../common/select'
import { CURRENCIES, STORAGE_KEY } from '../constants'
import { getMasterCurrency } from '../settings.storage'
import { useUnsavedChanges } from '../../../navigation/UnsavedChanges'
import { useAlert } from '../../../context/AlertContext'
import { SettingsSection } from './SettingsSection'

export function CurrencySettingsCard() {
  const [savedCurrency, setSavedCurrency] = useState(getMasterCurrency)
  const [masterCurrency, setMasterCurrency] = useState(savedCurrency)
  const [isSaving, setIsSaving] = useState(false)
  const { showAlert } = useAlert()
  const dirty = masterCurrency !== savedCurrency
  useUnsavedChanges(dirty && !isSaving)

  const handleSave = () => {
    if (isSaving || !dirty) return
    setIsSaving(true)
    try {
      localStorage.setItem(STORAGE_KEY, masterCurrency)
      setSavedCurrency(masterCurrency)
      window.location.reload()
    } catch (error) {
      setIsSaving(false)
      showAlert({
        type: 'error',
        title: 'Currency not saved',
        message: error instanceof Error ? error.message : 'Could not save your main currency.'
      })
    }
  }

  return (
    <SettingsSection title="Currency">
      <div className="settings-row">
        <div className="settings-row-copy">
          <label htmlFor="master-currency" className="settings-row-label">
            Main currency
          </label>
          <p className="settings-description">
            Used for net worth, statistics and all totals. Accounts in other currencies are converted.
          </p>
        </div>
        <div className="settings-currency-select">
          <Select
            id="master-currency"
            value={masterCurrency}
            disabled={isSaving}
            onChange={(e) => setMasterCurrency(e.target.value)}
          >
            {CURRENCIES.map((curr) => (
              <option key={curr.code} value={curr.code}>
                {curr.code} — {curr.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {(dirty || isSaving) && (
        <div className="settings-save-bar">
          <p>Totals will be shown in {masterCurrency}. The app reloads after saving.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => setMasterCurrency(savedCurrency)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save currency'}
          </Button>
        </div>
      )}
    </SettingsSection>
  )
}
