import * as React from "react"
import { X } from "lucide-react"
import { AnimatePresence, MotionGlobalConfig, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion"
import { cn } from "../../lib/utils"
import { useMediaQuery } from "../../hooks/useMediaQuery"

/** Apple's scroll-deceleration projection: where a flick would come to rest. */
const projectMomentum = (velocity: number, deceleration = 0.998) => (velocity / 1000) * deceleration / (1 - deceleration)
const SHEET_SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const
const FADE = { duration: 0.2, ease: "easeOut" } as const

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: React.ReactNode
  subtitleClassName?: string
  headerLeading?: React.ReactNode
  initialFocus?: string
  headerClassName?: string
  contentClassName?: string
  children: React.ReactNode
  className?: string
  placement?: 'center' | 'drawer' | 'centered'
}

export function Modal({ isOpen, onClose, title, subtitle, subtitleClassName, headerLeading, initialFocus, headerClassName, contentClassName, children, className, placement = 'center' }: ModalProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (document.querySelector('[role="alertdialog"]')) return
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
  const reduceMotion = useReducedMotion()
  const compact = useMediaQuery('(max-width: 639px)')
  const sheet = compact && placement !== 'centered'
  const drawer = !compact && placement === 'drawer'
  const dragControls = useDragControls()
  const startDrag = (event: React.PointerEvent) => { if (sheet && !reduceMotion) dragControls.start(event) }
  const endDrag = (_: unknown, info: PanInfo) => {
    const height = panelRef.current?.offsetHeight ?? window.innerHeight
    if (info.offset.y + projectMomentum(info.velocity.y) > height * 0.4) onClose()
  }
  // With animations skipped globally (tests), mount and unmount in the same tick.
  const instant = MotionGlobalConfig.skipAnimations === true
  const Presence = instant ? React.Fragment : AnimatePresence
  // Sheets rise from the bottom edge and leave the same way; dialogs settle in place; drawers slide from the side.
  const motionProps = instant ? {} : reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : sheet
      ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: SHEET_SPRING }
      : drawer
        ? { initial: { x: 32, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 32, opacity: 0 }, transition: FADE }
        : { initial: { scale: 0.96, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.98, opacity: 0 }, transition: FADE }

  return (
    <Presence>
    {isOpen && (
    <div key="modal" className={`fixed inset-0 z-[70] flex ${placement === 'centered' ? 'items-center justify-center' : `items-end ${placement === 'drawer' ? 'sm:items-stretch sm:justify-end' : 'sm:items-center sm:justify-center'}`}`} >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        {...(instant ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: FADE })}
      />

      {/* Modal */}
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1}
        {...motionProps}
        drag={sheet && !reduceMotion ? 'y' : false} dragListener={false} dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.8 }} dragMomentum={false} onDragEnd={endDrag}
        className={cn(
        "relative bg-card border border-border/50 rounded-xl shadow-2xl",
        "w-full max-w-[calc(100%-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden",
        "mx-2 my-4 sm:m-4",
        "max-h-[92dvh]",
        placement === 'centered' ? "rounded-xl my-4" : "rounded-b-none rounded-t-[20px] sm:rounded-b-xl sm:rounded-t-xl mb-0",
        placement === 'drawer' && "sm:my-4 sm:mr-4 sm:max-w-[460px] sm:rounded-xl",
        sheet && "mx-0 max-w-full pb-[env(safe-area-inset-bottom)]",
        className
      )}>
        {sheet && (
          <div aria-hidden="true" onPointerDown={startDrag} className="sticky top-0 z-10 -mb-2 flex h-5 cursor-grab touch-none items-center justify-center bg-card">
            <span className="h-[5px] w-9 rounded-full bg-muted-foreground/40" />
          </div>
        )}
        {/* Header */}
        {title && (
          <div onPointerDown={startDrag} className={cn("flex shrink-0 items-center justify-between gap-3 p-4 sm:p-6 border-b border-border/50", sheet && "touch-none", subtitle && "px-5 py-3 sm:px-6 sm:py-3", headerClassName)}>
            {headerLeading}
            <div className="min-w-0 flex-1">
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
      </motion.div>
    </div>
    )}
    </Presence>
  )
}
