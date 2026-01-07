import { Modal } from './ui/modal'
import { Button } from './ui/button'
import { Split, Plus } from 'lucide-react'

interface AdjustmentChoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSingleTransaction: () => void
  onSplitTransaction: () => void
  adjustmentAmount: number
  currency: string
}

export function AdjustmentChoiceModal({
  isOpen,
  onClose,
  onSingleTransaction,
  onSplitTransaction,
  adjustmentAmount,
  currency
}: AdjustmentChoiceModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Balance Adjustment">
      <div className="space-y-6">
        {/* Info */}
        <div className="bg-secondary/30 rounded-lg p-4 border border-border/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Adjustment Amount:</span>
            <span className={`text-lg font-semibold ${adjustmentAmount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {adjustmentAmount >= 0 ? '+' : ''}{adjustmentAmount.toFixed(2)} {currency}
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          How would you like to record this balance adjustment?
        </p>

        {/* Choice Buttons */}
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={onSingleTransaction}
            className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/5 border-2"
          >
            <Plus className="h-6 w-6" />
            <div className="text-center">
              <div className="font-semibold">Single Adjustment</div>
              <div className="text-xs text-muted-foreground">
                Record as one transaction
              </div>
            </div>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onSplitTransaction}
            className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/5 border-2"
          >
            <Split className="h-6 w-6" />
            <div className="text-center">
              <div className="font-semibold">Split Adjustment</div>
              <div className="text-xs text-muted-foreground">
                Divide into multiple transactions
              </div>
            </div>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="w-full"
        >
          Cancel
        </Button>
      </div>
    </Modal>
  )
}
