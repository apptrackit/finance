import { usePrivacy, type PrivacyStartupMode } from '../../../context/PrivacyContext'
import { SettingsSection } from './SettingsSection'

const privacyOptions: Array<{ id: PrivacyStartupMode; label: string }> = [
  { id: 'none', label: 'Nothing' },
  { id: 'all', label: 'Everything' },
  { id: 'networth', label: 'Net worth' }
]

export function PrivacyCard() {
  const { privacyStartupMode, setPrivacyStartupMode } = usePrivacy()
  return (
    <SettingsSection title="Privacy">
      <div className="settings-row settings-privacy-row">
        <div className="settings-row-copy">
          <p className="settings-row-label">Hide on startup</p>
          <p className="settings-description">
            What stays hidden when you open the app. The eye icon in the header shows or hides every value at
            any time.
          </p>
        </div>
        <div className="settings-segments" role="group" aria-label="Privacy setting on startup">
          {privacyOptions.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={privacyStartupMode === id}
              onClick={() => setPrivacyStartupMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="px-4 pb-4 text-xs text-muted-foreground lg:hidden">
        The eye icon in the header shows or hides every value at any time.
      </p>
    </SettingsSection>
  )
}
