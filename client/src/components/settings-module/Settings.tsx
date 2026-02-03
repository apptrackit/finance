import { CategoriesCard } from './components/CategoriesCard'
import { CurrencySettingsCard } from './components/CurrencySettingsCard'
import { NavigationCard } from './components/NavigationCard'
import { PrivacyCard } from './components/PrivacyCard'
import { ScheduledTasksCard } from './components/ScheduledTasksCard'
import { CacheManagementCard } from './components/CacheManagementCard'
import { DataExportCard } from './components/DataExportCard'

export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
