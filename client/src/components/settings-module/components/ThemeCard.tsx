import { Palette } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { useTheme, THEMES, type ThemeId } from '../../../context/ThemeContext'

export function ThemeCard() {
  const { theme, setTheme } = useTheme()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <Palette className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose a color theme for the app</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <ThemeSwatch
              key={t.id}
              themeId={t.id}
              name={t.name}
              description={t.description}
              primaryColor={t.primaryColor}
              bgColor={t.bgColor}
              cardColor={t.cardColor}
              isSelected={theme === t.id}
              onSelect={setTheme}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface ThemeSwatchProps {
  themeId: ThemeId
  name: string
  description: string
  primaryColor: string
  bgColor: string
  cardColor: string
  isSelected: boolean
  onSelect: (id: ThemeId) => void
}

function ThemeSwatch({ themeId, name, description, primaryColor, bgColor, cardColor, isSelected, onSelect }: ThemeSwatchProps) {
  return (
    <button
      onClick={() => onSelect(themeId)}
      className={`relative flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-secondary/20 hover:border-border/80 hover:bg-secondary/40'
      }`}
    >
      {/* Mini preview */}
      <div
        className="h-16 w-full rounded-lg overflow-hidden"
        style={{ backgroundColor: bgColor }}
      >
        {/* Fake card inside preview */}
        <div
          className="m-1.5 rounded-md p-1.5"
          style={{ backgroundColor: cardColor }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <div className="h-1 w-8 rounded-full opacity-40" style={{ backgroundColor: primaryColor }} />
          </div>
          <div className="h-1 w-12 rounded-full mb-1 opacity-20" style={{ backgroundColor: '#ffffff' }} />
          <div className="h-2 w-10 rounded-full" style={{ backgroundColor: primaryColor, opacity: 0.9 }} />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium leading-none">{name}</div>
        <div className="mt-1 text-xs text-muted-foreground leading-tight">{description}</div>
      </div>

      {isSelected && (
        <div
          className="absolute top-2 right-2 h-4 w-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: primaryColor }}
        >
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
          </svg>
        </div>
      )}
    </button>
  )
}
