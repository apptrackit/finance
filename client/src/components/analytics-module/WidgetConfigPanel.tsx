import { useEffect } from 'react'
import { X, TrendingUp, BarChart3, Sparkles, ArrowUpCircle, ArrowDownCircle, LineChart, PieChart, Target, Receipt, Layers } from 'lucide-react'
import { WIDGET_DEFS, type WidgetId } from './widgetConfig'

const WIDGET_ICONS: Record<WidgetId, React.ReactNode> = {
  'summary-cards':        <Layers className="h-4 w-4" />,
  'cash-balance-trend':   <TrendingUp className="h-4 w-4" />,
  'cash-balance-forecast':<Sparkles className="h-4 w-4" />,
  'income-chart':         <ArrowUpCircle className="h-4 w-4" />,
  'expenses-chart':       <ArrowDownCircle className="h-4 w-4" />,
  'account-trends':       <LineChart className="h-4 w-4" />,
  'income-breakdown':     <PieChart className="h-4 w-4" />,
  'spending-breakdown':   <PieChart className="h-4 w-4" />,
  'spending-estimates':   <Target className="h-4 w-4" />,
  'top-expenses':         <Receipt className="h-4 w-4" />,
}

interface WidgetConfigPanelProps {
  isOpen: boolean
  onClose: () => void
  visibility: Record<WidgetId, boolean>
  onToggle: (id: WidgetId) => void
  widgetHasData: Record<WidgetId, boolean>
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={e => { e.stopPropagation(); onChange() }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function WidgetConfigPanel({
  isOpen,
  onClose,
  visibility,
  onToggle,
  widgetHasData,
}: WidgetConfigPanelProps) {
  // Close on ESC
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-tight">Customize Analytics</h3>
              <p className="text-xs text-muted-foreground">Toggle widgets on or off</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Widget list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {WIDGET_DEFS.map(widget => {
            const isVisible = visibility[widget.id]
            const hasData = widgetHasData[widget.id]

            return (
              <button
                key={widget.id}
                onClick={() => onToggle(widget.id)}
                className={`w-full text-left rounded-xl border p-3.5 transition-all duration-200 group ${
                  isVisible
                    ? 'bg-background border-border/60 hover:border-primary/40 hover:bg-secondary/30'
                    : 'bg-muted/30 border-border/30 hover:border-border/50 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isVisible
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground/50'
                    }`}
                  >
                    {WIDGET_ICONS[widget.id]}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium transition-colors ${
                          isVisible ? 'text-foreground' : 'text-muted-foreground/60'
                        }`}
                      >
                        {widget.label}
                      </span>
                      {!hasData && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 leading-none">
                          No data
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-0.5 transition-colors leading-relaxed ${
                        isVisible ? 'text-muted-foreground' : 'text-muted-foreground/40'
                      }`}
                    >
                      {widget.description}
                    </p>
                    {widget.note && (
                      <p className={`text-[11px] mt-1 italic transition-colors ${
                        isVisible ? 'text-muted-foreground/70' : 'text-muted-foreground/30'
                      }`}>
                        {widget.note}
                      </p>
                    )}
                  </div>

                  {/* Toggle */}
                  <div className="shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                    <Toggle
                      checked={isVisible}
                      onChange={() => onToggle(widget.id)}
                    />
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border/60 shrink-0">
          <p className="text-xs text-muted-foreground/60 text-center mb-3">
            Changes are saved automatically
          </p>
          <button
            onClick={onClose}
            className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  )
}
