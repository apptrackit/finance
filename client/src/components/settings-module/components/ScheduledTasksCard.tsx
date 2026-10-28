import { useState } from 'react'
import { ActionConfirmation } from './ActionConfirmation'
import { Button } from '../../common/button'
import { Clock } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../../../config'
import { useAlert } from '../../../context/AlertContext'

export function ScheduledTasksCard({ active = true }: { active?: boolean }) {
  const { showAlert } = useAlert()
  const [asking, setAsking] = useState(false)
  const [isTestingSchedule, setIsTestingSchedule] = useState(false)

  const handleTestScheduledTask = async () => {
    if (isTestingSchedule) return
    setIsTestingSchedule(true)
    try {
      await apiFetch(`${API_BASE_URL}/test-scheduled-task`, {
        method: 'POST'
      })

      showAlert({
        type: 'success',
        message: 'Scheduled task executed successfully. Check your transactions.'
      })
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('Failed to test scheduled task:', error)
      showAlert({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to execute scheduled task. Please try again.'
      })
    } finally {
      setIsTestingSchedule(false)
    }
  }

  return (
    <div>
      <div className="settings-row">
        <div className="settings-row-copy">
          <p className="settings-row-label">Run recurring schedules now</p>
          <p className="settings-description">
            Creates transactions for schedules due today. This runs automatically every day.
          </p>
        </div>
        <Button onClick={() => setAsking(true)} variant="outline" size="sm" disabled={isTestingSchedule}>
          <Clock className="h-4 w-4" />
          {isTestingSchedule ? 'Processing...' : 'Run now'}
        </Button>
      </div>
      {asking && active && (
        <ActionConfirmation
          title="Run recurring schedules now?"
          message="Process all active schedules and create transactions for those due today?"
          confirmText="Run task"
          busy={isTestingSchedule}
          onCancel={() => setAsking(false)}
          onConfirm={handleTestScheduledTask}
        />
      )}
    </div>
  )
}
