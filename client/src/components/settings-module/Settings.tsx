import { CategoriesCard } from './components/CategoriesCard'
import { CurrencySettingsCard } from './components/CurrencySettingsCard'
import { NavigationCard } from './components/NavigationCard'
import { PrivacyCard } from './components/PrivacyCard'
import { ScheduledTasksCard } from './components/ScheduledTasksCard'
import { CacheManagementCard } from './components/CacheManagementCard'
import { DataExportCard } from './components/DataExportCard'
import { ThemeCard } from './components/ThemeCard'
export default function Settings() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 items-start">
      <ThemeCard />
      <CategoriesCard />
      <CurrencySettingsCard />
      <NavigationCard />
      <PrivacyCard />
      <ScheduledTasksCard />
      <CacheManagementCard />
      <DataExportCard />
    </div>
  )
}

export { getMasterCurrency } from './settings.storage'
