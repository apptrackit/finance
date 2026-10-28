import { useEffect, useState } from 'react'
import { SettingsSection } from './SettingsSection'
import { MENU_VISIBILITY_EVENT, type MenuKey } from '../constants'
import {
  getStoredMenuVisibility,
  loadNavigationSettings,
  saveNavigationSettings,
  storeMenuVisibility
} from '../settings.storage'
import { useAlert } from '../../../context/AlertContext'

export function NavigationCard() {
  const { showAlert } = useAlert()
  const [menuVisibility, setMenuVisibility] = useState<Record<MenuKey, boolean>>(getStoredMenuVisibility)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    loadNavigationSettings().then((next) => {
      if (isMounted) {
        setMenuVisibility(next)
        setIsLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  const handleToggleMenu = async (key: MenuKey) => {
    if (isLoading || isSaving || key === 'dashboard') return

    const previous = menuVisibility
    const next = { ...menuVisibility, [key]: !menuVisibility[key] }
    setMenuVisibility(next)
    storeMenuVisibility(next)
    window.dispatchEvent(new Event(MENU_VISIBILITY_EVENT))

    setIsSaving(true)
    try {
      const saved = await saveNavigationSettings(next)
      setMenuVisibility(saved)
      window.dispatchEvent(new Event(MENU_VISIBILITY_EVENT))
    } catch (error) {
      setMenuVisibility(previous)
      storeMenuVisibility(previous)
      window.dispatchEvent(new Event(MENU_VISIBILITY_EVENT))
      showAlert({
        type: 'error',
        title: 'Navigation not saved',
        message: error instanceof Error ? error.message : 'Failed to save navigation settings.'
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Navigation"
      description="Hidden sections disappear from desktop and mobile navigation."
    >
      {[
        { key: 'dashboard', label: 'Dashboard', description: 'Always available as the app start page' },
        { key: 'accounts', label: 'Accounts', description: 'Manage, archive, and restore accounts' },
        { key: 'analytics', label: 'Analytics', description: 'Trends, charts, and insights' },
        { key: 'investments', label: 'Investments', description: 'Portfolio and holdings' },
        { key: 'recurring', label: 'Recurring', description: 'Scheduled transactions' }
      ].map((item) => (
        <div key={item.key} className="settings-row">
          <div className="space-y-1">
            <div className="text-sm font-medium">{item.label}</div>
            <div className="text-xs text-muted-foreground">{item.description}</div>
          </div>
          {item.key === 'dashboard' ? (
            <span className="shrink-0 text-xs text-muted-foreground">Always shown</span>
          ) : (
            <button
              onClick={() => handleToggleMenu(item.key as MenuKey)}
              disabled={isLoading || isSaving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                menuVisibility[item.key as MenuKey] ? 'bg-primary' : 'bg-muted'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              role="switch"
              aria-checked={menuVisibility[item.key as MenuKey]}
              aria-label={`Toggle ${item.label}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${
                  menuVisibility[item.key as MenuKey]
                    ? 'translate-x-5 bg-primary-foreground'
                    : 'translate-x-0 bg-foreground'
                }`}
              />
            </button>
          )}
        </div>
      ))}
    </SettingsSection>
  )
}
