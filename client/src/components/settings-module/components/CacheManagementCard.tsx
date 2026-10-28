import { useState } from 'react'
import { ActionConfirmation } from './ActionConfirmation'
import { Button } from '../../common/button'
import { RefreshCw } from 'lucide-react'
import { useAlert } from '../../../context/AlertContext'

export function CacheManagementCard({ active = true }: { active?: boolean }) {
  const { showAlert } = useAlert()
  const [asking, setAsking] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const handleClearCacheAndReload = async () => {
    if (isClearing) return
    setIsClearing(true)
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }

      localStorage.clear()
      sessionStorage.clear()

      window.location.reload()
    } catch (error) {
      console.error('Failed to clear cache:', error)
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to clear cache. Please try manually clearing your browser cache.'
      })
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="settings-divider">
      <div className="settings-row">
        <div className="settings-row-copy">
          <p className="settings-row-label">Clear cache and reload</p>
          <p className="settings-description">
            Use this if you don’t see the latest version after an update. Clears browser preferences and
            stored credentials, so you may need to log in again.
          </p>
        </div>
        <Button
          onClick={() => setAsking(true)}
          variant="outline"
          size="sm"
          disabled={isClearing}
          className="text-destructive border-destructive/35"
        >
          <RefreshCw className="h-4 w-4" />
          Clear cache
        </Button>
      </div>
      {asking && active && (
        <ActionConfirmation
          title="Clear cache and reload?"
          message="All cached data and browser preferences will be cleared and the app reloads. You may need to log in again."
          confirmText="Clear and reload"
          destructive
          busy={isClearing}
          onCancel={() => setAsking(false)}
          onConfirm={handleClearCacheAndReload}
        />
      )}
    </div>
  )
}
