import { Modal } from '../../common/modal'
import { Button } from '../../common/button'
import { useSettingsMobile } from '../useSettingsMobile'

// Keep desktop confirmation inline and use the shared focus-trapped sheet on mobile.
export function ActionConfirmation({
  title,
  message,
  confirmText,
  destructive = false,
  busy,
  onCancel,
  onConfirm
}: {
  title: string
  message: string
  confirmText: string
  destructive?: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const mobile = useSettingsMobile()
  const actions = (
    <>
      <Button variant="outline" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      <Button variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm}>
        {busy ? 'Processing...' : confirmText}
      </Button>
    </>
  )
  return mobile ? (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onCancel()
      }}
      title={title}
    >
      <p className="text-sm text-muted-foreground mb-5">{message}</p>
      <div className="flex justify-end gap-2">{actions}</div>
    </Modal>
  ) : (
    <div className="settings-save-bar" role="group" aria-label={title}>
      <p>{message}</p>
      {actions}
    </div>
  )
}
