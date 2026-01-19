import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { Sparkles } from 'lucide-react'
import { usePrivacy } from '../../context/PrivacyContext'
import type { SpendingEstimate } from './types'

type SpendingEstimatesProps = {
  weekEstimate: SpendingEstimate | null
  monthEstimate: SpendingEstimate | null
  masterCurrency: string
}

export function SpendingEstimates({ weekEstimate, monthEstimate, masterCurrency }: SpendingEstimatesProps) {
  const { privacyMode } = usePrivacy()

  if (!weekEstimate && !monthEstimate) return null

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
      {weekEstimate && (
        <Card className="border border-border/60 bg-gradient-to-b from-background/60 via-background/30 to-background/10">
          <CardHeader className="pb-2 px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <CardTitle className="text-sm sm:text-base">Next Week Estimate</CardTitle>
                <span className="text-xs text-muted-foreground">Week {weekEstimate.week_of_month} of month</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="space-y-3">
              <div>
                <p className={`text-2xl sm:text-3xl font-bold text-primary ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : `${weekEstimate.estimate_amount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-base sm:text-lg text-muted-foreground">{masterCurrency}</span>
                </p>
                <div className="flex flex-col gap-0.5 mt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Confidence: {weekEstimate.confidence_level}%</span>
                  </div>
                  {weekEstimate.current_period_actual > 0 && (
                    <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                      This week so far: {privacyMode === 'hidden' ? '••••' : weekEstimate.current_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                    </div>
                  )}
                  {weekEstimate.previous_period_actual > 0 && (
                    <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                      Last week: {privacyMode === 'hidden' ? '••••' : weekEstimate.previous_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {monthEstimate && (
        <Card className="border border-border/60 bg-gradient-to-b from-background/60 via-background/30 to-background/10">
          <CardHeader className="pb-2 px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <CardTitle className="text-sm sm:text-base">Next Month Estimate</CardTitle>
                <span className="text-xs text-muted-foreground">Based on historical patterns</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="space-y-3">
              <div>
                <p className={`text-2xl sm:text-3xl font-bold text-primary ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : `${monthEstimate.estimate_amount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-base sm:text-lg text-muted-foreground">{masterCurrency}</span>
                </p>
                <div className="flex flex-col gap-0.5 mt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Confidence: {monthEstimate.confidence_level}%</span>
                  </div>
                  {monthEstimate.current_period_actual > 0 && (
                    <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                      This month so far: {privacyMode === 'hidden' ? '••••' : monthEstimate.current_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                    </div>
                  )}
                  {monthEstimate.previous_period_actual > 0 && (
                    <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                      Last month: {privacyMode === 'hidden' ? '••••' : monthEstimate.previous_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
