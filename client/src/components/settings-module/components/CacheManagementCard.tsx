import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Button } from '../../common/button'
import { RefreshCw } from 'lucide-react'
import { useAlert } from '../../../context/AlertContext'

export function CacheManagementCard() {
  const { showAlert, confirm } = useAlert()

  const handleClearCacheAndReload = async () => {
    const confirmed = await confirm({
      title: 'Clear Cache & Reload',
      message: 'This will clear all cached data and reload the app. You may need to log in again. Continue?',
      confirmText: 'Clear & Reload',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(registration => registration.unregister()))
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
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Cache Management</CardTitle>
            <CardDescription>Clear cached data and force update</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            If you're not seeing the latest updates after deployment, clear the cache to force a fresh download of all app data.
          </p>
        </div>

        <Button
          onClick={handleClearCacheAndReload}
          variant="outline"
          className="w-full"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Clear Cache & Reload
        </Button>

        <div className="text-xs text-muted-foreground">
          <p><strong>Warning:</strong> This will clear all cached data including stored credentials. You may need to log in again.</p>
        </div>
      </CardContent>
    </Card>
  )
}
