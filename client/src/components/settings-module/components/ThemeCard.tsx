import { SettingsSection } from './SettingsSection'
import { useTheme, THEMES, type ThemeId } from '../../../context/ThemeContext'

export function ThemeCard() {
  const { theme, setTheme, colorMode, setColorMode } = useTheme()

  return (
    <SettingsSection title="Appearance">
      <div className="settings-row">
        <div>
          <p className="text-sm font-medium">Display mode</p>
          <p className="text-xs text-muted-foreground">Applies to every theme</p>
        </div>
        <div className="settings-segments" role="group" aria-label="Display mode">
          {(['dark', 'light'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={colorMode === mode}
              onClick={() => setColorMode(mode)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${colorMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-divider p-4 lg:px-5 lg:pb-5">
        <p className="settings-row-label">Color theme</p>
        <p className="settings-description mb-3">Choose the colors used throughout the app.</p>
        <div className="settings-themes">
          {THEMES.map((t) => {
            const preview = colorMode === 'light' ? t.lightPreview : t
            return (
              <ThemeSwatch
                key={t.id}
                themeId={t.id}
                name={t.name}
                description={t.description}
                primaryColor={preview.primaryColor}
                bgColor={preview.bgColor}
                cardColor={preview.cardColor}
                foregroundColor={preview.foregroundColor}
                primaryForegroundColor={preview.primaryForegroundColor}
                isSelected={theme === t.id}
                onSelect={setTheme}
              />
            )
          })}
        </div>
      </div>
    </SettingsSection>
  )
}

interface ThemeSwatchProps {
  themeId: ThemeId
  name: string
  description: string
  primaryColor: string
  bgColor: string
  cardColor: string
  foregroundColor: string
  primaryForegroundColor: string
  isSelected: boolean
  onSelect: (id: ThemeId) => void
}

function ThemeSwatch({
  themeId,
  name,
  description,
  primaryColor,
  bgColor,
  cardColor,
  foregroundColor,
  primaryForegroundColor,
  isSelected,
  onSelect
}: ThemeSwatchProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(themeId)}
      className={`settings-theme relative flex flex-col gap-2 rounded-xl border text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-secondary/20 hover:border-border/80 hover:bg-secondary/40'
      }`}
    >
      {/* Each swatch previews its own palette, independent of the selected theme. */}
      <div
        className="h-16 w-full rounded-lg overflow-hidden relative"
        style={{
          backgroundColor: bgColor
        }}
      >
        <div className="m-1.5 rounded-md p-1.5" style={{ backgroundColor: cardColor }}>
          <div className="flex items-center gap-1 mb-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <div className="h-1 w-8 rounded-full opacity-40" style={{ backgroundColor: primaryColor }} />
          </div>
          <div
            className="h-1 w-12 rounded-full mb-1 opacity-20"
            style={{ backgroundColor: foregroundColor }}
          />
          <div className="h-2 w-10 rounded-full" style={{ backgroundColor: primaryColor, opacity: 0.9 }} />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium leading-none">{name}</div>
        <div className="settings-theme-description mt-1 text-xs text-muted-foreground leading-tight">
          {description}
        </div>
      </div>

      {isSelected && (
        <div
          className="absolute top-2 right-2 h-4 w-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: primaryColor }}
        >
          <svg
            className="h-2.5 w-2.5"
            style={{ color: primaryForegroundColor }}
            fill="none"
            viewBox="0 0 12 12"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
          </svg>
        </div>
      )}
    </button>
  )
}
