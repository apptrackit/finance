import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Settings as SettingsIcon } from 'lucide-react'
import { DEFAULT_MENU_VISIBILITY, MENU_STORAGE_KEY, type MenuKey } from '../constants'
import { useAlert } from '../../../context/AlertContext'

export function NavigationCard() {
  const { showAlert } = useAlert()
  const [menuVisibility, setMenuVisibility] = useState<Record<MenuKey, boolean>>(DEFAULT_MENU_VISIBILITY)

  useEffect(() => {
    const savedMenus = localStorage.getItem(MENU_STORAGE_KEY)
    if (savedMenus) {
      try {
        const parsed = JSON.parse(savedMenus) as Partial<Record<MenuKey, boolean>>
        setMenuVisibility({ ...DEFAULT_MENU_VISIBILITY, ...parsed })
      } catch (error) {
        console.error('Failed to parse menu visibility settings:', error)
      }
    }
  }, [])

  const handleToggleMenu = (key: MenuKey) => {
    const enabledMenus = Object.values(menuVisibility).filter(Boolean).length
    if (menuVisibility[key] && enabledMenus === 1) {
      showAlert({
        type: 'warning',
        title: 'Keep at least one menu',
        message: 'You need at least one menu visible in the navigation.'
      })
      return
    }

    const next = { ...menuVisibility, [key]: !menuVisibility[key] }
    setMenuVisibility(next)
    localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(next))
    localStorage.setItem('finance_last_view', 'settings')
    window.dispatchEvent(new Event('finance:menu-visibility'))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Navigation</CardTitle>
            <CardDescription>Choose which sections appear in the top menu</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { key: 'dashboard', label: 'Dashboard', description: 'Accounts and transactions overview' },
            { key: 'analytics', label: 'Analytics', description: 'Trends, charts, and insights' },
            { key: 'investments', label: 'Investments', description: 'Portfolio and holdings' },
            { key: 'recurring', label: 'Recurring', description: 'Scheduled transactions' },
            { key: 'budget', label: 'Budget', description: 'Monthly and yearly plans' }
          ].map(item => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-3"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.description}</div>
              </div>
              <button
                onClick={() => handleToggleMenu(item.key as MenuKey)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  menuVisibility[item.key as MenuKey] ? 'bg-primary' : 'bg-muted'
                }`}
                role="switch"
                aria-checked={menuVisibility[item.key as MenuKey]}
                aria-label={`Toggle ${item.label}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    menuVisibility[item.key as MenuKey] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Changes apply instantly and will hide the menu from the top navigation.
        </p>
      </CardContent>
    </Card>
  )
}
