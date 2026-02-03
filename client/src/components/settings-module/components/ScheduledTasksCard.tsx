import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Button } from '../../common/button'
import { Clock } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../../../config'
import { useAlert } from '../../../context/AlertContext'

export function ScheduledTasksCard() {
  const { showAlert, confirm } = useAlert()
  const [isTestingSchedule, setIsTestingSchedule] = useState(false)

  const handleTestScheduledTask = async () => {
    const confirmed = await confirm({
      title: 'Test Scheduled Task',
      message: 'This will process all active recurring schedules and create transactions for any that are due today. Continue?',
      confirmText: 'Run Task',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    setIsTestingSchedule(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/test-scheduled-task`, {
        method: 'POST'
      })

      if (res.ok) {
        showAlert({
          type: 'success',
          message: 'Scheduled task executed successfully. Check your transactions.'
        })
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        showAlert({
          type: 'error',
          message: 'Failed to execute scheduled task. Please try again.'
        })
      }
    } catch (error) {
      console.error('Failed to test scheduled task:', error)
      showAlert({
        type: 'error',
        message: 'Failed to execute scheduled task. Please try again.'
      })
    } finally {
      setIsTestingSchedule(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Scheduled Tasks</CardTitle>
            <CardDescription>Test recurring schedule processing</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Manually trigger the scheduled task that processes recurring schedules. This will create transactions for any recurring schedules that are due today.
          </p>
        </div>

        <Button
          onClick={handleTestScheduledTask}
          variant="outline"
          className="w-full"
          disabled={isTestingSchedule}
        >
          <Clock className="h-4 w-4 mr-2" />
          {isTestingSchedule ? 'Processing...' : 'Run Scheduled Task'}
        </Button>

        <div className="text-xs text-muted-foreground">
          <p><strong>Note:</strong> This runs the same process that executes automatically daily. It won't create duplicate transactions.</p>
        </div>
      </CardContent>
    </Card>
  )
}
