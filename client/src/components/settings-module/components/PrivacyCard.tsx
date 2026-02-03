import { Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { usePrivacy } from '../../../context/PrivacyContext'

export function PrivacyCard() {
  const {
    defaultPrivacyMode,
    setDefaultPrivacyMode,
    defaultInvestmentPrivacyMode,
    setDefaultInvestmentPrivacyMode
  } = usePrivacy()

  const isHidingBalances =
    defaultPrivacyMode === 'hidden' || defaultInvestmentPrivacyMode === 'hidden'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            {defaultPrivacyMode === 'hidden' ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <CardTitle>Privacy Mode</CardTitle>
            <CardDescription>Control how your financial data is displayed</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-secondary/20">
            <div className="space-y-1">
              <div className="font-medium">Hide balances on startup</div>
              <div className="text-sm text-muted-foreground">
                When enabled, monetary values will be hidden (••••••) when you open the app.
                You can toggle visibility anytime using the eye icon in the header.
              </div>
            </div>
            <button
              onClick={() => {
                const newValue = !isHidingBalances
                if (!newValue) {
                  setDefaultPrivacyMode('visible')
                  setDefaultInvestmentPrivacyMode('visible')
                } else {
                  setDefaultPrivacyMode('hidden')
                }
                localStorage.setItem('finance_last_view', 'settings')
                window.location.reload()
              }}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                isHidingBalances ? 'bg-primary' : 'bg-muted'
              }`}
              role="switch"
              aria-checked={isHidingBalances}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isHidingBalances ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {isHidingBalances && (
            <div className="flex items-center justify-between p-4 rounded-lg border bg-secondary/20 ml-6">
              <div className="space-y-1">
                <div className="font-medium">Hide investments only</div>
                <div className="text-sm text-muted-foreground">
                  Only hide investment-related values (stocks, crypto, net worth).
                  When disabled, all balances will be hidden.
                </div>
              </div>
              <button
                onClick={() => {
                  if (defaultInvestmentPrivacyMode === 'hidden') {
                    setDefaultPrivacyMode('hidden')
                    setDefaultInvestmentPrivacyMode('visible')
                  } else {
                    setDefaultPrivacyMode('visible')
                    setDefaultInvestmentPrivacyMode('hidden')
                  }
                  localStorage.setItem('finance_last_view', 'settings')
                  window.location.reload()
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  defaultInvestmentPrivacyMode === 'hidden' ? 'bg-primary' : 'bg-muted'
                }`}
                role="switch"
                aria-checked={defaultInvestmentPrivacyMode === 'hidden'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    defaultInvestmentPrivacyMode === 'hidden' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="flex items-center gap-2">
              <Eye className="h-3 w-3" />
              <span><strong>Visible:</strong> All values shown normally</span>
            </p>
            <p className="flex items-center gap-2">
              <EyeOff className="h-3 w-3" />
              <span><strong>Hidden:</strong> Values replaced with •••••• for privacy</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
