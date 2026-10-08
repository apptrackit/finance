import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  subtitleClassName?: string
  initialFocus?: string
  headerClassName?: string
  contentClassName?: string
  children: React.ReactNode
  className?: string
  placement?: 'center' | 'drawer' | 'centered'
}

export function Modal({ isOpen, onClose, title, subtitle, subtitleClassName, initialFocus, headerClassName, contentClassName, children, className, placement = 'center' }: ModalProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    const scroller = document.querySelector<HTMLElement>('.finance-main')
    const previousOverflow = scroller?.style.overflowY || ''
    if (isOpen) {
      if (scroller) scroller.style.overflowY = 'hidden'
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
      if (isOpen && scroller) scroller.style.overflowY = previousOverflow
    }
  }, [isOpen, onClose])

  const titleId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusable = () => [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0)
    ;((initialFocus ? panel?.querySelector<HTMLElement>(initialFocus) : null) || focusable()[0] || panel)?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0], last = elements.at(-1)
      if (!first) { event.preventDefault(); panel?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    panel?.addEventListener('keydown', trap)
    return () => {
      panel?.removeEventListener('keydown', trap)
      if (document.activeElement === document.body || panel?.contains(document.activeElement)) previous?.focus()
    }
  }, [isOpen, initialFocus])
  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 z-[70] flex ${placement === 'centered' ? 'items-center justify-center' : `items-end ${placement === 'drawer' ? 'sm:items-stretch sm:justify-end' : 'sm:items-center sm:justify-center'}`}`} >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1} className={cn(
        "relative bg-card border border-border/50 rounded-xl shadow-2xl",
        "w-full max-w-[calc(100%-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden",
        "mx-2 my-4 sm:m-4 animate-in fade-in-0 zoom-in-95",
        "max-h-[92dvh]",
        placement === 'centered' ? "rounded-xl my-4" : "rounded-b-none sm:rounded-b-xl mb-0",
        placement === 'drawer' && "sm:my-4 sm:mr-4 sm:max-w-[460px] sm:rounded-xl",
        className
      )}>
        {/* Header */}
        {title && (
          <div className={cn("flex shrink-0 items-center justify-between gap-3 p-4 sm:p-6 border-b border-border/50", subtitle && "px-5 py-3 sm:px-6 sm:py-3", headerClassName)}>
            <div className="min-w-0">
              <h2 id={titleId} className={subtitle ? "text-xs text-muted-foreground" : "text-lg sm:text-xl font-semibold text-foreground"}>{title}</h2>
              {subtitle && <p className={cn("mt-0.5 truncate text-[17px] font-semibold tracking-tight", subtitleClassName)}>{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className={subtitle ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" : "text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1"}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        
        {/* Content */}
        <div className={cn("p-4 sm:p-6", contentClassName)}>
          {children}
        </div>
      </div>
    </div>
  )
}
