import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Settings2, Tag, Wrench } from 'lucide-react'
import { CategoriesCard } from './components/CategoriesCard'
import { CurrencySettingsCard } from './components/CurrencySettingsCard'
import { NavigationCard } from './components/NavigationCard'
import { PrivacyCard } from './components/PrivacyCard'
import { ScheduledTasksCard } from './components/ScheduledTasksCard'
import { CacheManagementCard } from './components/CacheManagementCard'
import { DataExportCard } from './components/DataExportCard'
import { ThemeCard } from './components/ThemeCard'
import { SettingsSection } from './components/SettingsSection'
import { useSettingsMobile } from './useSettingsMobile'
import './settings.css'

type Pane = 'general' | 'categories' | 'data' | 'advanced' | 'navigation'
const areas = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'data', label: 'Data export', icon: Download },
  { id: 'advanced', label: 'Advanced', icon: Wrench }
] as const

export default function Settings() {
  const mobile = useSettingsMobile()
  const [pane, setPane] = useState<Pane>('general')
  const [categoryCount, setCategoryCount] = useState<number | null>(null)
  const mobileDetail = pane === 'categories' || pane === 'navigation'
  return (
    <div className="settings-layout" data-pane={pane}>
      <nav className="settings-sidebar" aria-label="Settings areas">
        <h1>Settings</h1>
        {areas.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={pane === id ? 'page' : undefined}
            onClick={() => setPane(id)}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {id === 'categories' && categoryCount !== null && (
              <span className="settings-count">{categoryCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {mobileDetail && (
          <div className="settings-mobile-back">
            <button type="button" onClick={() => setPane('general')}>
              <ChevronLeft className="h-5 w-5" />
              Settings
            </button>
          </div>
        )}
        <div className="settings-general">
          <ThemeCard />
          <PrivacyCard />
          <CurrencySettingsCard />
          <div className="settings-mobile-links settings-group">
            <button type="button" onClick={() => setPane('navigation')}>
              <span>Navigation</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setPane('categories')}>
              <span>Categories</span>
              <span className="settings-count">{categoryCount ?? '…'}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="settings-navigation">
          <NavigationCard />
        </div>
        <div className="settings-categories">
          <CategoriesCard onCountChange={setCategoryCount} active={pane === 'categories'} />
        </div>
        <div className="settings-data">
          <DataExportCard />
        </div>
        <div className="settings-advanced">
          <SettingsSection
            title="Advanced"
            description="Maintenance tools. You won’t need these in normal use."
          >
            <ScheduledTasksCard active={pane === 'advanced' || (mobile && !mobileDetail)} />
            <CacheManagementCard active={pane === 'advanced' || (mobile && !mobileDetail)} />
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}

export { getMasterCurrency } from './settings.storage'
