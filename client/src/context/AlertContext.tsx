/**
 * Custom Alert System
 * 
 * A modern, customizable alert/notification system that replaces native browser alerts.
 * 
 * Usage:
 * 
 * 1. Import the hook:
 *    import { useAlert } from '../context/AlertContext'
 * 
 * 2. Use in component:
 *    const { showAlert, confirm } = useAlert()
 * 
 * 3. Show notifications:
 *    showAlert({
 *      type: 'success' | 'error' | 'warning' | 'info',
 *      title: 'Optional Title',
 *      message: 'Your message here'
 *    })
 * 
 * 4. Show confirmation dialogs:
 *    const confirmed = await confirm({
 *      title: 'Delete Item',
 *      message: 'Are you sure?',
 *      confirmText: 'Delete',
 *      cancelText: 'Cancel'
 *    })
 *    if (confirmed) {
 *      // User clicked confirm
 *    }
 */

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react'
import { Button } from '../components/common/button'

type AlertType = 'info' | 'success' | 'warning' | 'error' | 'confirm'

interface AlertOptions {
  title?: string
  message: string
  type?: AlertType
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void
}

interface Alert extends AlertOptions {
  id: string
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void
  confirm: (options: Omit<AlertOptions, 'type'>) => Promise<boolean>
}

const AlertContext = createContext<AlertContextType | undefined>(undefined)

export function useAlert() {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlert must be used within AlertProvider')
  }
  return context
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([])

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id))
  }

  const showAlert = (options: AlertOptions) => {
    const id = Math.random().toString(36).substring(7)
    const alert: Alert = {
      id,
      type: 'info',
      confirmText: 'OK',
      ...options,
    }
    setAlerts(prev => [...prev, alert])

    // Auto-dismiss non-confirm alerts after 5 seconds
    if (options.type !== 'confirm') {
      setTimeout(() => removeAlert(id), 5000)
    }
  }

  const confirm = (options: Omit<AlertOptions, 'type'>): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).substring(7)
      const alert: Alert = {
        id,
        type: 'confirm',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        ...options,
        onConfirm: async () => {
          if (options.onConfirm) {
            await options.onConfirm()
          }
          removeAlert(id)
          resolve(true)
        },
        onCancel: () => {
          if (options.onCancel) {
            options.onCancel()
          }
          removeAlert(id)
          resolve(false)
        },
      }
      setAlerts(prev => [...prev, alert])
    })
  }

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      case 'confirm':
        return <AlertCircle className="h-5 w-5 text-blue-500" />
      default:
        return <Info className="h-5 w-5 text-blue-500" />
    }
  }

  const getAlertStyles = (type: AlertType) => {
    switch (type) {
      case 'success':
        return 'border-green-500/50 bg-green-500/10'
      case 'error':
        return 'border-red-500/50 bg-red-500/10'
      case 'warning':
        return 'border-yellow-500/50 bg-yellow-500/10'
      case 'confirm':
        return 'border-blue-500/50 bg-blue-500/10'
      default:
        return 'border-blue-500/50 bg-blue-500/10'
    }
  }

  return (
    <AlertContext.Provider value={{ showAlert, confirm }}>
      {children}
      
      {/* Alert Container */}
      <div className="fixed inset-0 z-50 pointer-events-none">
        {/* Backdrop for confirm dialogs */}
        {alerts.some(a => a.type === 'confirm') && (
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
            onClick={() => {
              const confirmAlert = alerts.find(a => a.type === 'confirm')
              if (confirmAlert?.onCancel) {
                confirmAlert.onCancel()
              }
            }}
          />
        )}

        {/* Alerts */}
        <div className="absolute inset-0 flex items-start justify-center p-4 overflow-hidden">
          <div className="w-full max-w-md space-y-3 mt-4">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`pointer-events-auto animate-in slide-in-from-top-5 fade-in duration-300 ${
                  alert.type === 'confirm' ? 'relative' : ''
                }`}
              >
                <div
                  className={`rounded-lg border shadow-lg p-4 ${getAlertStyles(
                    alert.type || 'info'
                  )} backdrop-blur-sm`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getAlertIcon(alert.type || 'info')}
                    </div>
                    <div className="flex-1 min-w-0">
                      {alert.title && (
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          {alert.title}
                        </h3>
                      )}
                      <p className="text-sm text-foreground/90">{alert.message}</p>

                      {/* Action buttons for confirm type */}
                      {alert.type === 'confirm' && (
                        <div className="flex gap-2 mt-4">
                          <Button
                            size="sm"
                            onClick={() => alert.onConfirm?.()}
                            className="flex-1"
                          >
                            {alert.confirmText}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => alert.onCancel?.()}
                            className="flex-1"
                          >
                            {alert.cancelText}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* Close button for non-confirm alerts */}
                    {alert.type !== 'confirm' && (
                      <button
                        onClick={() => removeAlert(alert.id)}
                        className="flex-shrink-0 text-foreground/50 hover:text-foreground transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AlertContext.Provider>
  )
}
