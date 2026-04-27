import { CategoriesCard } from './components/CategoriesCard'
import { CurrencySettingsCard } from './components/CurrencySettingsCard'
import { NavigationCard } from './components/NavigationCard'
import { PrivacyCard } from './components/PrivacyCard'
import { ScheduledTasksCard } from './components/ScheduledTasksCard'
import { CacheManagementCard } from './components/CacheManagementCard'
import { DataExportCard } from './components/DataExportCard'
import { ThemeCard } from './components/ThemeCard'
import { version as APP_VERSION } from '../../../../package.json'
export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ThemeCard />
      <CategoriesCard />
      <CurrencySettingsCard />
      <NavigationCard />
      <PrivacyCard />
      <ScheduledTasksCard />
      <CacheManagementCard />
      <DataExportCard />
      <p className="text-center text-xs text-muted-foreground pb-2">v{APP_VERSION}</p>
    </div>
  )
}

export { getMasterCurrency } from './settings.storage'
