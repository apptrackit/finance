import { Eye, EyeOff, Wallet, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { usePrivacy, type PrivacyStartupMode } from '../../../context/PrivacyContext'

const privacyOptions: Array<{
  id: PrivacyStartupMode
  label: string
  description: string
  icon: LucideIcon
}> = [
  { id: 'none', label: 'Nothing', description: 'Show all values', icon: Eye },
  { id: 'all', label: 'Everything', description: 'Hide all financial values', icon: EyeOff },
  { id: 'networth', label: 'Net worth only', description: 'Hide only your net worth', icon: Wallet },
]

export function PrivacyCard() {
  const { privacyStartupMode, setPrivacyStartupMode } = usePrivacy()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            {privacyStartupMode === 'none' ? (
              <Eye className="h-4 w-4 text-muted-foreground" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <CardTitle>Privacy Mode</CardTitle>
            <CardDescription>Control how your financial data is displayed</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 sm:p-4">
          <div className="mb-3">
            <p className="font-medium">Hide on startup</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose what stays private when you open the app.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Privacy setting on startup">
            {privacyOptions.map(({ id, label, description, icon: Icon }) => {
              const selected = privacyStartupMode === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPrivacyStartupMode(id)}
                  className={`rounded-lg border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    selected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/60 bg-background/50 text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  }`}
                >
                  <Icon className={`mb-2 h-4 w-4 ${selected ? 'text-primary' : ''}`} />
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-0.5 block text-xs leading-snug">{description}</span>
                </button>
              )
            })}
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="h-3 w-3" />
          Use the eye icon in the header to temporarily show or hide every value.
        </p>
      </CardContent>
    </Card>
  )
}
