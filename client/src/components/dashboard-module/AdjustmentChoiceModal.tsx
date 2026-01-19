import { Modal } from '../common/modal'
import { Button } from '../common/button'
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
      <div className="space-y-4 sm:space-y-6">
        {/* Info */}
        <div className="bg-secondary/30 rounded-lg p-3 sm:p-4 border border-border/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
            <span className="text-xs sm:text-sm font-medium">Adjustment Amount:</span>
            <span className={`text-base sm:text-lg font-semibold ${adjustmentAmount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {adjustmentAmount >= 0 ? '+' : ''}{adjustmentAmount.toFixed(2)} {currency}
            </span>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground text-center">
          How would you like to record this balance adjustment?
        </p>

        {/* Choice Buttons */}
        <div className="space-y-2 sm:space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={onSingleTransaction}
            className="w-full h-auto py-3 sm:py-4 flex flex-col items-center gap-1.5 sm:gap-2 hover:bg-primary/5 border-2 active:scale-[0.98] transition-transform"
          >
            <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
            <div className="text-center">
              <div className="text-sm sm:text-base font-semibold">Single Adjustment</div>
              <div className="text-xs text-muted-foreground">
                Record as one transaction
              </div>
            </div>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onSplitTransaction}
            className="w-full h-auto py-3 sm:py-4 flex flex-col items-center gap-1.5 sm:gap-2 hover:bg-primary/5 border-2 active:scale-[0.98] transition-transform"
          >
            <Split className="h-5 w-5 sm:h-6 sm:w-6" />
            <div className="text-center">
              <div className="text-sm sm:text-base font-semibold">Split Adjustment</div>
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
